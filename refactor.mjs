#!/usr/bin/env node

/**
 * P0-D.1 — Harden revision/CAS conflict and revision-advance invariants.
 *
 * Audited base:
 *   fb9d58af977c0610cb9dfc22c352510430b27252
 *
 * Usage:
 *   node refactor.mjs --check
 *   node refactor.mjs --apply
 *   node refactor.mjs --apply D:/xiaojianc/hybrid-canvas
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const check = argv.includes('--check')
const rootArgument = argv.find(
  (argument) => !argument.startsWith('--'),
)
const root = resolve(rootArgument ?? process.cwd())

if (apply && check) {
  fail('Use either --check or --apply, not both.')
}

if (!apply && !check) {
  fail('Missing mode. Use --check or --apply.')
}

const paths = {
  packageJson: join(root, 'package.json'),

  documentCommand: join(
    root,
    'apps/desktop/src-tauri/src/commands/document.rs',
  ),

  serviceTest: join(
    root,
    'tests/cross-domain-contract/document-lifecycle/canvas-document-service.test.ts',
  ),
}

function fail(message) {
  console.error(
    `\nP0-D.1 CAS hardening failed:\n${message}\n`,
  )
  process.exitCode = 1
}

async function exists(path) {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function count(source, fragment) {
  return source.split(fragment).length - 1
}

function replaceOnce(
  source,
  oldText,
  newText,
  description,
) {
  const occurrences = count(source, oldText)

  if (occurrences !== 1) {
    throw new Error(
      [
        `Unexpected source count: ${description}`,
        'Expected: 1',
        `Actual: ${occurrences}`,
        'Refusing an ambiguous or partial modification.',
      ].join('\n'),
    )
  }

  return source.replace(oldText, newText)
}

function insertBeforeOnce(
  source,
  marker,
  content,
  description,
) {
  return replaceOnce(
    source,
    marker,
    `${content}${marker}`,
    description,
  )
}

function updateDocumentCommand(source) {
  if (
    !source.includes(
      'fn save_existing(',
    ) ||
    !source.includes(
      'expected_revision: &str',
    ) ||
    !source.includes(
      'Error::FileConflict(',
    )
  ) {
    throw new Error(
      [
        'The revision/CAS implementation was not found.',
        'Expected repository state after fb9d58a.',
      ].join('\n'),
    )
  }

  let next = source

  const oldDiskRead = `        let disk_bytes = std::fs::read(&handle.path)?;
        ensure_document_size(disk_bytes.len() as u64)?;`

  const newDiskRead = `        let disk_bytes = match std::fs::read(&handle.path) {
            Ok(bytes) => bytes,
            Err(error)
                if error.kind() == std::io::ErrorKind::NotFound =>
            {
                /*
                 * An opened document disappearing from disk is an external
                 * state change. Recreating it through ordinary Save would
                 * silently discard the deletion decision.
                 */
                return Err(Error::FileConflict(
                    "document was removed outside Canvas".into(),
                ));
            }
            Err(error) => return Err(error.into()),
        };

        ensure_document_size(disk_bytes.len() as u64)?;`

  if (!next.includes(newDiskRead)) {
    next = replaceOnce(
      next,
      oldDiskRead,
      newDiskRead,
      'map external deletion to file conflict',
    )
  }

  if (!next.includes('fn valid_document(')) {
    next = insertBeforeOnce(
      next,
      `    #[test]
    fn registry_keeps_path_private_behind_document_id() {`,
      `    fn valid_document(marker: &str) -> String {
        format!(
            r#"{{
                "header": {{
                    "format": "hybrid-canvas/draw",
                    "version": 1,
                    "createdAt": "2026-07-23T00:00:00.000Z"
                }},
                "content": {{
                    "document": {{}},
                    "session": {{}},
                    "marker": "{marker}"
                }}
            }}"#,
        )
    }

`,
      'add valid CAS document fixture',
    )
  }

  if (
    !next.includes(
      'fn rejects_stale_renderer_revision_before_writing()',
    )
  ) {
    next = insertBeforeOnce(
      next,
      `    #[test]
    fn rejects_save_when_disk_revision_changed() {`,
      `    #[test]
    fn rejects_stale_renderer_revision_before_writing() {
        let directory =
            tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("stale.draw");
        let original = valid_document("original");

        std::fs::write(&path, &original)
            .expect("fixture should be written");

        let current_revision =
            document_revision(original.as_bytes());

        let registry = DocumentRegistry::default();
        let document_id = registry
            .insert(path.clone(), current_revision)
            .expect("document should register");

        let replacement = valid_document("replacement");

        let result = registry.save_existing(
            document_id,
            "stale-renderer-revision",
            &replacement,
        );

        assert!(matches!(result, Err(Error::FileConflict(_))));
        assert_eq!(
            std::fs::read_to_string(&path)
                .expect("original file should remain readable"),
            original,
        );
    }

    #[test]
    fn rejects_save_when_document_was_removed_externally() {
        let directory =
            tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("removed.draw");
        let original = valid_document("original");

        std::fs::write(&path, &original)
            .expect("fixture should be written");

        let current_revision =
            document_revision(original.as_bytes());

        let registry = DocumentRegistry::default();
        let document_id = registry
            .insert(
                path.clone(),
                current_revision.clone(),
            )
            .expect("document should register");

        std::fs::remove_file(&path)
            .expect("external deletion should succeed");

        let replacement = valid_document("replacement");

        let result = registry.save_existing(
            document_id,
            &current_revision,
            &replacement,
        );

        assert!(matches!(result, Err(Error::FileConflict(_))));
        assert!(!path.exists());
    }

    #[test]
    fn successful_save_advances_revision_and_rejects_old_revision() {
        let directory =
            tempfile::tempdir().expect("temporary directory");
        let path = directory.path().join("advance.draw");
        let original = valid_document("original");

        std::fs::write(&path, &original)
            .expect("fixture should be written");

        let original_revision =
            document_revision(original.as_bytes());

        let registry = DocumentRegistry::default();
        let document_id = registry
            .insert(
                path.clone(),
                original_revision.clone(),
            )
            .expect("document should register");

        let replacement = valid_document("replacement");

        let next_revision = registry
            .save_existing(
                document_id,
                &original_revision,
                &replacement,
            )
            .expect("first CAS save should succeed");

        assert_ne!(next_revision, original_revision);

        let stored_bytes = std::fs::read(&path)
            .expect("saved file should be readable");

        assert_eq!(
            document_revision(&stored_bytes),
            next_revision,
        );

        let second_replacement =
            valid_document("second-replacement");

        let stale_result = registry.save_existing(
            document_id,
            &original_revision,
            &second_replacement,
        );

        assert!(matches!(
            stale_result,
            Err(Error::FileConflict(_)),
        ));

        assert_eq!(
            document_revision(
                &std::fs::read(&path)
                    .expect("saved file should remain readable"),
            ),
            next_revision,
        );
    }

`,
      'add complete native CAS regression coverage',
    )
  }

  const oldConflictFixture = `        let original = r#"{\\"format\\":\\"hybrid-canvas/draw\\",\\"version\\":1,\\"content\\":{}}"#;`

  if (next.includes(oldConflictFixture)) {
    next = replaceOnce(
      next,
      oldConflictFixture,
      `        let original = valid_document("original");`,
      'use valid logical document in conflict test',
    )
  }

  if (
    !next.includes(
      'fn rejects_save_when_disk_revision_changed()',
    ) ||
    !next.includes(
      'fn rejects_save_when_document_was_removed_externally()',
    ) ||
    !next.includes(
      'fn successful_save_advances_revision_and_rejects_old_revision()',
    )
  ) {
    throw new Error(
      'Native CAS regression tests were not installed.',
    )
  }

  return next
}

function updateServiceTest(source) {
  if (
    !source.includes(
      `'revision-current',
      expect.any(String),`,
    )
  ) {
    throw new Error(
      [
        'Renderer revision/CAS test baseline was not found.',
        'Expected repository state after fb9d58a.',
      ].join('\n'),
    )
  }

  let next = source

  if (
    !next.includes(
      'advances the owned revision after every successful save',
    )
  ) {
    next = insertBeforeOnce(
      next,
      `  it('settles an active save inside the same release transaction', async () => {`,
      `  it('advances the owned revision after every successful save', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-revision-advance',
      displayName: 'revision-advance.draw',
      revision: 'revision-current',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()

    harness.persistence.save
      .mockResolvedValueOnce({
        revision: 'revision-second',
      })
      .mockResolvedValueOnce({
        revision: 'revision-third',
      })

    await harness.service.save(opened.sessionId)
    await harness.service.save(opened.sessionId)

    expect(harness.persistence.save).toHaveBeenNthCalledWith(
      1,
      'native-document-revision-advance',
      'revision-current',
      expect.any(String),
    )

    expect(harness.persistence.save).toHaveBeenNthCalledWith(
      2,
      'native-document-revision-advance',
      'revision-second',
      expect.any(String),
    )

    expect(
      harness.service.getSessionSnapshot(opened.sessionId),
    ).toEqual({
      sessionId: opened.sessionId,
      persistence: 'clean',
    })
  })

  it('keeps a file-conflict save failed and requires close confirmation', async () => {
    const harness = createHarness()

    harness.persistence.open.mockResolvedValue({
      id: 'native-document-conflict',
      displayName: 'conflict.draw',
      revision: 'revision-current',
      content: serializeDrawDocument(snapshot({ shapes: [] })),
    })

    const opened = await harness.service.open()

    if (!opened) {
      throw new Error('expected native document')
    }

    harness.ready()
    harness.change(snapshot({ shapes: [{ id: 'shape:conflict' }] }))

    const conflict = Object.assign(
      new Error('document save conflict'),
      {
        details: {
          code: 'file-conflict',
          operation: 'file',
          recoverable: true,
        },
      },
    )

    harness.persistence.save.mockRejectedValue(conflict)

    await expect(
      harness.service.save(opened.sessionId),
    ).rejects.toBe(conflict)

    expect(
      harness.service.getSessionSnapshot(opened.sessionId),
    ).toEqual({
      sessionId: opened.sessionId,
      persistence: 'failed',
    })

    await expect(
      harness.service.releaseCanvas(
        opened.sessionId,
        'normal',
      ),
    ).resolves.toEqual({
      kind: 'confirmation-required',
    })

    expect(harness.persistence.close).not.toHaveBeenCalled()
    expect(harness.closeEditorSession).not.toHaveBeenCalled()
  })

`,
      'add renderer revision advancement and conflict tests',
    )
  }

  return next
}

async function main() {
  for (const path of [
    paths.packageJson,
    paths.documentCommand,
    paths.serviceTest,
  ]) {
    if (!(await exists(path))) {
      throw new Error(`Required file was not found: ${path}`)
    }
  }

  const packageJson = JSON.parse(
    await readFile(paths.packageJson, 'utf8'),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `Unexpected package name: ${String(packageJson.name)}`,
    )
  }

  const [documentCommandSource, serviceTestSource] =
    await Promise.all([
      readFile(paths.documentCommand, 'utf8'),
      readFile(paths.serviceTest, 'utf8'),
    ])

  const outputs = new Map([
    [
      paths.documentCommand,
      updateDocumentCommand(documentCommandSource),
    ],
    [
      paths.serviceTest,
      updateServiceTest(serviceTestSource),
    ],
  ])

  const originals = new Map([
    [paths.documentCommand, documentCommandSource],
    [paths.serviceTest, serviceTestSource],
  ])

  const changed = [...outputs].filter(
    ([path, content]) => originals.get(path) !== content,
  )

  if (changed.length === 0) {
    console.log(
      'P0-D.1 CAS hardening is already applied.',
    )
    return
  }

  console.log('P0-D.1 CAS hardening files:')

  for (const [path] of changed) {
    console.log(`- ${path.slice(root.length + 1)}`)
  }

  if (check) {
    console.log('')
    console.log('It will verify:')
    console.log('- stale renderer revision rejection;')
    console.log('- external modification rejection;')
    console.log('- external deletion rejection;')
    console.log('- successful next-revision advancement;')
    console.log('- rejection of a previously consumed revision;')
    console.log('- renderer use of the latest returned revision;')
    console.log('- dirty/failed state after file-conflict;')
    console.log('')
    console.log(
      'Run again with --apply to write the changes.',
    )
    return
  }

  /*
   * Both transformations finish before either file is written.
   */
  try {
    for (const [path, content] of outputs) {
      await writeFile(path, content, 'utf8')
    }
  } catch (error) {
    for (const [path, content] of originals) {
      await writeFile(path, content, 'utf8')
    }

    throw error
  }

  console.log('')
  console.log('Applied P0-D.1 CAS hardening.')
  console.log('')
  console.log('Required verification:')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  cargo fmt --all')
  console.log(
    '  cargo check --workspace --all-targets --all-features',
  )
  console.log(
    '  cargo test --workspace --all-features',
  )
  console.log(
    '  cargo clippy --workspace --all-targets --all-features -- -D warnings',
  )
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})
#!/usr/bin/env node

/**
 * P0-D.2 — Make Save As a single native registry transaction.
 *
 * Required base:
 *   - P0-D revision/CAS applied
 *   - P0-D.1 CAS hardening applied
 *
 * Replaces:
 *
 *   validate document ID
 *   -> write selected file
 *   -> update registry later
 *
 * With:
 *
 *   acquire registry write lock
 *   -> revalidate document ID
 *   -> canonicalize
 *   -> atomic_write selected file
 *   -> update path + revision
 *   -> release lock
 *
 * This prevents a failed Save As from writing a file after the native document
 * session has been concurrently closed.
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
  console.error(
    '\nP0-D.2 Save As transaction failed:\n' +
      'Use either --check or --apply, not both.\n',
  )
  process.exit(1)
}

if (!apply && !check) {
  console.error(
    '\nP0-D.2 Save As transaction failed:\n' +
      'Missing mode. Use --check or --apply.\n',
  )
  process.exit(1)
}

const paths = {
  packageJson: join(root, 'package.json'),

  documentCommand: join(
    root,
    'apps/desktop/src-tauri/src/commands/document.rs',
  ),
}

function fail(message) {
  console.error(
    `\nP0-D.2 Save As transaction failed:\n${message}\n`,
  )
  process.exit(1)
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
  const alreadyApplied =
    source.includes('fn save_as_existing(') &&
    !source.includes('fn replace_path(') &&
    source.includes(
      '"document Save As task terminated unexpectedly"',
    ) &&
    source.includes(
      'fn save_as_unknown_document_does_not_write_destination()',
    )

  if (alreadyApplied) {
    return {
      changed: false,
      content: source,
    }
  }

  if (
    !source.includes('fn save_existing(') ||
    !source.includes('expected_revision: &str') ||
    !source.includes('fn valid_document(')
  ) {
    throw new Error(
      [
        'Required CAS baseline was not found.',
        'Apply P0-D and P0-D.1 before this script.',
      ].join('\n'),
    )
  }

  let next = source

  const oldReplacePath = `    fn replace_path(
        &self,
        document_id: DocumentId,
        path: PathBuf,
        revision: String,
    ) -> Result<()> {
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal("document registry write lock poisoned".into()))?;

        let handle = documents
            .get_mut(&document_id)
            .ok_or_else(|| Error::NotFound("document session does not exist".into()))?;

        handle.path = path;
        handle.revision = revision;
        Ok(())
    }`

  const newSaveAsTransaction = `    fn save_as_existing(
        &self,
        document_id: DocumentId,
        path: PathBuf,
        content: &str,
    ) -> Result<String> {
        ensure_document_size(content.len() as u64)?;
        ensure_draw_document_path(&path)?;

        /*
         * Save As must revalidate and retain the native document handle while
         * producing the new file. If the document was closed after the dialog
         * opened, fail before touching the selected destination.
         *
         * Holding the same write lock used by ordinary CAS saves and close
         * prevents Save, Save As and Close from interleaving for this registry.
         */
        let mut documents = self
            .documents
            .write()
            .map_err(|_| Error::Internal(
                "document registry write lock poisoned".into(),
            ))?;

        let handle = documents
            .get_mut(&document_id)
            .ok_or_else(|| Error::NotFound(
                "document session does not exist".into(),
            ))?;

        let canonical_content =
            canonicalize_draw_document(content.as_bytes())?;

        atomic_write(&path, canonical_content.as_bytes())?;

        let revision =
            document_revision(canonical_content.as_bytes());

        handle.path = path;
        handle.revision.clone_from(&revision);

        Ok(revision)
    }`

  next = replaceOnce(
    next,
    oldReplacePath,
    newSaveAsTransaction,
    'replace non-transactional registry path update',
  )

  const oldSaveAsWrite = `    let revision =
        write_document(path.clone(), request.content).await?;

    let document_id = match request.document_id {
        Some(document_id) => {
            documents.replace_path(
                document_id,
                path.clone(),
                revision.clone(),
            )?;
            document_id
        }
        None => documents.insert(
            path.clone(),
            revision.clone(),
        )?,
    };`

  const newSaveAsWrite = `    let (document_id, revision) = match request.document_id {
        Some(document_id) => {
            let registry = documents.inner().clone();
            let save_path = path.clone();
            let content = request.content;

            let revision = tokio::task::spawn_blocking(move || {
                registry.save_as_existing(
                    document_id,
                    save_path,
                    &content,
                )
            })
            .await
            .map_err(|_| Error::Internal(
                "document Save As task terminated unexpectedly".into(),
            ))??;

            (document_id, revision)
        }
        None => {
            let revision =
                write_document(path.clone(), request.content).await?;

            let document_id = documents.insert(
                path.clone(),
                revision.clone(),
            )?;

            (document_id, revision)
        }
    };`

  next = replaceOnce(
    next,
    oldSaveAsWrite,
    newSaveAsWrite,
    'make existing-document Save As transactional',
  )

  if (
    !next.includes(
      'fn save_as_unknown_document_does_not_write_destination()',
    )
  ) {
    next = insertBeforeOnce(
      next,
      `    #[test]
    fn suggested_name_never_accepts_a_path() {`,
      `    #[test]
    fn save_as_unknown_document_does_not_write_destination() {
        let directory =
            tempfile::tempdir().expect("temporary directory");
        let destination =
            directory.path().join("must-not-exist.draw");
        let content = valid_document("save-as");

        let registry = DocumentRegistry::default();

        let result = registry.save_as_existing(
            DocumentId::new(),
            destination.clone(),
            &content,
        );

        assert!(matches!(result, Err(Error::NotFound(_))));
        assert!(!destination.exists());
    }

    #[test]
    fn save_as_updates_path_and_revision_together() {
        let directory =
            tempfile::tempdir().expect("temporary directory");

        let original_path =
            directory.path().join("original.draw");
        let destination =
            directory.path().join("renamed.draw");

        let original = valid_document("original");

        std::fs::write(&original_path, &original)
            .expect("original document should be written");

        let original_revision =
            document_revision(original.as_bytes());

        let registry = DocumentRegistry::default();
        let document_id = registry
            .insert(
                original_path,
                original_revision.clone(),
            )
            .expect("document should register");

        let replacement = valid_document("replacement");

        let next_revision = registry
            .save_as_existing(
                document_id,
                destination.clone(),
                &replacement,
            )
            .expect("Save As should succeed");

        assert_ne!(next_revision, original_revision);

        assert_eq!(
            registry
                .path(document_id)
                .expect("updated path should resolve"),
            destination,
        );

        let stored_bytes = std::fs::read(
            registry
                .path(document_id)
                .expect("updated path should remain registered"),
        )
        .expect("saved document should be readable");

        assert_eq!(
            document_revision(&stored_bytes),
            next_revision,
        );
    }

`,
      'add Save As transaction regression tests',
    )
  }

  if (next.includes('fn replace_path(')) {
    throw new Error(
      'The obsolete post-write replace_path operation still exists.',
    )
  }

  if (!next.includes('fn save_as_existing(')) {
    throw new Error(
      'Transactional Save As operation was not installed.',
    )
  }

  if (
    count(
      next,
      'document Save As task terminated unexpectedly',
    ) !== 1
  ) {
    throw new Error(
      'Expected exactly one blocking Save As transaction.',
    )
  }

  return {
    changed: next !== source,
    content: next,
  }
}

async function main() {
  for (const path of [
    paths.packageJson,
    paths.documentCommand,
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

  const original = await readFile(
    paths.documentCommand,
    'utf8',
  )

  const change = updateDocumentCommand(original)

  if (!change.changed) {
    console.log(
      'P0-D.2 transactional Save As is already applied.',
    )
    return
  }

  if (check) {
    console.log(
      'P0-D.2 transactional Save As is safe to apply.',
    )
    console.log('')
    console.log('It will:')
    console.log(
      '- remove the post-write replace_path operation;',
    )
    console.log(
      '- serialize existing-document Save As with Save and Close;',
    )
    console.log(
      '- revalidate the document before writing the destination;',
    )
    console.log(
      '- update path and revision under the same registry lock;',
    )
    console.log(
      '- prevent unknown or concurrently closed IDs from creating files;',
    )
    console.log('')
    console.log(
      'Run again with --apply to write the changes.',
    )
    return
  }

  try {
    await writeFile(
      paths.documentCommand,
      change.content,
      'utf8',
    )
  } catch (error) {
    await writeFile(
      paths.documentCommand,
      original,
      'utf8',
    )

    throw error
  }

  console.log('Applied P0-D.2 transactional Save As.')
  console.log('')
  console.log('Changed:')
  console.log(
    '- apps/desktop/src-tauri/src/commands/document.rs',
  )
  console.log('')
  console.log('Required verification:')
  console.log('  cargo fmt --all')
  console.log(
    '  cargo check --workspace --all-targets --all-features',
  )
  console.log(
    '  cargo test --workspace --all-targets --all-features',
  )
  console.log(
    '  cargo clippy --workspace --all-targets --all-features -- -D warnings',
  )
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
}

main().catch((error) => {
  fail(
    error instanceof Error
      ? error.stack ?? error.message
      : String(error),
  )
})
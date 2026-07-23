#!/usr/bin/env node

/**
 * P0-D.3 — Replace raw native revision strings with DocumentRevision.
 *
 * Corrected for:
 *   ccec77c1e353606182ff3a2d593c1d0f0f158eb8
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
    '\nP0-D.3 typed revision refactor failed:\n' +
      'Use either --check or --apply, not both.\n',
  )
  process.exit(1)
}

if (!apply && !check) {
  console.error(
    '\nP0-D.3 typed revision refactor failed:\n' +
      'Missing mode. Use --check or --apply.\n',
  )
  process.exit(1)
}

const paths = {
  packageJson: join(root, 'package.json'),

  revision: join(
    root,
    'editor/persistence/native/src/revision.rs',
  ),

  nativeLib: join(
    root,
    'editor/persistence/native/src/lib.rs',
  ),

  documentCommand: join(
    root,
    'apps/desktop/src-tauri/src/commands/document.rs',
  ),
}

const finalRevisionSource = `//! Strong content identity for optimistic document concurrency.
//!
//! A revision is the lowercase SHA-256 identity of the exact bytes stored on
//! disk. It is opaque outside Native and must never be interpreted as a
//! timestamp, path or mutable sequence number.

use sha2::{Digest, Sha256};

const SHA256_BYTES: usize = 32;
const SHA256_HEX_LENGTH: usize = SHA256_BYTES * 2;

/// Native-only, validated identity of exact document bytes.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DocumentRevision(String);

impl DocumentRevision {
    /// Calculates the revision of an exact byte sequence.
    pub fn from_bytes(content: &[u8]) -> Self {
        let digest = Sha256::digest(content);
        let revision = hex::encode(digest);

        debug_assert_eq!(revision.len(), SHA256_HEX_LENGTH);

        Self(revision)
    }

    /// Parses an opaque revision received through IPC.
    ///
    /// Only the canonical lowercase SHA-256 representation is accepted.
    pub fn parse(value: &str) -> Option<Self> {
        if value.len() != SHA256_HEX_LENGTH {
            return None;
        }

        if value.bytes().any(|byte| byte.is_ascii_uppercase()) {
            return None;
        }

        let decoded = hex::decode(value).ok()?;

        if decoded.len() != SHA256_BYTES {
            return None;
        }

        Some(Self(value.to_owned()))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }

    pub fn into_string(self) -> String {
        self.0
    }
}

/// Calculates the revision of an exact byte sequence.
pub fn document_revision(content: &[u8]) -> DocumentRevision {
    DocumentRevision::from_bytes(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn revision_is_stable_for_identical_bytes() {
        let first = document_revision(b"canvas");
        let second = document_revision(b"canvas");

        assert_eq!(first, second);
        assert_eq!(first.as_str().len(), SHA256_HEX_LENGTH);
    }

    #[test]
    fn revision_changes_when_any_byte_changes() {
        assert_ne!(
            document_revision(b"canvas-a"),
            document_revision(b"canvas-b"),
        );
    }

    #[test]
    fn revision_uses_exact_stored_bytes() {
        assert_ne!(
            document_revision(b"{\\"value\\":1}"),
            document_revision(b"{ \\"value\\": 1 }"),
        );
    }

    #[test]
    fn parses_canonical_revision() {
        let revision = document_revision(b"canvas");

        let parsed = DocumentRevision::parse(revision.as_str())
            .expect("canonical revision should parse");

        assert_eq!(parsed, revision);
    }

    #[test]
    fn rejects_malformed_revision() {
        assert!(DocumentRevision::parse("revision").is_none());
        assert!(DocumentRevision::parse(&"0".repeat(63)).is_none());
        assert!(DocumentRevision::parse(&"0".repeat(65)).is_none());
        assert!(DocumentRevision::parse(&"A".repeat(64)).is_none());
        assert!(DocumentRevision::parse(&"z".repeat(64)).is_none());
    }
}
`

function fail(message) {
  console.error(
    `\nP0-D.3 typed revision refactor failed:\n${message}\n`,
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

function updateNativeLib(source) {
  const finalExport =
    'pub use revision::{document_revision, DocumentRevision};'

  if (source.includes(finalExport)) {
    return source
  }

  return replaceOnce(
    source,
    'pub use revision::document_revision;',
    finalExport,
    'export DocumentRevision',
  )
}

function updateDocumentCommand(source) {
  const finalImport = `use hybrid_canvas_file_native::{
    atomic_write, canonicalize_draw_document, document_revision,
    DocumentRevision,
};`

  const alreadyApplied =
    source.includes(finalImport) &&
    source.includes('revision: DocumentRevision,') &&
    source.includes(
      'DocumentRevision::parse(expected_revision)',
    ) &&
    source.includes(
      'revision: revision.into_string(),',
    )

  if (alreadyApplied) {
    return source
  }

  if (
    !source.includes('fn save_existing(') ||
    !source.includes('fn save_as_existing(') ||
    !source.includes(
      'document Save As task terminated unexpectedly',
    )
  ) {
    throw new Error(
      [
        'Required CAS baseline was not found.',
        'Expected P0-D, P0-D.1 and P0-D.2.',
      ].join('\n'),
    )
  }

  let next = source

  if (!next.includes(finalImport)) {
    next = replaceOnce(
      next,
      `use hybrid_canvas_file_native::{
    atomic_write, canonicalize_draw_document, document_revision,
};`,
      finalImport,
      'import DocumentRevision',
    )
  }

  next = replaceOnce(
    next,
    `struct DocumentHandle {
    path: PathBuf,
    revision: String,
}`,
    `struct DocumentHandle {
    path: PathBuf,
    revision: DocumentRevision,
}`,
    'type native handle revision',
  )

  next = replaceOnce(
    next,
    `    fn insert(&self, path: PathBuf, revision: String) -> Result<DocumentId> {`,
    `    fn insert(
        &self,
        path: PathBuf,
        revision: DocumentRevision,
    ) -> Result<DocumentId> {`,
    'type registry insertion revision',
  )

  next = replaceOnce(
    next,
    `    fn save_as_existing(
        &self,
        document_id: DocumentId,
        path: PathBuf,
        content: &str,
    ) -> Result<String> {`,
    `    fn save_as_existing(
        &self,
        document_id: DocumentId,
        path: PathBuf,
        content: &str,
    ) -> Result<DocumentRevision> {`,
    'type Save As revision result',
  )

  next = replaceOnce(
    next,
    `    fn save_existing(
        &self,
        document_id: DocumentId,
        expected_revision: &str,
        content: &str,
    ) -> Result<String> {
        ensure_document_size(content.len() as u64)?;`,
    `    fn save_existing(
        &self,
        document_id: DocumentId,
        expected_revision: &str,
        content: &str,
    ) -> Result<DocumentRevision> {
        ensure_document_size(content.len() as u64)?;

        let expected_revision =
            DocumentRevision::parse(expected_revision)
                .ok_or_else(|| Error::Validation(
                    "expected revision must be canonical SHA-256".into(),
                ))?;`,
    'parse and type expected revision',
  )

  /*
   * Open DTO conversion. Use the complete DocumentOpenResult block so it cannot
   * collide with DocumentDescriptor.
   */
  next = replaceOnce(
    next,
    `        document: Some(DocumentOpenResult {
            document_id,
            display_name: display_name(&path),
            content,
            revision,
        }),`,
    `        document: Some(DocumentOpenResult {
            document_id,
            display_name: display_name(&path),
            content,
            revision: revision.into_string(),
        }),`,
    'convert open revision at IPC boundary',
  )

  /*
   * Save As DTO conversion, independently anchored to DocumentDescriptor.
   */
  next = replaceOnce(
    next,
    `        document: Some(DocumentDescriptor {
            document_id,
            display_name: display_name(&path),
            revision,
        }),`,
    `        document: Some(DocumentDescriptor {
            document_id,
            display_name: display_name(&path),
            revision: revision.into_string(),
        }),`,
    'convert Save As revision at IPC boundary',
  )

  next = replaceOnce(
    next,
    `    Ok(DocumentSaveResult { revision })`,
    `    Ok(DocumentSaveResult {
        revision: revision.into_string(),
    })`,
    'convert ordinary save revision at IPC boundary',
  )

  next = replaceOnce(
    next,
    `async fn read_document(path: PathBuf) -> Result<(String, String)> {`,
    `async fn read_document(
    path: PathBuf,
) -> Result<(String, DocumentRevision)> {`,
    'type opened revision',
  )

  next = replaceOnce(
    next,
    `async fn write_document(
    path: PathBuf,
    content: String,
) -> Result<String> {`,
    `async fn write_document(
    path: PathBuf,
    content: String,
) -> Result<DocumentRevision> {`,
    'type new-document revision',
  )

  /*
   * Existing registry unit fixtures must now use a real typed revision.
   */
  next = next.replaceAll(
    `.insert(path.clone(), "revision".to_owned())`,
    `.insert(
                path.clone(),
                document_revision(b"revision"),
            )`,
  )

  next = next.replaceAll(
    `                "revision".to_owned(),`,
    `                document_revision(b"revision"),`,
  )

  /*
   * A stale revision should still be syntactically valid so the test reaches
   * the CAS mismatch branch rather than the IPC validation branch.
   */
  next = replaceOnce(
    next,
    `            "stale-renderer-revision",
            &replacement,`,
    `            &"0".repeat(64),
            &replacement,`,
    'use canonical stale revision fixture',
  )

  if (!next.includes('revision: DocumentRevision,')) {
    throw new Error(
      'DocumentHandle revision is not strongly typed.',
    )
  }

  if (
    !next.includes(
      'DocumentRevision::parse(expected_revision)',
    )
  ) {
    throw new Error(
      'Expected revision is not validated at the Native boundary.',
    )
  }

  const rawHandlePattern = `struct DocumentHandle {
    path: PathBuf,
    revision: String,
}`

  if (next.includes(rawHandlePattern)) {
    throw new Error(
      'Raw String revision remains in DocumentHandle.',
    )
  }

  /*
   * Exactly three public DTO fields intentionally remain strings:
   * DocumentOpenResult, DocumentSaveResult and DocumentDescriptor.
   */
  const publicRevisionStrings = count(
    next,
    'pub revision: String,',
  )

  if (publicRevisionStrings !== 3) {
    throw new Error(
      [
        'Unexpected IPC revision field count.',
        'Expected: 3',
        `Actual: ${publicRevisionStrings}`,
      ].join('\n'),
    )
  }

  const intoStringCount = count(
    next,
    'revision: revision.into_string(),',
  )

  if (intoStringCount !== 3) {
    throw new Error(
      [
        'Unexpected typed-to-IPC revision conversion count.',
        'Expected: 3',
        `Actual: ${intoStringCount}`,
      ].join('\n'),
    )
  }

  return next
}

async function main() {
  for (const path of [
    paths.packageJson,
    paths.revision,
    paths.nativeLib,
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

  const [
    revisionOriginal,
    nativeLibOriginal,
    documentCommandOriginal,
  ] = await Promise.all([
    readFile(paths.revision, 'utf8'),
    readFile(paths.nativeLib, 'utf8'),
    readFile(paths.documentCommand, 'utf8'),
  ])

  /*
   * Prepare and validate every output before writing any file.
   */
  const outputs = new Map([
    [paths.revision, finalRevisionSource],
    [
      paths.nativeLib,
      updateNativeLib(nativeLibOriginal),
    ],
    [
      paths.documentCommand,
      updateDocumentCommand(documentCommandOriginal),
    ],
  ])

  const originals = new Map([
    [paths.revision, revisionOriginal],
    [paths.nativeLib, nativeLibOriginal],
    [paths.documentCommand, documentCommandOriginal],
  ])

  const changed = [...outputs].filter(
    ([path, content]) => originals.get(path) !== content,
  )

  if (changed.length === 0) {
    console.log(
      'P0-D.3 typed native revision is already applied.',
    )
    return
  }

  console.log('P0-D.3 typed revision files:')

  for (const [path] of changed) {
    console.log(`- ${path.slice(root.length + 1)}`)
  }

  if (check) {
    console.log('')
    console.log('It will:')
    console.log(
      '- replace raw Native revision strings with DocumentRevision;',
    )
    console.log(
      '- validate renderer revisions as canonical lowercase SHA-256;',
    )
    console.log(
      '- keep strings only at the generated IPC boundary;',
    )
    console.log(
      '- preserve exactly one CAS implementation;',
    )
    console.log('')
    console.log(
      'Run again with --apply to write the changes.',
    )
    return
  }

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
  console.log('Applied P0-D.3 typed native revision.')
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
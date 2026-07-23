#!/usr/bin/env node
/**
 * P0 — Introduce a native DocumentCodec boundary.
 *
 * Before:
 *   renderer string -> document command -> atomic_write
 *
 * After:
 *   renderer logical JSON
 *     -> native DocumentCodec validation + canonical serialization
 *     -> atomic_write
 *
 * This intentionally remains physical v1 JSON. ZIP v2 must be added later
 * inside DocumentCodec as one complete migration, not as scattered stubs.
 *
 * Usage:
 *   node refactor-p0-introduce-native-document-codec.mjs --check
 *   node refactor-p0-introduce-native-document-codec.mjs --apply
 *   node refactor-p0-introduce-native-document-codec.mjs --apply D:\xiaojianc\hybrid-canvas
 */

import { access, readFile, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join, resolve } from 'node:path'
import process from 'node:process'

const argv = process.argv.slice(2)
const apply = argv.includes('--apply')
const rootArgument = argv.find((argument) => !argument.startsWith('--'))
const root = resolve(rootArgument ?? process.cwd())

const paths = {
  packageJson: join(root, 'package.json'),
  nativeCargoToml: join(root, 'editor/persistence/native/Cargo.toml'),
  nativeLib: join(root, 'editor/persistence/native/src/lib.rs'),
  nativeCodec: join(
    root,
    'editor/persistence/native/src/document_codec.rs',
  ),
  documentCommand: join(
    root,
    'apps/desktop/src-tauri/src/commands/document.rs',
  ),
}

function fail(message) {
  console.error(`\nNative DocumentCodec refactor failed:\n${message}\n`)
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

function replaceExactly(source, oldText, newText, description) {
  if (!source.includes(oldText)) {
    throw new Error(
      [
        `Expected source fragment was not found: ${description}`,
        'Refusing fuzzy replacement.',
      ].join('\n'),
    )
  }

  const next = source.replace(oldText, newText)

  if (next === source) {
    throw new Error(`Replacement made no change: ${description}`)
  }

  return next
}

function documentCodecSource() {
  return `//! Native logical-document boundary.
 //!
 //! Renderer code may supply a .draw payload only as a logical JSON document.
 //! This module validates the native file envelope before it reaches disk and
 //! serializes it canonically. Atomic replacement remains a separate concern.
 //!
 //! Future physical formats (ZIP, binary assets, manifests, migrations) must
 //! be implemented behind this codec without widening the renderer IPC surface.

use crate::{Error, Result};
use serde_json::Value;

const DRAW_FORMAT: &str = "hybrid-canvas/draw";
const CURRENT_DRAW_VERSION: u64 = 1;
const MAX_LOGICAL_DOCUMENT_BYTES: usize = 32 * 1024 * 1024;

/// Validates a renderer-supplied logical .draw document and returns canonical
/// UTF-8 JSON suitable for physical persistence.
///
/// This does not validate tldraw records. Extension-aware tldraw validation
/// remains at the renderer's actual \`loadSnapshot\` boundary, where the complete
/// shape and binding schema is available.
pub fn canonicalize_draw_document(input: &[u8]) -> Result<String> {
    if input.len() > MAX_LOGICAL_DOCUMENT_BYTES {
        return Err(Error::CorruptedContainer(
            "logical document exceeds byte budget".into(),
        ));
    }

    let value: Value = serde_json::from_slice(input).map_err(|error| {
        Error::CorruptedContainer(format!(
            "logical document is not valid JSON: {error}"
        ))
    })?;

    validate_draw_envelope(&value)?;

    serde_json::to_string(&value).map_err(|error| {
        Error::CorruptedContainer(format!(
            "logical document cannot be serialized: {error}"
        ))
    })
}

fn validate_draw_envelope(value: &Value) -> Result<()> {
    let root = value.as_object().ok_or_else(|| {
        Error::CorruptedContainer(
            "logical document root must be an object".into(),
        )
    })?;

    let header = root
        .get("header")
        .and_then(Value::as_object)
        .ok_or_else(|| {
            Error::CorruptedContainer(
                "logical document header must be an object".into(),
            )
        })?;

    let format = header.get("format").and_then(Value::as_str);

    if format != Some(DRAW_FORMAT) {
        return Err(Error::CorruptedContainer(
            "logical document has an unsupported format".into(),
        ));
    }

    let version = header.get("version").and_then(Value::as_u64);

    if version != Some(CURRENT_DRAW_VERSION) {
        return Err(Error::CorruptedContainer(
            "logical document has an unsupported version".into(),
        ));
    }

    let created_at = header.get("createdAt").and_then(Value::as_str);

    if !created_at.is_some_and(|value| !value.trim().is_empty()) {
        return Err(Error::CorruptedContainer(
            "logical document has no creation timestamp".into(),
        ));
    }

    if !root.get("content").is_some_and(Value::is_object) {
        return Err(Error::CorruptedContainer(
            "logical document content must be an object".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::canonicalize_draw_document;

    fn valid_document() -> Vec<u8> {
        br#"{
            "header": {
                "format": "hybrid-canvas/draw",
                "version": 1,
                "createdAt": "2026-07-23T00:00:00.000Z"
            },
            "content": {
                "document": {},
                "session": {}
            }
        }"#
        .to_vec()
    }

    #[test]
    fn canonicalizes_a_valid_logical_document() {
        let document =
            canonicalize_draw_document(&valid_document()).expect(
                "valid logical document should be accepted",
            );

        assert!(!document.contains('\\n'));
        assert!(document.contains("\\"hybrid-canvas/draw\\""));
        assert!(document.contains("\\"content\\""));
    }

    #[test]
    fn rejects_a_non_json_payload() {
        let result = canonicalize_draw_document(b"not-json");

        assert!(result.is_err());
    }

    #[test]
    fn rejects_a_raw_tldraw_snapshot_without_envelope() {
        let result = canonicalize_draw_document(
            br#"{ "document": {}, "session": {} }"#,
        );

        assert!(result.is_err());
    }

    #[test]
    fn rejects_future_logical_versions() {
        let result = canonicalize_draw_document(
            br#"{
                "header": {
                    "format": "hybrid-canvas/draw",
                    "version": 2,
                    "createdAt": "2026-07-23T00:00:00.000Z"
                },
                "content": {}
            }"#,
        );

        assert!(result.is_err());
    }

    #[test]
    fn rejects_non_object_content() {
        let result = canonicalize_draw_document(
            br#"{
                "header": {
                    "format": "hybrid-canvas/draw",
                    "version": 1,
                    "createdAt": "2026-07-23T00:00:00.000Z"
                },
                "content": []
            }"#,
        );

        assert!(result.is_err());
    }
}
`
}

async function main() {
  if (!(await exists(paths.packageJson))) {
    fail(
      [
        `Repository root was not found: ${root}`,
        'Run from the Hybrid Canvas repository root or pass its path explicitly.',
      ].join('\n'),
    )
    return
  }

  for (const [name, path] of Object.entries(paths)) {
    if (name === 'packageJson' || name === 'nativeCodec') {
      continue
    }

    if (!(await exists(path))) {
      fail(`Required path does not exist: ${path}`)
      return
    }
  }

  try {
    const [nativeCargoToml, nativeLib, documentCommand] = await Promise.all([
      readFile(paths.nativeCargoToml, 'utf8'),
      readFile(paths.nativeLib, 'utf8'),
      readFile(paths.documentCommand, 'utf8'),
    ])

    const codecSource = documentCodecSource()

    if (
      nativeLib.includes('canonicalize_draw_document') ||
      documentCommand.includes('canonicalize_draw_document')
    ) {
      if (await exists(paths.nativeCodec)) {
        console.log('Native DocumentCodec is already present.')
        return
      }

      throw new Error(
        [
          'DocumentCodec references exist but the codec source file is missing.',
          'Refusing to overwrite an incomplete refactor.',
        ].join('\n'),
      )
    }

    const nextCargoToml = replaceExactly(
      nativeCargoToml,
      `[dependencies]
tempfile.workspace = true
`,
      `[dependencies]
serde_json.workspace = true
tempfile.workspace = true
`,
      'add serde_json for native logical-document validation',
    )

    const nextNativeLib = replaceExactly(
      nativeLib,
      `mod atomic_write;
mod error;

pub use atomic_write::atomic_write;
pub use error::{Error, Result};
`,
      `mod atomic_write;
mod document_codec;
mod error;

pub use atomic_write::atomic_write;
pub use document_codec::canonicalize_draw_document;
pub use error::{Error, Result};
`,
      'register and export DocumentCodec',
    )

    const nextDocumentCommandImport = replaceExactly(
      documentCommand,
      `use hybrid_canvas_file_native::atomic_write;`,
      `use hybrid_canvas_file_native::{
    atomic_write, canonicalize_draw_document,
};`,
      'import native DocumentCodec',
    )

    const oldReadDocument = `async fn read_document(path: PathBuf) -> Result<String> {
    let metadata = tokio::fs::metadata(&path).await?;
    ensure_document_size(metadata.len())?;

    let content = tokio::fs::read_to_string(&path).await?;
    ensure_document_size(content.len() as u64)?;

    Ok(content)
}

async fn write_document(path: PathBuf, content: String) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        atomic_write(path, content.as_bytes())
    })
    .await
    .map_err(|_| Error::Internal("document save task terminated unexpectedly".into()))?
    .map_err(Error::from)
}`

    const newReadDocument = `async fn read_document(path: PathBuf) -> Result<String> {
    let metadata = tokio::fs::metadata(&path).await?;
    ensure_document_size(metadata.len())?;

    let bytes = tokio::fs::read(&path).await?;
    ensure_document_size(bytes.len() as u64)?;

    tokio::task::spawn_blocking(move || canonicalize_draw_document(&bytes))
        .await
        .map_err(|_| Error::Internal("document decode task terminated unexpectedly".into()))?
        .map_err(Error::from)
}

async fn write_document(path: PathBuf, content: String) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let canonical_content = canonicalize_draw_document(content.as_bytes())?;

        atomic_write(path, canonical_content.as_bytes())
    })
    .await
    .map_err(|_| Error::Internal("document save task terminated unexpectedly".into()))?
    .map_err(Error::from)
}`

    const nextDocumentCommand = replaceExactly(
      nextDocumentCommandImport,
      oldReadDocument,
      newReadDocument,
      'route document reads and writes through native DocumentCodec',
    )

    if (!apply) {
      console.log('Native DocumentCodec refactor can be applied safely:')
      console.log('- Native validates the logical .draw envelope before disk I/O.')
      console.log('- Native canonicalizes JSON before every write.')
      console.log('- Native validates file bytes before returning them to the renderer.')
      console.log('- Renderer IPC remains unchanged: no paths or archive details leak.')
      console.log('')
      console.log('Run again with --apply to write the refactor.')
      return
    }

    await Promise.all([
      writeFile(paths.nativeCargoToml, nextCargoToml, 'utf8'),
      writeFile(paths.nativeLib, nextNativeLib, 'utf8'),
      writeFile(paths.nativeCodec, codecSource, 'utf8'),
      writeFile(paths.documentCommand, nextDocumentCommand, 'utf8'),
    ])

    console.log('Applied native DocumentCodec boundary refactor.')
    console.log('')
    console.log('Required verification:')
    console.log('  cargo fmt --check')
    console.log('  cargo test -p hybrid-canvas-file-native')
    console.log('  cargo test -p hybrid-canvas-desktop')
    console.log('  cargo clippy --workspace --all-targets --all-features -- -D warnings')
    console.log('  pnpm typecheck')
    console.log('  pnpm lint')
    console.log('  pnpm test')
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

await main()
#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

const paths = {
  lib: 'editor/persistence/native/src/lib.rs',
  documentRs: 'apps/desktop/src-tauri/src/commands/document.rs',
  legacyCodec: 'editor/persistence/native/src/document_codec.rs',
  legacyCodecRenamed: 'editor/persistence/native/src/legacy_document_codec_v1.rs',
}

function abs(path) {
  return resolve(root, path)
}

function read(path) {
  return readFileSync(abs(path), 'utf8')
}

function write(path, content) {
  writeFileSync(abs(path), content.replaceAll('\r\n', '\n'))
}

function removeIfExists(path) {
  if (existsSync(abs(path))) {
    unlinkSync(abs(path))
  }
}

function replaceOnce(source, oldValue, newValue, label) {
  const first = source.indexOf(oldValue)
  if (first < 0) {
    throw new Error(`Expected source fragment was not found: ${label}`)
  }
  if (source.indexOf(oldValue, first + oldValue.length) >= 0) {
    throw new Error(`Unexpected source count: ${label}`)
  }
  return source.slice(0, first) + newValue + source.slice(first + oldValue.length)
}

function patchLibRs() {
  let source = read(paths.lib)

  source = source.replace("mod document_codec;\n", '')
  source = source.replace("mod legacy_document_codec_v1;\n", '')

  source = source.replace("pub use document_codec::canonicalize_draw_document;\n", '')
  source = source.replace(
    "pub use legacy_document_codec_v1::canonicalize_legacy_draw_document_v1;\n",
    '',
  )

  if (source.includes('canonicalize_draw_document')) {
    throw new Error('lib.rs still references canonicalize_draw_document')
  }

  write(paths.lib, source)
}

function patchDocumentRs() {
  let source = read(paths.documentRs)

  source = source.replace(
    `use hybrid_canvas_file_native::{
    DocumentRevision, DrawAssetInput, DrawDocumentV2Input, atomic_write,
    canonicalize_draw_document, decode_draw_document_v2, document_revision,
    encode_draw_document_v2,
};`,
    `use hybrid_canvas_file_native::{
    DocumentRevision, DrawAssetInput, DrawDocumentV2Input, atomic_write,
    decode_draw_document_v2, document_revision, encode_draw_document_v2,
};`,
  )

  source = replaceOnce(
    source,
    `fn decode_document(bytes: &[u8]) -> Result<DecodedDocument> {
    if bytes.starts_with(b"PK\\x03\\x04") {
        let decoded = decode_draw_document_v2(bytes)?;

        let assets = decoded
            .assets
            .into_iter()
            .map(|asset| AssetSessionSnapshotEntry {
                content_hash: asset.content_hash,
                content_type: asset.content_type,
                bytes: Arc::from(asset.bytes),
            })
            .collect::<Vec<_>>();

        return Ok(DecodedDocument {
            content: serde_json::to_string(&decoded.document)?,
            created_at: decoded.created_at,
            assets,
        });
    }

    ensure_logical_document_size(bytes.len() as u64)?;

    let canonical = canonicalize_draw_document(bytes)?;
    let legacy: serde_json::Value = serde_json::from_str(&canonical)?;

    let created_at = legacy
        .get("header")
        .and_then(|header| header.get("createdAt"))
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| Error::Validation("v1 document has no createdAt".into()))?
        .to_owned();

    let document = legacy
        .get("content")
        .and_then(|content| content.get("document"))
        .filter(|value| value.is_object())
        .ok_or_else(|| Error::Validation("v1 document has no store snapshot".into()))?;

    Ok(DecodedDocument {
        content: serde_json::to_string(document)?,
        created_at,
        assets: Vec::new(),
    })
}`,
    `fn decode_document(bytes: &[u8]) -> Result<DecodedDocument> {
    if !bytes.starts_with(b"PK\\x03\\x04") {
        return Err(Error::Validation(
            "selected .draw file is not a supported v2 document".into(),
        ));
    }

    let decoded = decode_draw_document_v2(bytes)?;

    let assets = decoded
        .assets
        .into_iter()
        .map(|asset| AssetSessionSnapshotEntry {
            content_hash: asset.content_hash,
            content_type: asset.content_type,
            bytes: Arc::from(asset.bytes),
        })
        .collect::<Vec<_>>();

    Ok(DecodedDocument {
        content: serde_json::to_string(&decoded.document)?,
        created_at: decoded.created_at,
        assets,
    })
}`,
    'remove legacy decode fallback',
  )

  source = source.replace(
    `    fn legacy_v1(marker: &str) -> Vec<u8> {
        serde_json::json!({
            "header": {
                "format": "hybrid-canvas/draw",
                "version": 1,
                "createdAt": "2026-07-23T00:00:00.000Z"
            },
            "content": {
                "document": {
                    "schema": {},
                    "store": {
                        "marker": marker
                    }
                },
                "session": {}
            }
        })
        .to_string()
        .into_bytes()
    }

    #[test]
    fn v1_reader_is_explicit_migration() {
        let decoded = decode_document(&legacy_v1("legacy")).expect("v1 migration should succeed");

        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&decoded.content).expect("logical snapshot"),
            serde_json::json!({
                "schema": {},
                "store": {
                    "marker": "legacy"
                }
            }),
        );
        assert!(decoded.assets.is_empty());
    }

`,
    `    #[test]
    fn rejects_legacy_non_zip_documents() {
        let legacy = serde_json::json!({
            "header": {
                "format": "hybrid-canvas/draw",
                "version": 1,
                "createdAt": "2026-07-23T00:00:00.000Z"
            },
            "content": {
                "document": {
                    "schema": {},
                    "store": {
                        "marker": "legacy"
                    }
                },
                "session": {}
            }
        })
        .to_string()
        .into_bytes();

        let result = decode_document(&legacy);

        assert!(matches!(result, Err(Error::Validation(_))));
    }

`,
  )

  if (source.includes('canonicalize_draw_document')) {
    throw new Error('document.rs still references canonicalize_draw_document')
  }

  write(paths.documentRs, source)
}

function deleteLegacyCodecFiles() {
  removeIfExists(paths.legacyCodec)
  removeIfExists(paths.legacyCodecRenamed)
}

function main() {
  patchLibRs()
  patchDocumentRs()
  deleteLegacyCodecFiles()
  console.log('Deleted legacy .draw compatibility. Only v2 documents are supported now.')
}

main()
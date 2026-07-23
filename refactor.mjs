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

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker)
  if (start < 0) {
    throw new Error(`Start marker not found: ${label}`)
  }

  const end = source.indexOf(endMarker, start)
  if (end < 0) {
    throw new Error(`End marker not found: ${label}`)
  }

  return source.slice(0, start) + replacement + source.slice(end)
}

function patchLibRs() {
  let source = read(paths.lib)

  source = source.replace(/^mod document_codec;\n/m, '')
  source = source.replace(/^mod legacy_document_codec_v1;\n/m, '')

  source = source.replace(
    /^pub use document_codec::canonicalize_draw_document;\n/m,
    '',
  )
  source = source.replace(
    /^pub use legacy_document_codec_v1::canonicalize_legacy_draw_document_v1;\n/m,
    '',
  )

  write(paths.lib, source)
}

function patchDocumentRs() {
  let source = read(paths.documentRs)

  source = source.replace(/,\s*canonicalize_draw_document/g, '')
  source = source.replace(/canonicalize_draw_document,\s*/g, '')
  source = source.replace(/,\s*canonicalize_legacy_draw_document_v1/g, '')
  source = source.replace(/canonicalize_legacy_draw_document_v1,\s*/g, '')

  if (!source.includes('selected .draw file is not a supported v2 document')) {
    source = replaceBetween(
      source,
      'fn decode_document(bytes: &[u8]) -> Result<DecodedDocument> {',
      '\nfn encode_document(',
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
}
`,
      'remove legacy decode fallback',
    )
  }

  if (source.includes('fn legacy_v1(marker: &str) -> Vec<u8> {')) {
    source = replaceBetween(
      source,
      '    fn legacy_v1(marker: &str) -> Vec<u8> {',
      '\n    #[test]\n    fn v2_writer_always_emits_zip() {',
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
      'replace legacy migration test',
    )
  }

  write(paths.documentRs, source)
}

function deleteLegacyCodecFiles() {
  removeIfExists(paths.legacyCodec)
  removeIfExists(paths.legacyCodecRenamed)
}

function validateResult() {
  const lib = read(paths.lib)
  const documentRs = read(paths.documentRs)

  const forbiddenLibMarkers = [
    'mod document_codec;\n',
    'mod legacy_document_codec_v1;\n',
    'pub use document_codec::canonicalize_draw_document;\n',
    'pub use legacy_document_codec_v1::canonicalize_legacy_draw_document_v1;\n',
  ]

  for (const marker of forbiddenLibMarkers) {
    if (lib.includes(marker)) {
      throw new Error(`legacy codec references still remain in lib.rs: ${marker.trim()}`)
    }
  }

  const forbiddenDocumentMarkers = [
    'canonicalize_draw_document(',
    'canonicalize_legacy_draw_document_v1(',
    ' canonicalize_draw_document,',
    ' canonicalize_legacy_draw_document_v1,',
  ]

  for (const marker of forbiddenDocumentMarkers) {
    if (documentRs.includes(marker)) {
      throw new Error(
        `legacy codec references still remain in document.rs: ${marker.trim()}`,
      )
    }
  }

  if (!documentRs.includes('selected .draw file is not a supported v2 document')) {
    throw new Error('document.rs did not switch to v2-only decode')
  }

  if (existsSync(abs(paths.legacyCodec)) || existsSync(abs(paths.legacyCodecRenamed))) {
    throw new Error('legacy codec files still exist')
  }
}

function main() {
  patchLibRs()
  patchDocumentRs()
  deleteLegacyCodecFiles()
  validateResult()

  console.log('Deleted legacy .draw compatibility. Only v2 documents are supported now.')
}

main()
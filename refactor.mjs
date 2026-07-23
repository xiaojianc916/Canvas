#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'

const root = process.cwd()

const paths = {
  lib: 'editor/persistence/native/src/lib.rs',
  oldCodec: 'editor/persistence/native/src/document_codec_v2.rs',
  newCodec: 'editor/persistence/native/src/draw_document_codec.rs',
  removeCodec: 'editor/persistence/native/src/document_codec.rs',
  documentRs: 'apps/desktop/src-tauri/src/commands/document.rs',
  toolbar: 'editor/core/src/react/CanvasToolbar.tsx',
}

function abs(path) {
  return resolve(root, path)
}

function read(path) {
  return readFileSync(abs(path), 'utf8')
}

function write(path, content) {
  const full = abs(path)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content.replaceAll('\r\n', '\n'))
}

function removeIfExists(path) {
  if (existsSync(abs(path))) {
    unlinkSync(abs(path))
  }
}

function replaceAllExact(source, from, to) {
  return source.split(from).join(to)
}

function renameCodecFile() {
  const oldExists = existsSync(abs(paths.oldCodec))
  const newExists = existsSync(abs(paths.newCodec))

  if (oldExists && !newExists) {
    renameSync(abs(paths.oldCodec), abs(paths.newCodec))
  }

  if (!existsSync(abs(paths.newCodec))) {
    throw new Error('Could not find current codec file to rename/use')
  }
}

function patchLibRs() {
  let source = read(paths.lib)

  source = source.replace(/^mod document_codec;\n/m, '')
  source = replaceAllExact(source, 'mod document_codec_v2;', 'mod draw_document_codec;')

  source = source.replace(/^pub use document_codec::canonicalize_draw_document;\n/m, '')
  source = replaceAllExact(
    source,
    'pub use document_codec_v2::{',
    'pub use draw_document_codec::{',
  )

  source = replaceAllExact(
    source,
    '//! - strict v2 ZIP document encoding and decoding',
    '//! - current .draw container encoding and decoding',
  )

  write(paths.lib, source)
}

function patchCodecFile() {
  let source = read(paths.newCodec)

  source = replaceAllExact(
    source,
    '//! Strict v2 Hybrid Canvas ZIP DocumentCodec.',
    '//! Current Hybrid Canvas .draw container codec.',
  )

  source = replaceAllExact(
    source,
    'pub struct DrawDocumentV2Input',
    'pub struct DrawDocumentInput',
  )

  source = replaceAllExact(
    source,
    'pub struct DecodedDrawDocumentV2',
    'pub struct DecodedDrawDocument',
  )

  source = replaceAllExact(
    source,
    'pub fn encode_draw_document_v2(input: DrawDocumentV2Input',
    'pub fn encode_draw_document(input: DrawDocumentInput',
  )

  source = replaceAllExact(
    source,
    'pub fn decode_draw_document_v2(bytes: &[u8]) -> Result<DecodedDrawDocumentV2>',
    'pub fn decode_draw_document(bytes: &[u8]) -> Result<DecodedDrawDocument>',
  )

  source = replaceAllExact(source, 'DecodedDrawDocumentV2 {', 'DecodedDrawDocument {')
  source = replaceAllExact(source, 'DrawDocumentV2Input {', 'DrawDocumentInput {')
  source = replaceAllExact(source, 'encode_draw_document_v2(', 'encode_draw_document(')
  source = replaceAllExact(source, 'decode_draw_document_v2(', 'decode_draw_document(')

  source = replaceAllExact(
    source,
    'fn encode_fixture() -> Vec<u8> {',
    'fn encode_fixture_document() -> Vec<u8> {',
  )
  source = replaceAllExact(source, 'encode_fixture();', 'encode_fixture_document();')

  source = replaceAllExact(
    source,
    'fn round_trips_document_and_assets() {',
    'fn round_trips_draw_document_and_assets() {',
  )
  source = replaceAllExact(
    source,
    'fn rejects_future_manifest_version() {',
    'fn rejects_future_container_manifest_version() {',
  )

  write(paths.newCodec, source)
}

function patchDocumentRs() {
  let source = read(paths.documentRs)

  source = source.replace(/,\s*canonicalize_draw_document/g, '')
  source = source.replace(/canonicalize_draw_document,\s*/g, '')

  source = replaceAllExact(source, 'decode_draw_document_v2', 'decode_draw_document')
  source = replaceAllExact(source, 'encode_draw_document_v2', 'encode_draw_document')
  source = replaceAllExact(source, 'DrawDocumentV2Input', 'DrawDocumentInput')

  source = replaceAllExact(
    source,
    'selected .draw file is not a supported v2 document',
    'selected .draw file uses an unsupported internal format',
  )

  source = replaceAllExact(
    source,
    'fn v2_writer_always_emits_zip() {',
    'fn writer_emits_draw_container() {',
  )

  source = replaceAllExact(
    source,
    'fn rejects_legacy_non_zip_documents() {',
    'fn rejects_non_container_documents() {',
  )

  source = replaceAllExact(
    source,
    'expect("v2 encode should succeed")',
    'expect("encode should succeed")',
  )

  source = replaceAllExact(
    source,
    'expect("written v2 should decode")',
    'expect("written document should decode")',
  )

  write(paths.documentRs, source)
}

function patchToolbar() {
  let source = read(paths.toolbar)

  if (source.includes('export function CanvasToolbar({ onSave }: CanvasToolbarProps)')) {
    write(paths.toolbar, source)
    return
  }

  if (!source.includes('export interface CanvasToolbarProps')) {
    throw new Error('CanvasToolbarProps declaration is missing')
  }

  if (!source.includes('export function CanvasToolbar() {')) {
    throw new Error('CanvasToolbar function signature was not found')
  }

  source = replaceAllExact(
    source,
    'export function CanvasToolbar() {',
    'export function CanvasToolbar({ onSave }: CanvasToolbarProps) {',
  )

  if (!source.includes('const handleSave =')) {
    source = replaceAllExact(
      source,
      `  const saveAction =
    actions['hybrid-canvas.save']`,
      `  const saveAction =
    actions['hybrid-canvas.save']

  const handleSave =
    onSave ??
    (saveAction
      ? () => {
          void saveAction.onSelect('toolbar')
        }
      : null)`,
    )
  }

  const oldSaveBlock = `{saveAction ? (
  <>
    <Separator
      className="mx-1 h-5 shrink-0"
      orientation="vertical"
    />

    <ToolbarButton
      icon={Save}
      label="保存"
      onClick={() =>
        void saveAction.onSelect('toolbar')
      }
      shortcut="Ctrl+S"
    />
  </>
) : null}`

  const newSaveBlock = `{handleSave ? (
  <>
    <Separator
      className="mx-1 h-5 shrink-0"
      orientation="vertical"
    />

    <ToolbarButton
      icon={Save}
      label="保存"
      onClick={handleSave}
      shortcut="Ctrl+S"
    />
  </>
) : null}`

  if (source.includes(oldSaveBlock)) {
    source = replaceAllExact(source, oldSaveBlock, newSaveBlock)
  }

  write(paths.toolbar, source)
}

function deleteDeadCodec() {
  removeIfExists(paths.removeCodec)
}

function validate() {
  const lib = read(paths.lib)
  const codec = read(paths.newCodec)
  const documentRs = read(paths.documentRs)
  const toolbar = read(paths.toolbar)

  const forbidden = [
    'document_codec_v2',
    'encode_draw_document_v2',
    'decode_draw_document_v2',
    'DrawDocumentV2Input',
    'DecodedDrawDocumentV2',
    'supported v2 document',
  ]

  for (const marker of forbidden) {
    if (lib.includes(marker) || codec.includes(marker) || documentRs.includes(marker)) {
      throw new Error(`Outdated naming still remains: ${marker}`)
    }
  }

  if (existsSync(abs(paths.removeCodec))) {
    throw new Error('Dead codec file still exists: document_codec.rs')
  }

  if (!toolbar.includes('export function CanvasToolbar({ onSave }: CanvasToolbarProps)')) {
    throw new Error('CanvasToolbarProps is still a dead API')
  }
}

function main() {
  renameCodecFile()
  patchLibRs()
  patchCodecFile()
  patchDocumentRs()
  patchToolbar()
  deleteDeadCodec()
  validate()

  console.log('Final cleanup applied: canonical names restored and dead code removed.')
}

main()
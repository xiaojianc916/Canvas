#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

const paths = {
  lib: 'editor/persistence/native/src/lib.rs',
  documentCommands: 'apps/desktop/src-tauri/src/commands/document.rs',
  oldCodec: 'editor/persistence/native/src/document_codec.rs',
  newCodec: 'editor/persistence/native/src/legacy_document_codec_v1.rs',
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

function replaceAllExact(source, from, to) {
  return source.split(from).join(to)
}

function patchLibRs() {
  let source = read(paths.lib)

  source = replaceAllExact(
    source,
    'mod document_codec;',
    'mod legacy_document_codec_v1;',
  )

  source = replaceAllExact(
    source,
    'pub use document_codec::canonicalize_draw_document;',
    'pub use legacy_document_codec_v1::canonicalize_legacy_draw_document_v1;',
  )

  write(paths.lib, source)
}

function patchDocumentRs() {
  let source = read(paths.documentCommands)

  source = replaceAllExact(
    source,
    'canonicalize_draw_document, decode_draw_document_v2',
    'canonicalize_legacy_draw_document_v1, decode_draw_document_v2',
  )

  source = replaceAllExact(
    source,
    'let canonical = canonicalize_draw_document(bytes)?;',
    'let canonical = canonicalize_legacy_draw_document_v1(bytes)?;',
  )

  write(paths.documentCommands, source)
}

function patchLegacyCodecFile() {
  const oldExists = existsSync(abs(paths.oldCodec))
  const newExists = existsSync(abs(paths.newCodec))

  if (oldExists && !newExists) {
    renameSync(abs(paths.oldCodec), abs(paths.newCodec))
  }

  if (!existsSync(abs(paths.newCodec))) {
    throw new Error('Missing codec file after rename')
  }

  let source = read(paths.newCodec)

  source = source.replace(
    '//! Native logical-document boundary.',
    '//! Explicit legacy v1 logical-document migration boundary.',
  )

  source = source.replace(
    'pub fn canonicalize_draw_document(input: &[u8]) -> Result<String> {',
    'pub fn canonicalize_legacy_draw_document_v1(input: &[u8]) -> Result<String> {',
  )

  source = replaceAllExact(
    source,
    'canonicalize_draw_document(',
    'canonicalize_legacy_draw_document_v1(',
  )

  source = replaceAllExact(
    source,
    'use super::canonicalize_draw_document;',
    'use super::canonicalize_legacy_draw_document_v1;',
  )

  write(paths.newCodec, source)

  if (existsSync(abs(paths.oldCodec))) {
    unlinkSync(abs(paths.oldCodec))
  }
}

function main() {
  patchLibRs()
  patchDocumentRs()
  patchLegacyCodecFile()
  console.log(
    'Codec layout collapsed: v2 remains canonical, v1 file is now explicitly legacy-only.',
  )
}

main()
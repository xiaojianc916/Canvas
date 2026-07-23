#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()

const paths = {
  publicApi: 'editor/core/src/react/public-api.ts',
  toolbar: 'editor/core/src/react/CanvasToolbar.tsx',
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

function patchPublicApi() {
  write(
    paths.publicApi,
    `export {
  buildExtensionRegistration,
  type ExtensionRegistration,
  HYBRID_CANVAS_EXTENSION_API_VERSION,
  type HybridCanvasExtension,
} from '../contracts/public-api'
export { CanvasToolbar } from './CanvasToolbar'
export type { CanvasToolbarProps } from './CanvasToolbar'
export { EditorCanvas, type EditorCanvasProps } from './EditorCanvas'
export {
  EditorSessionHost,
  type EditorSessionHostEntry,
  type EditorSessionHostProps,
} from './EditorSessionHost'
export {
  EditorProvider,
  type EditorProviderProps,
  useEditor,
  useTldrawLicenseKey,
} from './editor-context'
`,
  )
}

function patchToolbar() {
  let source = read(paths.toolbar)

  if (source.includes('export interface CanvasToolbarProps')) {
    write(paths.toolbar, source)
    return
  }

  if (source.includes('interface CanvasToolbarProps')) {
    source = source.replace(
      /(^|\n)interface CanvasToolbarProps\b/,
      '$1export interface CanvasToolbarProps',
    )
    write(paths.toolbar, source)
    return
  }

  if (source.includes('type CanvasToolbarProps =')) {
    source = source.replace(
      /(^|\n)type CanvasToolbarProps\s*=/,
      '$1export type CanvasToolbarProps =',
    )
    write(paths.toolbar, source)
    return
  }

  if (source.includes('export function CanvasToolbar(')) {
    source = source.replace(
      'export function CanvasToolbar(',
      `export interface CanvasToolbarProps {
  readonly onSave?: () => void
}

export function CanvasToolbar(`,
    )
    write(paths.toolbar, source)
    return
  }

  if (source.includes('function CanvasToolbar(')) {
    source = source.replace(
      'function CanvasToolbar(',
      `export interface CanvasToolbarProps {
  readonly onSave?: () => void
}

function CanvasToolbar(`,
    )
    write(paths.toolbar, source)
    return
  }

  throw new Error(
    'Could not find CanvasToolbar function in editor/core/src/react/CanvasToolbar.tsx',
  )
}

function main() {
  patchPublicApi()
  patchToolbar()
  console.log('CanvasToolbarProps export fixed.')
}

main()
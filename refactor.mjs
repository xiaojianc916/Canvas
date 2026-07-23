#!/usr/bin/env node

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { resolve, dirname, extname } from 'node:path'

const root = process.cwd()

const paths = {
  toolbar: 'editor/core/src/react/CanvasToolbar.tsx',
  auditScript: 'scripts/quality/assert-no-legacy-persistence.mjs',
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

function replaceRegexOnce(source, regex, replacement, label) {
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  const matches = [...source.matchAll(new RegExp(regex.source, flags))]
  if (matches.length === 0) {
    throw new Error(`Expected source fragment was not found: ${label}`)
  }
  if (matches.length > 1) {
    throw new Error(`Unexpected source count: ${label}`)
  }
  return source.replace(regex, replacement)
}

function patchToolbar() {
  let source = read(paths.toolbar)

  if (!source.includes('export interface CanvasToolbarProps')) {
    throw new Error('CanvasToolbarProps export is missing')
  }

  if (source.includes('export function CanvasToolbar({ onSave }: CanvasToolbarProps)')) {
    // already patched
  } else if (source.includes('export function CanvasToolbar() {')) {
    source = replaceOnce(
      source,
      'export function CanvasToolbar() {',
      'export function CanvasToolbar({ onSave }: CanvasToolbarProps) {',
      'CanvasToolbar props signature',
    )
  } else {
    throw new Error('Could not find CanvasToolbar function signature')
  }

  if (!source.includes("const saveAction =")) {
    throw new Error('Could not find saveAction declaration')
  }

  if (!source.includes('const handleSave =')) {
    source = replaceOnce(
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
      'toolbar handleSave bridge',
    )
  }

  source = replaceRegexOnce(
    source,
    /\{saveAction \? \([\s\S]*?\) : null\}/m,
    `{handleSave ? (
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
      ) : null}`,
    'toolbar save render block',
  )

  write(paths.toolbar, source)
}

function writeAuditScript() {
  write(
    paths.auditScript,
    `#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, extname } from 'node:path'

const root = process.cwd()

const SEARCH_ROOTS = [
  'apps/desktop/src-tauri/src',
  'editor',
  'platforms',
  'tests/cross-domain-contract',
]

const IGNORE_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'target',
  '.turbo',
  '.next',
  'coverage',
])

const ALLOWED_EXTS = new Set([
  '.ts',
  '.tsx',
  '.rs',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
])

const forbidden = [
  'serializeDrawDocument',
  'parseDrawDocument',
  'createDrawFileHeader',
  'DrawFileContainer',
  'DrawFileHeader',
  'captureLegacyEditorSnapshot',
  'getSnapshot: captureLegacyEditorSnapshot',
  'readonly getSnapshot: () => TLEditorSnapshot',
]

const allowlist = [
  'apps/desktop/src-tauri/src/commands/document.rs', // explicit native v1 migration reader is allowed
]

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue

    const full = resolve(dir, entry.name)

    if (entry.isDirectory()) {
      walk(full, out)
      continue
    }

    if (!ALLOWED_EXTS.has(extname(entry.name))) continue
    out.push(full)
  }
}

function rel(fullPath) {
  return fullPath.slice(root.length + 1).replaceAll('\\\\', '/')
}

const files = []
for (const base of SEARCH_ROOTS) {
  const full = resolve(root, base)
  if (statSafe(full)?.isDirectory()) {
    walk(full, files)
  }
}

function statSafe(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

const problems = []

for (const file of files) {
  const relative = rel(file)
  if (allowlist.includes(relative)) continue

  const text = readFileSync(file, 'utf8')

  for (const marker of forbidden) {
    if (text.includes(marker)) {
      problems.push({ file: relative, marker })
    }
  }
}

if (problems.length > 0) {
  console.error('Legacy persistence markers still remain:')
  for (const item of problems) {
    console.error(\`- \${item.file}: \${item.marker}\`)
  }
  process.exit(1)
}

console.log('No forbidden legacy persistence markers found.')
`,
  )
}

function main() {
  patchToolbar()
  writeAuditScript()
  console.log('Mainline finalization applied.')
  console.log('Next: node scripts/quality/assert-no-legacy-persistence.mjs')
}

main()
#!/usr/bin/env node

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

const ALLOWED_EXTS = new Set(['.ts', '.tsx', '.rs', '.js', '.mjs', '.cjs', '.json'])

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
  return fullPath.slice(root.length + 1).replaceAll('\\', '/')
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
    console.error(`- ${item.file}: ${item.marker}`)
  }
  process.exit(1)
}

console.log('No forbidden legacy persistence markers found.')

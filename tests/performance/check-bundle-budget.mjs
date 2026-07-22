#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const manifestPath = join(root, 'apps/desktop/dist/.vite/manifest.json')
const baselinePath = join(root, 'tests/performance/bundle-baseline.json')

if (!existsSync(manifestPath)) {
  fail('Vite manifest not found. Run pnpm build:desktop first.')
}

if (!existsSync(baselinePath)) {
  fail('Bundle baseline not found.')
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const distRoot = resolve(dirname(manifestPath), '..')
const files = new Map()

for (const entry of Object.values(manifest)) {
  collect(entry.file, 'javascript')

  for (const file of entry.css ?? []) {
    collect(file, 'css')
  }

  for (const file of entry.assets ?? []) {
    collect(file, 'assets')
  }
}

const current = {
  javascriptBytes: total('javascript'),
  cssBytes: total('css'),
  assetBytes: total('assets'),
}

current.totalBytes = current.javascriptBytes + current.cssBytes + current.assetBytes

const tolerance = baseline.tolerancePercent / 100

const failures = []

for (const key of ['javascriptBytes', 'cssBytes', 'assetBytes', 'totalBytes']) {
  const limit = Math.ceil(baseline[key] * (1 + tolerance))

  if (current[key] > limit) {
    failures.push(`${key}: ${current[key]} bytes exceeds ${limit} bytes`)
  }
}

console.log({
  baseline,
  current,
})

if (failures.length > 0) {
  fail(['Bundle budget exceeded:', ...failures].join('\n'))
}

console.log('Bundle budget passed.')

function collect(file, kind) {
  if (!file || files.has(file)) {
    return
  }

  const path = join(distRoot, file)

  if (existsSync(path)) {
    files.set(file, {
      kind,
      bytes: statSync(path).size,
    })
  }
}

function total(kind) {
  return [...files.values()]
    .filter((file) => file.kind === kind)
    .reduce((sum, file) => sum + file.bytes, 0)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

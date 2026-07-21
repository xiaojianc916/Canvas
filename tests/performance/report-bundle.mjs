#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs'
import {
  dirname,
  join,
  relative,
  resolve,
} from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const manifestPath = join(
  root,
  'apps/desktop/dist/.vite/manifest.json',
)

if (!existsSync(manifestPath)) {
  console.error(
    'Vite manifest not found. Run pnpm build:desktop first.',
  )
  process.exit(1)
}

const manifest = JSON.parse(
  readFileSync(manifestPath, 'utf8'),
)

const distRoot = resolve(
  dirname(manifestPath),
  '..',
)

const assets = new Map()

for (const entry of Object.values(manifest)) {
  collect(entry.file, 'js')

  for (const cssFile of entry.css ?? []) {
    collect(cssFile, 'css')
  }

  for (const asset of entry.assets ?? []) {
    collect(asset, 'asset')
  }
}

const rows = [...assets.values()].sort(
  (left, right) =>
    right.bytes - left.bytes,
)

const totals = rows.reduce(
  (result, row) => {
    result[row.kind] ??= 0
    result[row.kind] += row.bytes
    result.total += row.bytes
    return result
  },
  { total: 0 },
)

console.log('')
console.log('Desktop bundle report')
console.log('=====================')
console.log('')

for (const row of rows) {
  console.log(
    `${formatBytes(row.bytes).padStart(10)}  ${row.kind.padEnd(5)}  ${row.path}`,
  )
}

console.log('')
console.log(
  `JavaScript: ${formatBytes(totals.js ?? 0)}`,
)
console.log(
  `CSS:        ${formatBytes(totals.css ?? 0)}`,
)
console.log(
  `Assets:     ${formatBytes(totals.asset ?? 0)}`,
)
console.log(
  `Total:      ${formatBytes(totals.total)}`,
)
console.log('')

function collect(file, kind) {
  if (!file || assets.has(file)) {
    return
  }

  const absolutePath = join(
    distRoot,
    file,
  )

  if (!existsSync(absolutePath)) {
    return
  }

  assets.set(file, {
    path: relative(
      distRoot,
      absolutePath,
    ).replaceAll('\\', '/'),
    kind,
    bytes: statSync(
      absolutePath,
    ).size,
  })
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KiB`
  }

  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(2)} MiB`
}

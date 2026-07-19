#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const violations = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (['node_modules', 'target', 'dist', '.git'].includes(name)) {
      continue
    }

    const path = join(dir, name)

    if (statSync(path).isDirectory()) {
      walk(path)
    } else {
      check(path)
    }
  }
}

function check(path) {
  if (!/\.(ts|tsx)$/.test(path)) {
    return
  }

  const rel = relative(root, path).replaceAll('\\', '/')
  const text = readFileSync(path, 'utf8')

  if (
    rel.startsWith('foundations/') &&
    /from ['"]@hybrid-canvas\/(canvas|workspace|flowchart|platforms)/.test(text)
  ) {
    violations.push(rel + ': foundations 反向依赖')
  }

  if (
    rel.startsWith('features/') &&
    /@tauri-apps\//.test(text)
  ) {
    violations.push(rel + ': feature 直接依赖 Tauri')
  }

  if (
    !rel.startsWith('editor/core/') &&
    /createTLStore\s*\(/.test(text)
  ) {
    violations.push(rel + ': 非 editor/core 创建 TLStore')
  }
}

walk(root)

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Architecture invariants passed')

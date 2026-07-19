#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const violations = []

const ignoredDirectories = new Set([
  '.git',
  '.refactor-backup',
  '.turbo',
  'dist',
  'node_modules',
  'target',
])

const layerRules = [
  {
    source: 'foundations/',
    forbiddenPackages: /@hybrid-canvas\/(?:asset|canvas|desktop(?:-ipc)?|file|flowchart|freehand|import-export|platforms-desktop-runtime|plugin|scientific-plot|settings|workspace)(?:['"/])?/g,
    message: 'foundations 反向依赖上层包',
  },
  {
    source: 'editor/',
    forbiddenPackages: /@hybrid-canvas\/(?:desktop|platforms-desktop-runtime|workspace)(?:['"/])?/g,
    message: 'editor 依赖应用、平台或产品壳层',
  },
  {
    source: 'features/',
    forbiddenPackages: /@hybrid-canvas\/(?:desktop|desktop-ipc|platforms-desktop-runtime)(?:['"/])?/g,
    message: 'feature 直接依赖桌面平台',
  },
  {
    source: 'platforms/',
    forbiddenPackages: /@hybrid-canvas\/desktop(?=['"/])/g,
    message: 'platform 反向依赖应用入口',
  },
]

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignoredDirectories.has(name)) continue

    const path = join(dir, name)

    if (statSync(path).isDirectory()) {
      walk(path)
    } else {
      check(path)
    }
  }
}

function check(path) {
  if (!/\.(?:ts|tsx)$/.test(path)) return

  const rel = relative(root, path).replaceAll('\\', '/')
  const text = readFileSync(path, 'utf8')

  for (const rule of layerRules) {
    rule.forbiddenPackages.lastIndex = 0
    if (rel.startsWith(rule.source) && rule.forbiddenPackages.test(text)) {
      violations.push(`${rel}: ${rule.message}`)
    }
  }

  if (rel.startsWith('features/') && /@tauri-apps\//.test(text)) {
    violations.push(rel + ': feature 直接依赖 Tauri SDK')
  }

  if (!rel.startsWith('editor/core/') && /createTLStore\s*\(/.test(text)) {
    violations.push(rel + ': 非 editor/core 创建 TLStore')
  }

  if (/from\s+['"]@hybrid-canvas\/[^'"]+\/src\//.test(text)) {
    violations.push(rel + ': 跨包 deep import，必须使用 package exports')
  }

  if (/from\s+['"]\.\.\/\.\.\/(?:apps|editor|features|foundations|platforms)\//.test(text)) {
    violations.push(rel + ': 使用相对路径跨越顶层包边界')
  }
}

walk(root)

if (violations.length) {
  console.error(violations.join('\n'))
  process.exit(1)
}

console.log('Architecture invariants passed')

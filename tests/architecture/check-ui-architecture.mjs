#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.canvas-ui-refactor-backup',
  'dist',
  'node_modules',
  'target',
])

function walk(directory) {
  return fs
    .readdirSync(directory, {
      withFileTypes: true,
    })
    .flatMap((entry) => {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        return []
      }

      const filePath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        return walk(filePath)
      }

      return entry.isFile() ? [filePath] : []
    })
}

const sourceFiles = walk(ROOT).filter(
  (filePath) => filePath.endsWith('.tsx') || filePath.endsWith('.css'),
)

const failures = []

for (const filePath of sourceFiles) {
  const relativePath = path.relative(ROOT, filePath)

  const content = fs.readFileSync(filePath, 'utf8')

  if (filePath.endsWith('.tsx') && /<button\b[^>]*>[\s\S]*?<button\b/.test(content)) {
    failures.push(relativePath + ': 可能存在嵌套 button')
  }

  if (filePath.endsWith('.tsx') && /\b(bg-white|text-black)\b/.test(content)) {
    failures.push(relativePath + ': 使用硬编码主题颜色')
  }

  if (
    filePath.endsWith('.tsx') &&
    /fixed\s+inset-0[\s\S]{0,300}role=["']dialog["']/.test(content) &&
    !relativePath.includes('foundations' + path.sep + 'design-system')
  ) {
    failures.push(relativePath + ': Feature 自行实现 Dialog Overlay')
  }
}

const tokenFile = path.join(ROOT, 'foundations/design-system/src/styles/index.css')

if (!fs.existsSync(tokenFile)) {
  failures.push('缺少 Design System Token 文件')
} else {
  const tokenContent = fs.readFileSync(tokenFile, 'utf8')

  const requiredTokens = [
    '--ui-primary',
    '--ui-destructive',
    '--ui-ring',
    '--ui-z-dialog',
    'prefers-reduced-motion',
  ]

  for (const token of requiredTokens) {
    if (!tokenContent.includes(token)) {
      failures.push('缺少 Design Token：' + token)
    }
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => '- ' + failure).join('\n'))

  process.exitCode = 1
} else {
  console.log('UI architecture checks passed.')
}

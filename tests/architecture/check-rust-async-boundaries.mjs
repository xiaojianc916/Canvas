#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()
const rustRoot = resolve(root, 'apps/desktop/src-tauri/src')

const allowedBlockingFiles = new Set([
  // tauri-plugin-dialog 当前提供 blocking_pick_* 调用。
  // 对话框线程模型将在独立桌面 E2E 中治理。
  'apps/desktop/src-tauri/src/commands/file.rs',
])

async function collectRustFiles(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  const files = []

  for (const entry of entries) {
    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectRustFiles(path)))
      continue
    }

    if (entry.isFile() && extname(entry.name) === '.rs') {
      files.push(path)
    }
  }

  return files
}

function findAsyncFunctions(source) {
  const functions = []
  const pattern =
    /(?:pub\s+)?async\s+fn\s+([A-Za-z0-9_]+)[^{]*\{/g

  for (const match of source.matchAll(pattern)) {
    const bodyStart = match.index + match[0].length
    let depth = 1
    let cursor = bodyStart

    while (cursor < source.length && depth > 0) {
      const character = source[cursor]

      if (character === '{') {
        depth += 1
      } else if (character === '}') {
        depth -= 1
      }

      cursor += 1
    }

    if (depth === 0) {
      functions.push({
        name: match[1],
        body: source.slice(bodyStart, cursor - 1),
      })
    }
  }

  return functions
}

const forbiddenPatterns = [
  {
    name: 'std::fs',
    pattern: /\bstd::fs::/,
  },
  {
    name: 'std::thread::sleep',
    pattern: /\bstd::thread::sleep\s*\(/,
  },
]

const violations = []

for (const path of await collectRustFiles(rustRoot)) {
  const repositoryPath = relative(root, path).replaceAll('\\', '/')
  const source = await readFile(path, 'utf8')

  for (const fn of findAsyncFunctions(source)) {
    for (const forbidden of forbiddenPatterns) {
      if (forbidden.pattern.test(fn.body)) {
        violations.push(
          `${repositoryPath}: async fn ${fn.name} directly uses ${forbidden.name}`,
        )
      }
    }

    if (
      /\bblocking_[A-Za-z0-9_]+\s*\(/.test(fn.body) &&
      !allowedBlockingFiles.has(repositoryPath)
    ) {
      violations.push(
        `${repositoryPath}: async fn ${fn.name} directly invokes a blocking_* API`,
      )
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Rust async boundary check failed:\n' +
      violations.map((item) => `- ${item}`).join('\n'),
  )
  process.exitCode = 1
} else {
  console.log('Rust async boundary check passed.')
}

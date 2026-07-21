#!/usr/bin/env node

import {
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const oldPackageName =
  '@hybrid-canvas/foundations-observability'

const newPackageName =
  '@hybrid-canvas/foundations-observability'

const ignoredDirectories = new Set([
  '.git',
  '.refactor-backup',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'playwright-report',
  'target',
  'test-results',
])

const ignoredFiles = new Set([
  'pnpm-lock.yaml',
  'Cargo.lock',
])

const allowedExtensions = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
])

const changedFiles = []

async function main() {
  await assertWorkspacePackage()
  await walk(root)
  await assertNoOldReferences()

  if (changedFiles.length === 0) {
    console.log(
      `没有发现 ${oldPackageName} 引用。`,
    )
    return
  }

  console.log('')
  console.log('已修复 observability 包名：')

  for (const file of changedFiles) {
    console.log(`  - ${file}`)
  }

  console.log('')
  console.log('接下来执行：')
  console.log('')
  console.log('  pnpm install')
  console.log('  pnpm test:architecture')
  console.log('  pnpm typecheck')
  console.log('  pnpm tauri dev')
  console.log('')
}

async function assertWorkspacePackage() {
  const manifestPath = resolve(
    root,
    'foundations/observability/package.json',
  )

  const manifest = JSON.parse(
    (
      await readFile(manifestPath, 'utf8')
    ).replace(/^\uFEFF/, ''),
  )

  if (manifest.name !== newPackageName) {
    throw new Error(
      [
        'Observability workspace 包名与预期不一致。',
        `预期：${newPackageName}`,
        `实际：${String(manifest.name)}`,
      ].join('\n'),
    )
  }
}

async function walk(directory) {
  const entries = await readdir(directory)

  for (const entry of entries) {
    if (ignoredDirectories.has(entry)) {
      continue
    }

    const path = join(directory, entry)
    const info = await stat(path)

    if (info.isDirectory()) {
      await walk(path)
      continue
    }

    if (ignoredFiles.has(entry)) {
      continue
    }

    if (!allowedExtensions.has(extname(entry))) {
      continue
    }

    await replaceInFile(path)
  }
}

async function replaceInFile(path) {
  const content = await readFile(path, 'utf8')

  if (!content.includes(oldPackageName)) {
    return
  }

  const updated = content.replaceAll(
    oldPackageName,
    newPackageName,
  )

  await writeFile(path, updated, 'utf8')

  changedFiles.push(
    path
      .slice(root.length + 1)
      .replaceAll('\\', '/'),
  )
}

async function assertNoOldReferences() {
  const remaining = []

  async function inspect(directory) {
    const entries = await readdir(directory)

    for (const entry of entries) {
      if (ignoredDirectories.has(entry)) {
        continue
      }

      const path = join(directory, entry)
      const info = await stat(path)

      if (info.isDirectory()) {
        await inspect(path)
        continue
      }

      if (
        ignoredFiles.has(entry) ||
        !allowedExtensions.has(extname(entry))
      ) {
        continue
      }

      const content = await readFile(
        path,
        'utf8',
      )

      if (content.includes(oldPackageName)) {
        remaining.push(
          path
            .slice(root.length + 1)
            .replaceAll('\\', '/'),
        )
      }
    }
  }

  await inspect(root)

  if (remaining.length > 0) {
    throw new Error(
      [
        `仍存在 ${oldPackageName} 引用：`,
        ...remaining.map(
          (file) => `- ${file}`,
        ),
      ].join('\n'),
    )
  }
}

main().catch((error) => {
  console.error('')
  console.error('包名修复失败：')
  console.error(error)
  process.exitCode = 1
})
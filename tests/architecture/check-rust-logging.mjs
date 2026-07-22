#!/usr/bin/env node

/**
 * Rust 日志架构门禁。
 *
 * 当前项目选择：
 *   log facade -> tauri-plugin-log -> stdout/file/WebView
 *
 * 禁止重新直接引入 tracing，避免形成两套日志字段、过滤器和初始化流程。
 */

import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import process from 'node:process'

const root = process.cwd()

const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'build',
  'generated',
  'gen',
])

async function collectRustFiles(directory) {
  const files = []
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue
    }

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

const forbiddenSourcePatterns = [
  {
    name: 'tracing path',
    pattern: /\btracing::/,
  },
  {
    name: 'tracing import',
    pattern: /\buse\s+tracing(?:\s*::|\s*\{)/,
  },
  {
    name: 'tracing instrument attribute',
    pattern: /#\[\s*tracing::instrument\b/,
  },
]

const violations = []

for (const path of await collectRustFiles(root)) {
  const content = await readFile(path, 'utf8')
  const repositoryPath = relative(root, path).replaceAll('\\', '/')

  for (const forbidden of forbiddenSourcePatterns) {
    if (forbidden.pattern.test(content)) {
      violations.push(`${repositoryPath}: contains ${forbidden.name}`)
    }
  }
}

const cargoFiles = []

async function collectCargoFiles(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue
    }

    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      await collectCargoFiles(path)
      continue
    }

    if (entry.isFile() && entry.name === 'Cargo.toml') {
      cargoFiles.push(path)
    }
  }
}

await collectCargoFiles(root)

for (const path of cargoFiles) {
  const content = await readFile(path, 'utf8')
  const repositoryPath = relative(root, path).replaceAll('\\', '/')

  if (/^(?:tracing|tracing-appender|tracing-subscriber)(?:\.workspace)?\s*=/m.test(content)) {
    violations.push(`${repositoryPath}: declares a tracing dependency`)
  }
}

const loggingBootstrap = resolve(root, 'apps/desktop/src-tauri/src/bootstrap/logging.rs')
const bootstrapContent = await readFile(loggingBootstrap, 'utf8')

const requiredBootstrapFragments = [
  'use log::LevelFilter;',
  'tauri_plugin_log::Builder::new()',
  'TargetKind::LogDir',
  'TargetKind::Webview',
]

for (const fragment of requiredBootstrapFragments) {
  if (!bootstrapContent.includes(fragment)) {
    violations.push(`logging bootstrap is missing: ${fragment}`)
  }
}

if (violations.length > 0) {
  console.error(
    [
      'Rust logging architecture check failed:',
      ...violations.map((violation) => `- ${violation}`),
    ].join('\n'),
  )

  process.exitCode = 1
} else {
  console.log('Rust logging architecture check passed.')
}

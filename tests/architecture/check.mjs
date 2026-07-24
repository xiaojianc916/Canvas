#!/usr/bin/env node
/* biome-ignore-all lint/suspicious/noConsole: This CLI reports architecture violations. */

import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const sourceRoots = ['apps', 'editor', 'features', 'foundations', 'platforms']
const ignoredDirectories = new Set([
  '.git',
  '.turbo',
  'build',
  'dist',
  'generated',
  'node_modules',
  'target',
])
const sourceExtensions = new Set(['.ts', '.tsx'])
const violations = []

const layerRules = [
  {
    layer: 'foundations',
    pattern:
      /@hybrid-canvas\\/(?:asset|canvas|desktop(?:-ipc)?|document|file|platforms-desktop-runtime|plugin|settings|workspace)(?=['\\/])/,
    message: 'foundations must not depend on higher-level packages',
  },
  {
    layer: 'editor',
    pattern: /@hybrid-canvas\\/(?:desktop|desktop-ipc|platforms-desktop-runtime|workspace)(?=['\\/])/,
    message: 'editor must not depend on application, workspace, or desktop runtime packages',
  },
  {
    layer: 'features',
    pattern:
      /(?:@tauri-apps\\/|@hybrid-canvas\\/(?:desktop|desktop-ipc|platforms-desktop-runtime)(?=['\\/]))/,
    message: 'features must not depend directly on Tauri or desktop runtime packages',
  },
  {
    layer: 'platforms',
    pattern: /@hybrid-canvas\\/desktop(?=['\\/])/,
    message: 'platform packages must not depend on application entry packages',
  },
]

function relativePath(path) {
  return relative(root, path).replaceAll('\\\\', '/')
}

function layerFor(path) {
  return path.split('/')[0]
}

function isSourceFile(path) {
  return sourceExtensions.has(extname(path)) && !/\\.(?:test|spec)\\.[jt]sx?$/.test(path)
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue
    }

    const path = join(directory, entry.name)

    if (entry.isDirectory()) {
      await walk(path)
      continue
    }

    if (entry.isFile() && isSourceFile(path)) {
      await checkFile(path)
    }
  }
}

async function checkFile(path) {
  const source = await readFile(path, 'utf8')
  const file = relativePath(path)
  const layer = layerFor(file)

  if (/from\\s+['"]@hybrid-canvas\\/[^'"]+\\/src\\//.test(source)) {
    violations.push(file + ': cross-package imports must use public package exports')
  }

  if (/from\\s+['"](?:\\.\\.\\/){2,}(?:apps|editor|features|foundations|platforms)\\//.test(source)) {
    violations.push(file + ': relative imports must not cross top-level package boundaries')
  }

  for (const rule of layerRules) {
    if (rule.layer === layer && rule.pattern.test(source)) {
      violations.push(file + ': ' + rule.message)
    }
  }
}

async function main() {
  for (const sourceRoot of sourceRoots) {
    await walk(join(root, sourceRoot))
  }

  if (violations.length === 0) {
    console.log('Architecture boundaries passed.')
    return
  }

  console.error('Architecture boundary violations:')
  for (const violation of violations) {
    console.error('- ' + violation)
  }

  process.exitCode = 1
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})

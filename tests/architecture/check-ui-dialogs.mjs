#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.turbo',
  '.canvas-ui-refactor-backup',
  '.canvas-ui-phase-2a-backup',
  'dist',
  'node_modules',
  'target',
])

function walk(directory) {
  return fs
    .readdirSync(
      directory,
      {
        withFileTypes: true,
      },
    )
    .flatMap((entry) => {
      if (
        IGNORED_DIRECTORIES.has(
          entry.name,
        )
      ) {
        return []
      }

      const entryPath = path.join(
        directory,
        entry.name,
      )

      if (entry.isDirectory()) {
        return walk(entryPath)
      }

      return entry.isFile()
        ? [entryPath]
        : []
    })
}

const sourceFiles = walk(ROOT).filter(
  (filePath) =>
    filePath.endsWith('.tsx'),
)

const failures = []

for (const filePath of sourceFiles) {
  const relativePath =
    path.relative(ROOT, filePath)

  const normalizedPath =
    relativePath.split(path.sep).join('/')

  const content =
    fs.readFileSync(
      filePath,
      'utf8',
    )

  const isDesignSystemDialog =
    normalizedPath.startsWith(
      'foundations/design-system/' +
        'src/components/ui/',
    )

  if (
    !isDesignSystemDialog &&
    /role=["']dialog["']/.test(content) &&
    /fixed[\s\S]{0,300}inset-0/.test(
      content,
    )
  ) {
    failures.push(
      normalizedPath +
        ': Feature 不应自行实现 Dialog Overlay',
    )
  }

  if (
    /role=["']dialog["']/.test(content) &&
    !/aria-labelledby=/.test(content)
  ) {
    failures.push(
      normalizedPath +
        ': Dialog 缺少 aria-labelledby',
    )
  }

  if (
    /role=["']dialog["']/.test(content) &&
    !/aria-modal=/.test(content)
  ) {
    failures.push(
      normalizedPath +
        ': Dialog 缺少 aria-modal',
    )
  }
}

if (failures.length > 0) {
  console.error(

  process.exitCode = 1
} else {
  console.log(
    'Dialog architecture checks passed.',
  )
}

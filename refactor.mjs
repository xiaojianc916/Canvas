#!/usr/bin/env node

import {
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()

const WORKSPACE_CONTAINER =
  'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx'

const LEGACY_BOUNDARY =
  'apps/desktop/src/presentation/boundaries/UiErrorBoundary.tsx'

const LEGACY_BOUNDARY_DIRECTORY =
  'apps/desktop/src/presentation/boundaries'

async function main() {
  await assertRepository()
  await repairWorkspaceContainer()
  await removeLegacyBoundary()
  await verifyNoLegacyReferences()

  console.log('')
  console.log('UiErrorBoundary residual references removed.')
  console.log('')
  console.log('Next steps:')
  console.log('  pnpm format')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
  console.log('')
  console.log(
    'Restart the Vite development process after applying this repair.',
  )
}

async function assertRepository() {
  const packagePath = resolvePath('package.json')
  const source = await readFile(packagePath, 'utf8')
  const packageJson = JSON.parse(source)

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      'Run this script from the Hybrid Canvas repository root.',
    )
  }
}

async function repairWorkspaceContainer() {
  const filePath = resolvePath(WORKSPACE_CONTAINER)
  let source = await readFile(filePath, 'utf8')

  const originalSource = source

  source = source.replace(
    /\n?import\s+\{\s*UiErrorBoundary\s*\}\s+from\s+['"]\.\.\/boundaries\/UiErrorBoundary['"]\s*;?\s*\n/,
    '\n',
  )

  const wrappedEditorSessionHost =
    /return\s*\(\s*<UiErrorBoundary\s+area=(?:"画布编辑器"|'画布编辑器')\s*>\s*(<EditorSessionHost[\s\S]*?\/>)\s*<\/UiErrorBoundary>\s*\)/

  if (!wrappedEditorSessionHost.test(source)) {
    if (source.includes('UiErrorBoundary')) {
      throw new Error(
        'WorkspaceContainer still contains an unsupported UiErrorBoundary structure. Refusing to make a partial edit.',
      )
    }
  } else {
    source = source.replace(
      wrappedEditorSessionHost,
      (_match, editorSessionHost) => {
        const normalizedHost = editorSessionHost
          .split('\n')
          .map((line) => line.trimEnd())
          .join('\n')

        return [
          'return (',
          indent(normalizedHost, 4),
          '    )',
        ].join('\n')
      },
    )
  }

  if (source === originalSource) {
    if (!source.includes('UiErrorBoundary')) {
      console.log(
        WORKSPACE_CONTAINER +
          ': no legacy boundary references found.',
      )
      return
    }

    throw new Error(
      'No changes were made, but UiErrorBoundary references still exist.',
    )
  }

  if (source.includes('UiErrorBoundary')) {
    throw new Error(
      'The repair did not remove every UiErrorBoundary reference from WorkspaceContainer.',
    )
  }

  await writeFile(
    filePath,
    normalizeContent(source),
    'utf8',
  )

  console.log(
    WORKSPACE_CONTAINER +
      ': removed legacy canvas boundary.',
  )
}

async function removeLegacyBoundary() {
  await rm(resolvePath(LEGACY_BOUNDARY), {
    force: true,
  })

  try {
    await rm(resolvePath(LEGACY_BOUNDARY_DIRECTORY), {
      recursive: false,
    })
  } catch {
    // Keep the directory if it contains another legitimate boundary.
  }
}

async function verifyNoLegacyReferences() {
  const sourceRoot = resolvePath(
    'apps/desktop/src',
  )

  const files = await walk(sourceRoot)
  const failures = []

  for (const filePath of files) {
    if (
      !filePath.endsWith('.ts') &&
      !filePath.endsWith('.tsx')
    ) {
      continue
    }

    const source = await readFile(filePath, 'utf8')

    if (
      source.includes('UiErrorBoundary') ||
      source.includes(
        'boundaries/UiErrorBoundary',
      )
    ) {
      failures.push(
        path
          .relative(ROOT, filePath)
          .split(path.sep)
          .join('/'),
      )
    }
  }

  if (failures.length > 0) {
    throw new Error(
      [
        'Legacy UiErrorBoundary references remain:',
        ...failures.map(
          (filePath) => '  - ' + filePath,
        ),
      ].join('\n'),
    )
  }

  console.log(
    'Verification passed: no UiErrorBoundary references remain.',
  )
}

async function walk(directory) {
  const entries = await readdir(directory, {
    withFileTypes: true,
  })

  const files = []

  for (const entry of entries) {
    const entryPath = path.join(
      directory,
      entry.name,
    )

    if (entry.isDirectory()) {
      files.push(...(await walk(entryPath)))
      continue
    }

    if (entry.isFile()) {
      files.push(entryPath)
    }
  }

  return files
}

function indent(source, spaces) {
  const prefix = ' '.repeat(spaces)

  return source
    .split('\n')
    .map((line) =>
      line.length > 0 ? prefix + line : line,
    )
    .join('\n')
}

function normalizeContent(source) {
  return (
    source
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  )
}

function resolvePath(relativePath) {
  return path.join(ROOT, relativePath)
}

main().catch((error) => {
  console.error('')
  console.error('Fatal boundary repair failed.')
  console.error(
    error instanceof Error
      ? error.stack ?? error.message
      : error,
  )
  process.exitCode = 1
})
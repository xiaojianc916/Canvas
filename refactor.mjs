#!/usr/bin/env node

import {
  access,
  copyFile,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.dirname(
  fileURLToPath(import.meta.url),
)

const DRY_RUN =
  process.argv.includes('--dry-run')

const TOOLS_DIRECTORY = path.join(
  ROOT_DIR,
  'apps/desktop/src/presentation/workspace/inspector/tools',
)

const DESKTOP_SOURCE_DIRECTORY = path.join(
  ROOT_DIR,
  'apps/desktop/src',
)

const PATHS = {
  packageJson: path.join(
    ROOT_DIR,
    'package.json',
  ),

  registry: path.join(
    TOOLS_DIRECTORY,
    'ToolInspectorRegistry.tsx',
  ),

  index: path.join(
    TOOLS_DIRECTORY,
    'index.ts',
  ),

  legacyArrow: path.join(
    TOOLS_DIRECTORY,
    'ArrowToolInspector.tsx',
  ),

  legacyDraw: path.join(
    TOOLS_DIRECTORY,
    'DrawToolInspector.tsx',
  ),

  legacyScientificChart: path.join(
    TOOLS_DIRECTORY,
    'ScientificChartToolInspector.tsx',
  ),

  freehandExtension: path.join(
    ROOT_DIR,
    'features/freehand/src/extension.ts',
  ),

  flowchartExtension: path.join(
    ROOT_DIR,
    'features/flowchart/src/extension.ts',
  ),

  scientificPlotExtension: path.join(
    ROOT_DIR,
    'features/scientific-plot/src/extension.ts',
  ),
}

const LEGACY_FILES = [
  PATHS.legacyArrow,
  PATHS.legacyDraw,
  PATHS.legacyScientificChart,
]

async function main() {
  console.log('')
  console.log(
    'Hybrid Canvas — Remove Legacy Feature Tool Inspectors',
  )
  console.log(`Repository: ${ROOT_DIR}`)
  console.log(
    `Mode: ${DRY_RUN ? 'dry-run' : 'write'}`,
  )
  console.log('')

  await validateRepository()

  const registrySource =
    await readUtf8(PATHS.registry)

  const indexSource =
    await readUtf8(PATHS.index)

  const transformedRegistry =
    transformRegistry(registrySource)

  const transformedIndex =
    transformIndex(indexSource)

  validateTransformedSources(
    transformedRegistry,
    transformedIndex,
  )

  if (DRY_RUN) {
    console.log('✓ Freehand Feature contribution detected')
    console.log('✓ Flowchart Feature contribution detected')
    console.log('✓ Scientific Plot contribution detected')
    console.log('✓ Legacy Arrow inspector detected')
    console.log('✓ Legacy Draw inspector detected')
    console.log('✓ Legacy Chart inspector detected')
    console.log('✓ Registry can be cleaned safely')
    console.log('✓ Barrel exports can be cleaned safely')
    console.log('✓ No files were changed')
    console.log('')
    return
  }

  const backupDirectory =
    await createBackupDirectory()

  for (const filePath of [
    PATHS.registry,
    PATHS.index,
    ...LEGACY_FILES,
  ]) {
    await backupFile(
      filePath,
      path.join(
        backupDirectory,
        path.relative(ROOT_DIR, filePath),
      ),
    )
  }

  await writeUtf8(
    PATHS.registry,
    transformedRegistry,
  )

  await writeUtf8(
    PATHS.index,
    transformedIndex,
  )

  const remainingReferences =
    await findLegacyReferences()

  if (remainingReferences.length > 0) {
    throw new Error(
      'Legacy inspectors are still referenced after registry cleanup:\n' +
        remainingReferences
          .map(
            (reference) =>
              '  - ' + reference,
          )
          .join('\n'),
    )
  }

  for (const filePath of LEGACY_FILES) {
    await unlink(filePath)

    console.log(
      `Deleted: ${relative(filePath)}`,
    )
  }

  console.log('')
  console.log(
    `Backup: ${relative(backupDirectory)}`,
  )
  console.log('')
  console.log('Legacy cleanup complete:')
  console.log('  ✓ App ArrowToolInspector deleted')
  console.log('  ✓ App DrawToolInspector deleted')
  console.log(
    '  ✓ App ScientificChartToolInspector deleted',
  )
  console.log(
    '  ✓ Core feature-owned contributions removed',
  )
  console.log(
    '  ✓ Legacy barrel exports removed',
  )
  console.log(
    '  ✓ Feature extensions are now the sole owners',
  )
  console.log('')
  console.log('Run validation:')
  console.log(
    '  pnpm exec biome check --write apps/desktop/src/presentation/workspace/inspector/tools',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('')
}

function transformRegistry(source) {
  let next = source

  const obsoleteImports = [
    `import { ArrowToolInspector } from './ArrowToolInspector'
`,
    `import { DrawToolInspector } from './DrawToolInspector'
`,
    `import { ScientificChartToolInspector } from './ScientificChartToolInspector'
`,
    `import type { ToolInspectorProps } from './types'
`,
  ]

  for (const obsoleteImport of obsoleteImports) {
    next = replaceRequired(
      next,
      obsoleteImport,
      '',
      'obsolete Registry import',
    )
  }

  next = removeBlock(
    next,
    'function DrawInspector(',
    '/**',
    'legacy Draw/Highlight wrappers',
  )

  const oldCommentStart = next.indexOf(
    '/**',
  )

  const contributionStart = next.indexOf(
    'export const CORE_TOOL_INSPECTOR_CONTRIBUTIONS:',
    oldCommentStart,
  )

  if (
    oldCommentStart === -1 ||
    contributionStart === -1
  ) {
    throw new Error(
      'Could not locate the legacy Core contribution comment.',
    )
  }

  const newComment = `/**
 * App-owned inspectors for generic tldraw tools only.
 *
 * Feature-owned tools are intentionally absent:
 *
 * - draw/highlight are owned by @hybrid-canvas/freehand
 * - arrow is owned by @hybrid-canvas/flowchart
 * - scientific-chart is owned by @hybrid-canvas/scientific-plot
 *
 * Missing Feature contributions must resolve to UnknownToolInspector.
 * Do not add duplicate App fallbacks.
 */
`

  next =
    next.slice(0, oldCommentStart) +
    newComment +
    next.slice(contributionStart)

  for (const toolId of [
    'arrow',
    'draw',
    'highlight',
    'scientific-chart',
  ]) {
    next = removeContribution(
      next,
      toolId,
    )
  }

  next = next.replace(/\n{3,}/g, '\n\n')

  return next.trimEnd() + '\n'
}

function transformIndex(source) {
  let next = source

  const obsoleteExports = [
    `export { ArrowToolInspector } from './ArrowToolInspector'
`,
    `export { DrawToolInspector } from './DrawToolInspector'
`,
    `export { ScientificChartToolInspector } from './ScientificChartToolInspector'
`,
  ]

  for (const obsoleteExport of obsoleteExports) {
    next = replaceRequired(
      next,
      obsoleteExport,
      '',
      'obsolete tools barrel export',
    )
  }

  return next.trimEnd() + '\n'
}

function removeContribution(
  source,
  toolId,
) {
  const marker =
    `      toolId: '${toolId}',`

  const markerIndex =
    source.indexOf(marker)

  if (markerIndex === -1) {
    throw new Error(
      `Core contribution not found: ${toolId}`,
    )
  }

  const blockStart =
    source.lastIndexOf(
      '    {',
      markerIndex,
    )

  const blockEndMarker = '\n    },'
  const blockEnd =
    source.indexOf(
      blockEndMarker,
      markerIndex,
    )

  if (
    blockStart === -1 ||
    blockEnd === -1
  ) {
    throw new Error(
      `Could not determine contribution block: ${toolId}`,
    )
  }

  return (
    source.slice(0, blockStart) +
    source.slice(
      blockEnd +
        blockEndMarker.length,
    )
  )
}

function removeBlock(
  source,
  startMarker,
  endMarker,
  label,
) {
  const startIndex =
    source.indexOf(startMarker)

  const endIndex =
    source.indexOf(
      endMarker,
      startIndex,
    )

  if (
    startIndex === -1 ||
    endIndex === -1 ||
    endIndex <= startIndex
  ) {
    throw new Error(
      `Could not remove ${label}.`,
    )
  }

  return (
    source.slice(0, startIndex) +
    source.slice(endIndex)
  )
}

function validateTransformedSources(
  registry,
  index,
) {
  const forbiddenRegistryValues = [
    'ArrowToolInspector',
    'DrawToolInspector',
    'ScientificChartToolInspector',
    "toolId: 'arrow'",
    "toolId: 'draw'",
    "toolId: 'highlight'",
    "toolId: 'scientific-chart'",
    'function DrawInspector',
    'function HighlightInspector',
  ]

  for (
    const forbiddenValue of
    forbiddenRegistryValues
  ) {
    if (
      registry.includes(forbiddenValue)
    ) {
      throw new Error(
        'Registry cleanup was incomplete: ' +
          forbiddenValue,
      )
    }
  }

  const forbiddenIndexValues = [
    './ArrowToolInspector',
    './DrawToolInspector',
    './ScientificChartToolInspector',
  ]

  for (
    const forbiddenValue of
    forbiddenIndexValues
  ) {
    if (
      index.includes(forbiddenValue)
    ) {
      throw new Error(
        'Barrel cleanup was incomplete: ' +
          forbiddenValue,
      )
    }
  }

  const requiredCoreTools = [
    "toolId: 'select'",
    "toolId: 'hand'",
    "toolId: 'geo'",
    "toolId: 'line'",
    "toolId: 'eraser'",
    "toolId: 'text'",
    "toolId: 'note'",
    "toolId: 'frame'",
  ]

  for (
    const requiredTool of
    requiredCoreTools
  ) {
    if (!registry.includes(requiredTool)) {
      throw new Error(
        'Required Core inspector was removed unexpectedly: ' +
          requiredTool,
      )
    }
  }
}

async function validateRepository() {
  for (
    const filePath of
    Object.values(PATHS)
  ) {
    await assertFile(filePath)
  }

  const freehandExtension =
    await readUtf8(
      PATHS.freehandExtension,
    )

  const flowchartExtension =
    await readUtf8(
      PATHS.flowchartExtension,
    )

  const scientificExtension =
    await readUtf8(
      PATHS.scientificPlotExtension,
    )

  assertFeatureContribution(
    freehandExtension,
    'draw',
    '@hybrid-canvas/freehand',
  )

  assertFeatureContribution(
    freehandExtension,
    'highlight',
    '@hybrid-canvas/freehand',
  )

  assertFeatureContribution(
    flowchartExtension,
    'arrow',
    '@hybrid-canvas/flowchart',
  )

  assertFeatureContribution(
    scientificExtension,
    'scientific-chart',
    '@hybrid-canvas/scientific-plot',
  )

  const registry =
    await readUtf8(PATHS.registry)

  for (const toolId of [
    'arrow',
    'draw',
    'highlight',
    'scientific-chart',
  ]) {
    if (
      !registry.includes(
        `toolId: '${toolId}'`,
      )
    ) {
      throw new Error(
        `Legacy Core contribution is already missing: ${toolId}`,
      )
    }
  }
}

function assertFeatureContribution(
  source,
  toolId,
  owner,
) {
  if (
    !source.includes(
      `toolId: '${toolId}'`,
    ) ||
    !source.includes(
      `owner: '${owner}'`,
    )
  ) {
    throw new Error(
      `Required Feature contribution is missing: ${owner}/${toolId}`,
    )
  }
}

async function findLegacyReferences() {
  const sourceFiles =
    await collectSourceFiles(
      DESKTOP_SOURCE_DIRECTORY,
    )

  const legacyNames = [
    'ArrowToolInspector',
    'DrawToolInspector',
    'ScientificChartToolInspector',
  ]

  const legacyPaths = new Set(
    LEGACY_FILES.map(
      (filePath) =>
        path.resolve(filePath),
    ),
  )

  const references = []

  for (const filePath of sourceFiles) {
    if (
      legacyPaths.has(
        path.resolve(filePath),
      )
    ) {
      continue
    }

    const source =
      await readUtf8(filePath)

    for (const legacyName of legacyNames) {
      if (source.includes(legacyName)) {
        references.push(
          relative(filePath) +
            ': ' +
            legacyName,
        )
      }
    }
  }

  return references
}

async function collectSourceFiles(
  directory,
) {
  const entries = await readdir(
    directory,
    {
      withFileTypes: true,
    },
  )

  const files = []

  for (const entry of entries) {
    const entryPath = path.join(
      directory,
      entry.name,
    )

    if (entry.isDirectory()) {
      files.push(
        ...await collectSourceFiles(
          entryPath,
        ),
      )

      continue
    }

    if (
      entry.isFile() &&
      (
        entry.name.endsWith('.ts') ||
        entry.name.endsWith('.tsx')
      )
    ) {
      files.push(entryPath)
    }
  }

  return files
}

function replaceRequired(
  source,
  oldValue,
  newValue,
  label,
) {
  if (!source.includes(oldValue)) {
    throw new Error(
      `Could not update ${label}.\n` +
        'The source differs from the expected remote version.',
    )
  }

  return source.replace(
    oldValue,
    newValue,
  )
}

async function assertFile(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(
      `Missing required file: ${relative(filePath)}`,
    )
  }
}

async function createBackupDirectory() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupDirectory = path.join(
    ROOT_DIR,
    '.refactor-backup',
    `remove-legacy-tool-inspectors-${timestamp}`,
  )

  await mkdir(
    backupDirectory,
    {
      recursive: true,
    },
  )

  return backupDirectory
}

async function backupFile(
  sourcePath,
  destinationPath,
) {
  await mkdir(
    path.dirname(destinationPath),
    {
      recursive: true,
    },
  )

  await copyFile(
    sourcePath,
    destinationPath,
  )
}

async function readUtf8(filePath) {
  return readFile(filePath, 'utf8')
}

async function writeUtf8(
  filePath,
  source,
) {
  await mkdir(
    path.dirname(filePath),
    {
      recursive: true,
    },
  )

  await writeFile(
    filePath,
    source
      .replaceAll('\r\n', '\n')
      .replace(/^\uFEFF/, '')
      .trimEnd() + '\n',
    'utf8',
  )

  console.log(
    `Updated: ${relative(filePath)}`,
  )
}

function relative(filePath) {
  return (
    path.relative(
      ROOT_DIR,
      filePath,
    ) || '.'
  )
}

main().catch((error) => {
  console.error('')
  console.error(
    'Legacy tool inspector cleanup failed.',
  )
  console.error(
    error instanceof Error
      ? error.message
      : error,
  )
  console.error('')
  process.exitCode = 1
})
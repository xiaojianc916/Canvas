#!/usr/bin/env node

import {
  access,
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DRY_RUN = process.argv.includes('--dry-run')

const TOOLS_DIRECTORY = path.join(
  ROOT_DIR,
  'apps/desktop/src/presentation/workspace/inspector/tools',
)

const PATHS = {
  packageJson: path.join(ROOT_DIR, 'package.json'),

  router: path.join(
    TOOLS_DIRECTORY,
    'ToolInspectorRouter.tsx',
  ),

  registry: path.join(
    TOOLS_DIRECTORY,
    'ToolInspectorRegistry.tsx',
  ),

  index: path.join(
    TOOLS_DIRECTORY,
    'index.ts',
  ),
}

const REGISTRY_SOURCE = `import type { ComponentType } from 'react'
import { ArrowToolInspector } from './ArrowToolInspector'
import { DrawToolInspector } from './DrawToolInspector'
import { EraserToolInspector } from './EraserToolInspector'
import { FrameToolInspector } from './FrameToolInspector'
import { HandToolInspector } from './HandToolInspector'
import { LineToolInspector } from './LineToolInspector'
import { NoteToolInspector } from './NoteToolInspector'
import { ScientificChartToolInspector } from './ScientificChartToolInspector'
import { SelectToolInspector } from './SelectToolInspector'
import { ShapeToolInspector } from './ShapeToolInspector'
import { TextToolInspector } from './TextToolInspector'
import type { ToolInspectorProps } from './types'

export interface ToolInspectorContribution {
  /**
   * The exact tldraw StateNode tool id.
   */
  readonly toolId: string

  /**
   * Higher-priority contributions override lower-priority contributions
   * for the same tool id.
   *
   * Core inspectors use priority 0. Feature-owned inspectors should
   * normally use priority 100.
   */
  readonly priority?: number

  /**
   * Stable owner identifier used for diagnostics.
   *
   * Examples:
   * - core
   * - freehand
   * - flowchart
   * - scientific-plot
   */
  readonly owner: string

  readonly component: ComponentType<ToolInspectorProps>
}

export interface ToolInspectorResolution {
  readonly toolId: string
  readonly owner: string
  readonly priority: number
  readonly component: ComponentType<ToolInspectorProps>
}

function DrawInspector(
  props: ToolInspectorProps,
) {
  return (
    <DrawToolInspector
      {...props}
      variant="draw"
    />
  )
}

function HighlightInspector(
  props: ToolInspectorProps,
) {
  return (
    <DrawToolInspector
      {...props}
      variant="highlight"
    />
  )
}

/**
 * Temporary core contribution list.
 *
 * Domain-specific entries will move to their owning Feature packages:
 *
 * - draw/highlight -> @hybrid-canvas/freehand
 * - arrow -> @hybrid-canvas/flowchart
 * - scientific-chart -> @hybrid-canvas/scientific-plot
 */
export const CORE_TOOL_INSPECTOR_CONTRIBUTIONS:
  readonly ToolInspectorContribution[] = [
    {
      toolId: 'select',
      owner: 'core',
      component: SelectToolInspector,
    },
    {
      toolId: 'hand',
      owner: 'core',
      component: HandToolInspector,
    },
    {
      toolId: 'geo',
      owner: 'core',
      component: ShapeToolInspector,
    },
    {
      toolId: 'line',
      owner: 'core',
      component: LineToolInspector,
    },
    {
      toolId: 'arrow',
      owner: 'core',
      component: ArrowToolInspector,
    },
    {
      toolId: 'draw',
      owner: 'core',
      component: DrawInspector,
    },
    {
      toolId: 'highlight',
      owner: 'core',
      component: HighlightInspector,
    },
    {
      toolId: 'eraser',
      owner: 'core',
      component: EraserToolInspector,
    },
    {
      toolId: 'text',
      owner: 'core',
      component: TextToolInspector,
    },
    {
      toolId: 'note',
      owner: 'core',
      component: NoteToolInspector,
    },
    {
      toolId: 'frame',
      owner: 'core',
      component: FrameToolInspector,
    },
    {
      toolId: 'scientific-chart',
      owner: 'core',
      component: ScientificChartToolInspector,
    },
  ]

export class ToolInspectorRegistry {
  readonly #resolutions: ReadonlyMap<
    string,
    ToolInspectorResolution
  >

  constructor(
    contributions:
      readonly ToolInspectorContribution[],
  ) {
    this.#resolutions =
      buildResolutionMap(contributions)
  }

  resolve(
    toolId: string,
  ): ToolInspectorResolution | null {
    return this.#resolutions.get(toolId) ?? null
  }

  has(toolId: string): boolean {
    return this.#resolutions.has(toolId)
  }

  list(): readonly ToolInspectorResolution[] {
    return Array.from(
      this.#resolutions.values(),
    ).sort((left, right) =>
      left.toolId.localeCompare(right.toolId),
    )
  }
}

export function createToolInspectorRegistry(
  contributions:
    readonly ToolInspectorContribution[] = [],
): ToolInspectorRegistry {
  return new ToolInspectorRegistry([
    ...CORE_TOOL_INSPECTOR_CONTRIBUTIONS,
    ...contributions,
  ])
}

export const defaultToolInspectorRegistry =
  createToolInspectorRegistry()

function buildResolutionMap(
  contributions:
    readonly ToolInspectorContribution[],
): ReadonlyMap<
  string,
  ToolInspectorResolution
> {
  const resolutions = new Map<
    string,
    ToolInspectorResolution
  >()

  for (const contribution of contributions) {
    validateContribution(contribution)

    const priority =
      contribution.priority ?? 0

    const existing = resolutions.get(
      contribution.toolId,
    )

    if (
      existing &&
      existing.priority === priority
    ) {
      throw new Error(
        'Conflicting tool inspector contributions for "' +
          contribution.toolId +
          '" at priority ' +
          String(priority) +
          ': "' +
          existing.owner +
          '" and "' +
          contribution.owner +
          '".',
      )
    }

    if (
      !existing ||
      priority > existing.priority
    ) {
      resolutions.set(
        contribution.toolId,
        {
          toolId: contribution.toolId,
          owner: contribution.owner,
          priority,
          component: contribution.component,
        },
      )
    }
  }

  return resolutions
}

function validateContribution(
  contribution:
    ToolInspectorContribution,
): void {
  if (!contribution.toolId.trim()) {
    throw new Error(
      'Tool inspector contribution requires a toolId.',
    )
  }

  if (!contribution.owner.trim()) {
    throw new Error(
      'Tool inspector contribution "' +
        contribution.toolId +
        '" requires an owner.',
    )
  }

  if (
    typeof contribution.component !==
    'function'
  ) {
    throw new Error(
      'Tool inspector contribution "' +
        contribution.toolId +
        '" requires a React component.',
    )
  }

  if (
    contribution.priority !== undefined &&
    !Number.isFinite(
      contribution.priority,
    )
  ) {
    throw new Error(
      'Tool inspector contribution "' +
        contribution.toolId +
        '" has an invalid priority.',
    )
  }
}
`

const ROUTER_SOURCE = `import {
  defaultToolInspectorRegistry,
  type ToolInspectorRegistry,
} from './ToolInspectorRegistry'
import type { ToolInspectorRouterProps } from './types'
import { UnknownToolInspector } from './UnknownToolInspector'

export interface RegisteredToolInspectorRouterProps
  extends ToolInspectorRouterProps {
  readonly registry?: ToolInspectorRegistry
}

export function ToolInspectorRouter({
  editor,
  toolId,
  registry = defaultToolInspectorRegistry,
}: RegisteredToolInspectorRouterProps) {
  const resolution = registry.resolve(toolId)

  if (!resolution) {
    return (
      <UnknownToolInspector
        editor={editor}
        toolId={toolId}
      />
    )
  }

  const Inspector = resolution.component

  return <Inspector editor={editor} />
}
`

function transformIndex(source) {
  if (
    source.includes(
      "from './ToolInspectorRegistry'",
    )
  ) {
    return source
  }

  return (
    source.trimEnd() +
    `

export {
  CORE_TOOL_INSPECTOR_CONTRIBUTIONS,
  ToolInspectorRegistry,
  createToolInspectorRegistry,
  defaultToolInspectorRegistry,
  type ToolInspectorContribution,
  type ToolInspectorResolution,
} from './ToolInspectorRegistry'
`
  )
}

async function main() {
  console.log('')
  console.log('Hybrid Canvas — Tool Inspector Registry Refactor')
  console.log(`Repository: ${ROOT_DIR}`)
  console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'write'}`)
  console.log('')

  await validateRepository()

  const indexSource = await readUtf8(
    PATHS.index,
  )

  const transformedIndex =
    transformIndex(indexSource)

  if (DRY_RUN) {
    console.log('✓ Current switch router detected')
    console.log('✓ All current tool inspectors detected')
    console.log('✓ Registry can be generated')
    console.log('✓ Router can be replaced safely')
    console.log('✓ No files were changed')
    console.log('')
    return
  }

  const backupDirectory =
    await createBackupDirectory()

  await backupFile(
    PATHS.router,
    path.join(
      backupDirectory,
      'ToolInspectorRouter.tsx',
    ),
  )

  await backupFile(
    PATHS.index,
    path.join(
      backupDirectory,
      'index.ts',
    ),
  )

  await writeUtf8(
    PATHS.registry,
    REGISTRY_SOURCE,
  )

  await writeUtf8(
    PATHS.router,
    ROUTER_SOURCE,
  )

  await writeUtf8(
    PATHS.index,
    transformedIndex,
  )

  console.log('')
  console.log(`Backup: ${relative(backupDirectory)}`)
  console.log('')
  console.log('Registry refactor complete:')
  console.log('  ✓ ToolInspectorRegistry created')
  console.log('  ✓ ToolInspectorRouter switch removed')
  console.log('  ✓ Unknown tool fallback preserved')
  console.log('  ✓ Contribution priority supported')
  console.log('  ✓ Duplicate priority conflicts detected')
  console.log('  ✓ Feature override path prepared')
  console.log('')
  console.log('Run validation:')
  console.log(
    '  pnpm exec biome check --write apps/desktop/src/presentation/workspace/inspector/tools',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('')
}

async function validateRepository() {
  const requiredFiles = [
    PATHS.packageJson,
    PATHS.router,
    PATHS.index,
    path.join(
      TOOLS_DIRECTORY,
      'SelectToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'HandToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'ShapeToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'LineToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'ArrowToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'DrawToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'EraserToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'TextToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'NoteToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'FrameToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'ScientificChartToolInspector.tsx',
    ),
    path.join(
      TOOLS_DIRECTORY,
      'UnknownToolInspector.tsx',
    ),
  ]

  for (const filePath of requiredFiles) {
    await assertFile(filePath)
  }

  const routerSource = await readUtf8(
    PATHS.router,
  )

  if (
    !routerSource.includes(
      'switch (toolId)',
    )
  ) {
    if (
      routerSource.includes(
        'defaultToolInspectorRegistry',
      )
    ) {
      throw new Error(
        'Tool inspector registry refactor appears to be already applied.',
      )
    }

    throw new Error(
      'Expected ToolInspectorRouter switch was not found.',
    )
  }

  if (
    routerSource.includes(
      "from './BasicToolInspectors'",
    )
  ) {
    throw new Error(
      'BasicToolInspectors is still in use. Run the per-tool split refactor first.',
    )
  }
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
    `tool-inspector-registry-${timestamp}`,
  )

  await mkdir(backupDirectory, {
    recursive: true,
  })

  return backupDirectory
}

async function backupFile(
  sourcePath,
  destinationPath,
) {
  await mkdir(path.dirname(destinationPath), {
    recursive: true,
  })

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
  await mkdir(path.dirname(filePath), {
    recursive: true,
  })

  const normalized =
    source
      .replaceAll('\r\n', '\n')
      .replace(/^\uFEFF/, '')
      .trimEnd() + '\n'

  await writeFile(
    filePath,
    normalized,
    'utf8',
  )

  console.log(
    `Updated: ${relative(filePath)}`,
  )
}

function relative(filePath) {
  return path.relative(
    ROOT_DIR,
    filePath,
  ) || '.'
}

main().catch((error) => {
  console.error('')
  console.error(
    'Tool inspector registry refactor failed.',
  )
  console.error(
    error instanceof Error
      ? error.message
      : error,
  )
  console.error('')
  process.exitCode = 1
})
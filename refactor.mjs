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

const PATHS = {
  packageJson: path.join(ROOT_DIR, 'package.json'),

  extensionContract: path.join(
    ROOT_DIR,
    'editor/core/src/contracts/extension-contract.ts',
  ),

  contractsPublicApi: path.join(
    ROOT_DIR,
    'editor/core/src/contracts/public-api.ts',
  ),

  extensionsPublicApi: path.join(
    ROOT_DIR,
    'editor/core/src/extensions-public-api.ts',
  ),

  toolRegistry: path.join(
    ROOT_DIR,
    'apps/desktop/src/presentation/workspace/inspector/tools/ToolInspectorRegistry.tsx',
  ),

  canvasInspector: path.join(
    ROOT_DIR,
    'apps/desktop/src/presentation/workspace/inspector/CanvasInspectorContent.tsx',
  ),

  workspaceContainer: path.join(
    ROOT_DIR,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),
}

async function main() {
  console.log('')
  console.log(
    'Hybrid Canvas — Extension Tool Inspector Contract',
  )
  console.log(`Repository: ${ROOT_DIR}`)
  console.log(`Mode: ${DRY_RUN ? 'dry-run' : 'write'}`)
  console.log('')

  await validateRepository()

  const originals = {
    extensionContract: await readUtf8(
      PATHS.extensionContract,
    ),

    contractsPublicApi: await readUtf8(
      PATHS.contractsPublicApi,
    ),

    extensionsPublicApi: await readUtf8(
      PATHS.extensionsPublicApi,
    ),

    toolRegistry: await readUtf8(
      PATHS.toolRegistry,
    ),

    canvasInspector: await readUtf8(
      PATHS.canvasInspector,
    ),

    workspaceContainer: await readUtf8(
      PATHS.workspaceContainer,
    ),
  }

  const transformed = {
    extensionContract: transformExtensionContract(
      originals.extensionContract,
    ),

    contractsPublicApi: transformContractsPublicApi(
      originals.contractsPublicApi,
    ),

    extensionsPublicApi:
      transformExtensionsPublicApi(
        originals.extensionsPublicApi,
      ),

    toolRegistry: transformToolRegistry(
      originals.toolRegistry,
    ),

    canvasInspector: transformCanvasInspector(
      originals.canvasInspector,
    ),

    workspaceContainer:
      transformWorkspaceContainer(
        originals.workspaceContainer,
      ),
  }

  if (DRY_RUN) {
    console.log('✓ Extension contract detected')
    console.log('✓ Extension registration builder detected')
    console.log('✓ Tool inspector registry detected')
    console.log('✓ Canvas inspector detected')
    console.log('✓ Workspace session registration detected')
    console.log('✓ All changes can be applied safely')
    console.log('✓ No files were changed')
    console.log('')
    return
  }

  const backupDirectory =
    await createBackupDirectory()

  for (const filePath of Object.values(PATHS)) {
    if (filePath === PATHS.packageJson) {
      continue
    }

    await backupFile(
      filePath,
      path.join(
        backupDirectory,
        path.relative(ROOT_DIR, filePath),
      ),
    )
  }

  await writeUtf8(
    PATHS.extensionContract,
    transformed.extensionContract,
  )

  await writeUtf8(
    PATHS.contractsPublicApi,
    transformed.contractsPublicApi,
  )

  await writeUtf8(
    PATHS.extensionsPublicApi,
    transformed.extensionsPublicApi,
  )

  await writeUtf8(
    PATHS.toolRegistry,
    transformed.toolRegistry,
  )

  await writeUtf8(
    PATHS.canvasInspector,
    transformed.canvasInspector,
  )

  await writeUtf8(
    PATHS.workspaceContainer,
    transformed.workspaceContainer,
  )

  console.log('')
  console.log(`Backup: ${relative(backupDirectory)}`)
  console.log('')
  console.log('Extension inspector contract complete:')
  console.log('  ✓ Extension tool inspector contract added')
  console.log('  ✓ Registration collection added')
  console.log('  ✓ Public API exports added')
  console.log('  ✓ App registry uses extension contract')
  console.log('  ✓ Active session contributions connected')
  console.log('  ✓ Core inspectors remain fallback entries')
  console.log('')
  console.log('Run validation:')
  console.log(
    '  pnpm exec biome check --write editor/core/src apps/desktop/src/presentation/workspace',
  )
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('')
}

function transformExtensionContract(source) {
  let next = source

  next = replaceRequired(
    next,
    `import type {
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'`,
    `import type { ComponentType } from 'react'
import type {
  Editor,
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'`,
    'extension contract imports',
  )

  next = replaceRequired(
    next,
    `export interface HybridCanvasExtension {`,
    `export interface HybridCanvasToolInspectorProps {
  readonly editor: Editor
}

export interface HybridCanvasToolInspectorContribution {
  /**
   * Exact tldraw StateNode tool id.
   */
  readonly toolId: string

  /**
   * Stable Feature owner id used for diagnostics.
   */
  readonly owner: string

  /**
   * Higher priorities override lower priorities.
   *
   * Core fallback inspectors use 0. Feature-owned inspectors
   * should normally use 100.
   */
  readonly priority?: number

  readonly component: ComponentType<HybridCanvasToolInspectorProps>
}

export interface HybridCanvasExtension {`,
    'tool inspector contract interfaces',
  )

  next = replaceRequired(
    next,
    `  readonly tools?: readonly TLStateNodeConstructor[]
  readonly shapeLabels?: Readonly<Record<string, string>>
}`,
    `  readonly tools?: readonly TLStateNodeConstructor[]
  readonly shapeLabels?: Readonly<Record<string, string>>
  readonly toolInspectors?: readonly HybridCanvasToolInspectorContribution[]
}`,
    'HybridCanvasExtension toolInspectors',
  )

  next = replaceRequired(
    next,
    `  readonly tools: readonly TLStateNodeConstructor[]
  readonly shapeLabels: Readonly<Record<string, string>>
}`,
    `  readonly tools: readonly TLStateNodeConstructor[]
  readonly shapeLabels: Readonly<Record<string, string>>
  readonly toolInspectors: readonly HybridCanvasToolInspectorContribution[]
}`,
    'ExtensionRegistration toolInspectors',
  )

  next = replaceRequired(
    next,
    `  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}`,
    `  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}
  const toolInspectors: HybridCanvasToolInspectorContribution[] = []`,
    'registration tool inspector collection',
  )

  next = replaceRequired(
    next,
    `    tools.push(...(extension.tools ?? []))
    Object.assign(shapeLabels, extension.shapeLabels)`,
    `    tools.push(...(extension.tools ?? []))
    Object.assign(shapeLabels, extension.shapeLabels)

    for (const contribution of extension.toolInspectors ?? []) {
      validateToolInspectorContribution(
        extension.id,
        contribution,
      )

      toolInspectors.push(contribution)
    }`,
    'extension contribution collection',
  )

  next = replaceRequired(
    next,
    `    tools: Object.freeze(tools),
    shapeLabels: Object.freeze(shapeLabels),
  })
}`,
    `    tools: Object.freeze(tools),
    shapeLabels: Object.freeze(shapeLabels),
    toolInspectors: Object.freeze(toolInspectors),
  })
}

function validateToolInspectorContribution(
  extensionId: string,
  contribution: HybridCanvasToolInspectorContribution,
): void {
  if (!contribution.toolId.trim()) {
    throw new Error(
      'EXTENSION_TOOL_INSPECTOR_TOOL_ID_REQUIRED:' +
        extensionId,
    )
  }

  if (!contribution.owner.trim()) {
    throw new Error(
      'EXTENSION_TOOL_INSPECTOR_OWNER_REQUIRED:' +
        extensionId,
    )
  }

  if (
    typeof contribution.component !== 'function'
  ) {
    throw new Error(
      'EXTENSION_TOOL_INSPECTOR_COMPONENT_REQUIRED:' +
        extensionId,
    )
  }

  if (
    contribution.priority !== undefined &&
    !Number.isFinite(contribution.priority)
  ) {
    throw new Error(
      'EXTENSION_TOOL_INSPECTOR_PRIORITY_INVALID:' +
        extensionId,
    )
  }
}`,
    'registration return and validation',
  )

  return next
}

function transformContractsPublicApi(source) {
  return replaceRequired(
    source,
    `  type HybridCanvasExtension,
} from './extension-contract'`,
    `  type HybridCanvasExtension,
  type HybridCanvasToolInspectorContribution,
  type HybridCanvasToolInspectorProps,
} from './extension-contract'`,
    'contracts public API exports',
  )
}

function transformExtensionsPublicApi(source) {
  return replaceRequired(
    source,
    `  type HybridCanvasExtension,
} from './contracts/public-api'`,
    `  type HybridCanvasExtension,
  type HybridCanvasToolInspectorContribution,
  type HybridCanvasToolInspectorProps,
} from './contracts/public-api'`,
    'extensions public API exports',
  )
}

function transformToolRegistry(source) {
  let next = source

  next = replaceRequired(
    next,
    `import type { ComponentType } from 'react'`,
    `import type {
  HybridCanvasToolInspectorContribution,
  HybridCanvasToolInspectorProps,
} from '@hybrid-canvas/canvas/extensions'
import type { ComponentType } from 'react'`,
    'registry contract import',
  )

  const interfaceStart = next.indexOf(
    'export interface ToolInspectorContribution {',
  )

  const interfaceEnd = next.indexOf(
    'export interface ToolInspectorResolution {',
    interfaceStart,
  )

  if (
    interfaceStart === -1 ||
    interfaceEnd === -1
  ) {
    throw new Error(
      'Could not locate ToolInspectorContribution interface.',
    )
  }

  next =
    next.slice(0, interfaceStart) +
    `export type ToolInspectorContribution =
  HybridCanvasToolInspectorContribution

` +
    next.slice(interfaceEnd)

  next = next.replaceAll(
    `ComponentType<ToolInspectorProps>`,
    `ComponentType<HybridCanvasToolInspectorProps>`,
  )

  return next
}

function transformCanvasInspector(source) {
  let next = source

  if (
    !next.includes(
      `import type { ToolInspectorRegistry }`,
    )
  ) {
    next = replaceRequired(
      next,
      `import { ToolInspectorRouter } from './tools/ToolInspectorRouter'`,
      `import { ToolInspectorRouter } from './tools/ToolInspectorRouter'
import type { ToolInspectorRegistry } from './tools/ToolInspectorRegistry'`,
      'CanvasInspector registry import',
    )
  }

  next = replaceRequired(
    next,
    `export interface CanvasInspectorContentProps {
  readonly hasActiveCanvas: boolean
}`,
    `export interface CanvasInspectorContentProps {
  readonly hasActiveCanvas: boolean
  readonly toolInspectorRegistry: ToolInspectorRegistry
}`,
    'CanvasInspector props',
  )

  next = replaceRequired(
    next,
    `export function CanvasInspectorContent({
  hasActiveCanvas,
}: CanvasInspectorContentProps) {`,
    `export function CanvasInspectorContent({
  hasActiveCanvas,
  toolInspectorRegistry,
}: CanvasInspectorContentProps) {`,
    'CanvasInspector destructuring',
  )

  next = replaceRequired(
    next,
    `      <ToolInspectorRouter
        editor={editor}
        toolId={activeToolId}
      />`,
    `      <ToolInspectorRouter
        editor={editor}
        registry={toolInspectorRegistry}
        toolId={activeToolId}
      />`,
    'ToolInspectorRouter registry prop',
  )

  return next
}

function transformWorkspaceContainer(source) {
  let next = source

  next = replaceRequired(
    next,
    `import { CanvasInspectorContent } from './inspector/CanvasInspectorContent'`,
    `import { CanvasInspectorContent } from './inspector/CanvasInspectorContent'
import { createToolInspectorRegistry } from './inspector/tools/ToolInspectorRegistry'`,
    'Workspace registry import',
  )

  const registryAnchor = `  const activeEditorSession = activeSessionId
    ? port.canvases.getEditorSession(activeSessionId)
    : null
`

  const registryReplacement = `  const activeEditorSession = activeSessionId
    ? port.canvases.getEditorSession(activeSessionId)
    : null

  const toolInspectorRegistry = useMemo(
    () =>
      createToolInspectorRegistry(
        activeEditorSession?.registration.toolInspectors ?? [],
      ),
    [activeEditorSession],
  )
`

  next = replaceRequired(
    next,
    registryAnchor,
    registryReplacement,
    'active session inspector registry',
  )

  next = replaceRequired(
    next,
    `      inspector={<CanvasInspectorContent hasActiveCanvas={workbench.activeCanvas !== null} />}`,
    `      inspector={
        <CanvasInspectorContent
          hasActiveCanvas={workbench.activeCanvas !== null}
          toolInspectorRegistry={toolInspectorRegistry}
        />
      }`,
    'Workspace CanvasInspectorContent props',
  )

  return next
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
        'The source differs from the expected remote version. ' +
        'Refusing an unsafe partial edit.',
    )
  }

  return source.replace(oldValue, newValue)
}

async function validateRepository() {
  for (const filePath of Object.values(PATHS)) {
    await assertFile(filePath)
  }

  const contractSource = await readUtf8(
    PATHS.extensionContract,
  )

  if (
    !contractSource.includes(
      'export interface HybridCanvasExtension',
    ) ||
    !contractSource.includes(
      'buildExtensionRegistration',
    )
  ) {
    throw new Error(
      'Expected HybridCanvasExtension contract was not found.',
    )
  }

  if (
    contractSource.includes(
      'toolInspectors?:',
    )
  ) {
    throw new Error(
      'Extension tool inspector contract appears to be already installed.',
    )
  }

  const registrySource = await readUtf8(
    PATHS.toolRegistry,
  )

  if (
    !registrySource.includes(
      'export interface ToolInspectorContribution',
    )
  ) {
    throw new Error(
      'Expected app-level ToolInspectorContribution was not found.',
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
    `extension-inspector-contract-${timestamp}`,
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
    'Extension inspector contract refactor failed.',
  )
  console.error(
    error instanceof Error
      ? error.message
      : error,
  )
  console.error('')
  process.exitCode = 1
})
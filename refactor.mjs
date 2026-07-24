#!/usr/bin/env node

import {
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const extensionContractPath = resolve(
  'editor/core/src/contracts/extension-contract.ts',
)

const flowchartExtensionPath = resolve(
  'features/flowchart/src/extension.ts',
)

const freehandExtensionPath = resolve(
  'features/freehand/src/extension.ts',
)

const scientificExtensionPath = resolve(
  'features/scientific-plot/src/extension.ts',
)

const portalPath = resolve(
  'editor/core/src/react/canvas-inspector-portal.tsx',
)

const editorCanvasPath = resolve(
  'editor/core/src/react/EditorCanvas.tsx',
)

const obsoleteFiles = [
  resolve(
    'features/flowchart/src/presentation/ConnectorToolInspector.tsx',
  ),
  resolve(
    'features/freehand/src/presentation/FreehandToolInspector.tsx',
  ),
  resolve(
    'features/scientific-plot/src/presentation/ScientificChartToolInspector.tsx',
  ),
]

await rewriteExtensionContract()
await cleanFlowchartExtension()
await cleanFreehandExtension()
await cleanScientificExtension()
await cleanPortal()
await cleanEditorCanvas()

for (
  const obsoleteFile of
  obsoleteFiles
) {
  await rm(
    obsoleteFile,
    {
      force: true,
    },
  )
}

await removeEmptyDirectory(
  resolve(
    'features/flowchart/src/presentation',
  ),
)

await removeEmptyDirectory(
  resolve(
    'features/freehand/src/presentation',
  ),
)

await removeEmptyDirectory(
  resolve(
    'features/scientific-plot/src/presentation',
  ),
)

const staleReferences =
  await findStaleReferences()

if (
  staleReferences.length > 0
) {
  console.error('')
  console.error(
    '仍发现废弃 Inspector 引用：',
  )

  for (
    const reference of
    staleReferences
  ) {
    console.error(
      '  - ' + reference,
    )
  }

  console.error('')
  process.exitCode = 1
} else {
  console.log('')
  console.log(
    '废弃 Inspector 代码已清理。',
  )
  console.log('')
  console.log('已删除：')
  console.log(
    '  - creationInspectors 旧契约',
  )
  console.log(
    '  - ConnectorToolInspector',
  )
  console.log(
    '  - FreehandToolInspector',
  )
  console.log(
    '  - HighlightToolInspector',
  )
  console.log(
    '  - ScientificChartToolInspector',
  )
  console.log(
    '  - 遗留 Dock 命名',
  )
  console.log(
    '  - actions-only 无用外层容器',
  )
  console.log('')
  console.log(
    '保留了所有 Shape、Tool、Style 和 Extension。',
  )
  console.log('')
  console.log('验证：')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log(
    '  pnpm test:architecture',
  )
  console.log('  pnpm test')
  console.log(
    '  pnpm build:desktop',
  )
  console.log('')
}

async function rewriteExtensionContract() {
  const previous =
    normalize(
      await readFile(
        extensionContractPath,
        'utf8',
      ),
    )

  if (
    !previous.includes(
      'export interface HybridCanvasExtension',
    )
  ) {
    throw new Error(
      '没有找到 Extension 契约。',
    )
  }

  const next = `import type {
  TLAnyBindingUtilConstructor,
  TLAnyShapeUtilConstructor,
  TLStateNodeConstructor,
} from 'tldraw'

export const HYBRID_CANVAS_EXTENSION_API_VERSION = '2'

/**
 * Canvas Feature 的公开扩展契约。
 *
 * Editor 的 Shape、Binding 和 Tool 仍由各 Feature 注册，
 * 但右侧属性侧边栏内容不再使用整页 Component 注入。
 *
 * 后续属性内容将使用独立的 Section contribution 契约，
 * 避免 Feature 覆盖整个右侧栏或重复实现官方公共属性。
 */
export interface HybridCanvasExtension {
  readonly id: string
  readonly version: string
  readonly apiVersion: string
  readonly shapeUtils?: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils?: readonly TLAnyBindingUtilConstructor[]
  readonly tools?: readonly TLStateNodeConstructor[]
  readonly shapeLabels?: Readonly<Record<string, string>>
}

export interface ExtensionRegistration {
  readonly extensions: readonly HybridCanvasExtension[]
  readonly shapeUtils: readonly TLAnyShapeUtilConstructor[]
  readonly bindingUtils: readonly TLAnyBindingUtilConstructor[]
  readonly tools: readonly TLStateNodeConstructor[]
  readonly shapeLabels: Readonly<Record<string, string>>
}

export function buildExtensionRegistration(
  input: readonly HybridCanvasExtension[] = [],
): ExtensionRegistration {
  const ids = new Set<string>()
  const shapeUtils: TLAnyShapeUtilConstructor[] = []
  const bindingUtils: TLAnyBindingUtilConstructor[] = []
  const tools: TLStateNodeConstructor[] = []
  const shapeLabels: Record<string, string> = {}

  for (const extension of input) {
    if (
      !extension.id ||
      ids.has(extension.id)
    ) {
      throw new Error(
        'EXTENSION_DUPLICATE_ID',
      )
    }

    if (
      extension.apiVersion !==
      HYBRID_CANVAS_EXTENSION_API_VERSION
    ) {
      throw new Error(
        'EXTENSION_API_VERSION_MISMATCH',
      )
    }

    ids.add(extension.id)

    shapeUtils.push(
      ...(extension.shapeUtils ?? []),
    )

    bindingUtils.push(
      ...(extension.bindingUtils ?? []),
    )

    tools.push(
      ...(extension.tools ?? []),
    )

    Object.assign(
      shapeLabels,
      extension.shapeLabels,
    )
  }

  return Object.freeze({
    extensions:
      Object.freeze([
        ...input,
      ]),

    shapeUtils:
      Object.freeze(
        shapeUtils,
      ),

    bindingUtils:
      Object.freeze(
        bindingUtils,
      ),

    tools:
      Object.freeze(
        tools,
      ),

    shapeLabels:
      Object.freeze(
        shapeLabels,
      ),
  })
}
`

  await writeFile(
    extensionContractPath,
    next,
    'utf8',
  )
}

async function cleanFlowchartExtension() {
  let source =
    await readSource(
      flowchartExtensionPath,
    )

  source = source.replace(
    `import { ConnectorToolInspector } from './presentation/ConnectorToolInspector'
`,
    '',
  )

  source = removePropertyBlock(
    source,
    'creationInspectors',
  )

  await writeSource(
    flowchartExtensionPath,
    source,
  )
}

async function cleanFreehandExtension() {
  let source =
    await readSource(
      freehandExtensionPath,
    )

  source = source.replace(
    `import { FreehandToolInspector, HighlightToolInspector } from './presentation/FreehandToolInspector'

`,
    '',
  )

  source = removePropertyBlock(
    source,
    'creationInspectors',
  )

  await writeSource(
    freehandExtensionPath,
    source,
  )
}

async function cleanScientificExtension() {
  let source =
    await readSource(
      scientificExtensionPath,
    )

  source = source.replace(
    `import { ScientificChartToolInspector } from './presentation/ScientificChartToolInspector'
`,
    '',
  )

  source = removePropertyBlock(
    source,
    'creationInspectors',
  )

  await writeSource(
    scientificExtensionPath,
    source,
  )
}

async function cleanPortal() {
  let source =
    await readSource(
      portalPath,
    )

  source = source.replaceAll(
    'data-properties-inspector-dock=""',
    'data-properties-sidebar=""',
  )

  source = source.replaceAll(
    'Workspace Dock',
    'Workspace 右侧属性侧边栏',
  )

  const oldActionsOnly = `    ) : (
      <div
        className="hc-properties-panel hc-properties-panel--actions-only"
      >
        <PropertiesInspectorContent
          selectedShapeCount={
            selectedShapeCount
          }
          styles={null}
        />
      </div>
    ),`

  const nextActionsOnly = `    ) : (
      <PropertiesInspectorContent
        selectedShapeCount={
          selectedShapeCount
        }
        styles={null}
      />
    ),`

  if (
    source.includes(
      oldActionsOnly,
    )
  ) {
    source = source.replace(
      oldActionsOnly,
      nextActionsOnly,
    )
  }

  await writeSource(
    portalPath,
    source,
  )
}

async function cleanEditorCanvas() {
  let source =
    await readSource(
      editorCanvasPath,
    )

  source = source.replaceAll(
    'Workspace Dock',
    'Workspace 右侧属性侧边栏',
  )

  await writeSource(
    editorCanvasPath,
    source,
  )
}

function removePropertyBlock(
  source,
  propertyName,
) {
  const startToken =
    '  ' +
    propertyName +
    ': ['

  const start =
    source.indexOf(
      startToken,
    )

  if (
    start < 0
  ) {
    return source
  }

  let cursor =
    start +
    startToken.length

  let squareDepth = 1
  let curlyDepth = 0
  let quote = null
  let escaped = false

  while (
    cursor <
    source.length
  ) {
    const character =
      source[cursor]

    if (
      quote !== null
    ) {
      if (
        escaped
      ) {
        escaped = false
      } else if (
        character === '\\'
      ) {
        escaped = true
      } else if (
        character === quote
      ) {
        quote = null
      }

      cursor += 1
      continue
    }

    if (
      character === "'" ||
      character === '"' ||
      character === '`'
    ) {
      quote = character
      cursor += 1
      continue
    }

    if (
      character === '['
    ) {
      squareDepth += 1
    } else if (
      character === ']'
    ) {
      squareDepth -= 1

      if (
        squareDepth === 0 &&
        curlyDepth === 0
      ) {
        cursor += 1

        if (
          source[cursor] ===
          ','
        ) {
          cursor += 1
        }

        if (
          source[cursor] ===
          '\n'
        ) {
          cursor += 1
        }

        return (
          source.slice(
            0,
            start,
          ) +
          source.slice(
            cursor,
          )
        )
      }
    } else if (
      character === '{'
    ) {
      curlyDepth += 1
    } else if (
      character === '}'
    ) {
      curlyDepth -= 1
    }

    cursor += 1
  }

  throw new Error(
    '无法完整删除属性：' +
      propertyName,
  )
}

async function findStaleReferences() {
  const roots = [
    resolve('apps'),
    resolve('editor'),
    resolve('features'),
    resolve('tests'),
  ]

  const needles = [
    'creationInspectors',
    'HybridCanvasCreationInspectorProps',
    'HybridCanvasCreationInspectorContribution',
    'ConnectorToolInspector',
    'FreehandToolInspector',
    'HighlightToolInspector',
    'ScientificChartToolInspector',
    'properties-inspector-dock',
    'CanvasInspectorDock',
  ]

  const matches = []

  for (
    const searchRoot of roots
  ) {
    await scanDirectory(
      searchRoot,
      needles,
      matches,
    )
  }

  return matches
}

async function scanDirectory(
  directory,
  needles,
  matches,
) {
  let entries

  try {
    entries =
      await readdir(
        directory,
        {
          withFileTypes: true,
        },
      )
  } catch (
    error
  ) {
    if (
      error?.code ===
      'ENOENT'
    ) {
      return
    }

    throw error
  }

  for (
    const entry of entries
  ) {
    if (
      entry.name ===
        'node_modules' ||
      entry.name ===
        'dist' ||
      entry.name ===
        'coverage' ||
      entry.name ===
        '.turbo'
    ) {
      continue
    }

    const entryPath =
      path.join(
        directory,
        entry.name,
      )

    if (
      entry.isDirectory()
    ) {
      await scanDirectory(
        entryPath,
        needles,
        matches,
      )

      continue
    }

    if (
      !/\.(?:ts|tsx|js|jsx|mjs|cjs|md|css)$/.test(
        entry.name,
      )
    ) {
      continue
    }

    const content =
      normalize(
        await readFile(
          entryPath,
          'utf8',
        ),
      )

    const found =
      needles.filter(
        (needle) =>
          content.includes(
            needle,
          ),
      )

    if (
      found.length > 0
    ) {
      matches.push(
        path.relative(
          root,
          entryPath,
        ) +
          ': ' +
          found.join(', '),
      )
    }
  }
}

async function removeEmptyDirectory(
  directory,
) {
  let entries

  try {
    entries =
      await readdir(
        directory,
      )
  } catch (
    error
  ) {
    if (
      error?.code ===
      'ENOENT'
    ) {
      return
    }

    throw error
  }

  if (
    entries.length > 0
  ) {
    return
  }

  await rm(
    directory,
    {
      recursive: true,
      force: true,
    },
  )
}

async function readSource(
  filePath,
) {
  return normalize(
    await readFile(
      filePath,
      'utf8',
    ),
  )
}

async function writeSource(
  filePath,
  source,
) {
  await writeFile(
    filePath,
    source.trimEnd() +
      '\n',
    'utf8',
  )
}

function resolve(
  relativePath,
) {
  return path.join(
    root,
    relativePath,
  )
}

function normalize(
  content,
) {
  return content.replaceAll(
    '\r\n',
    '\n',
  )
}
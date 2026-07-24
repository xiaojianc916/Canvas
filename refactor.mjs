#!/usr/bin/env node

import {
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

await updateFile(
  'editor/core/src/contracts/public-api.ts',
  (source) =>
    removeLines(
      source,
      [
        'type HybridCanvasCreationInspectorContribution,',
        'type HybridCanvasCreationInspectorProps,',
      ],
    ),
)

await updateFile(
  'editor/core/src/extensions-public-api.ts',
  (source) =>
    removeLines(
      source,
      [
        'type HybridCanvasCreationInspectorContribution,',
        'type HybridCanvasCreationInspectorProps,',
      ],
    ),
)

await updateFile(
  'features/flowchart/src/public-api.ts',
  (source) =>
    removeLines(
      source,
      [
        "export { ConnectorToolInspector } from './presentation/ConnectorToolInspector'",
      ],
    ),
)

await updateFile(
  'features/freehand/src/public-api.ts',
  (source) => {
    const obsoleteExport = `export {
  FreehandToolInspector,
  HighlightToolInspector,
} from './presentation/FreehandToolInspector'
`

    return source.replace(
      obsoleteExport,
      '',
    )
  },
)

await updateFile(
  'features/scientific-plot/src/public-api.ts',
  (source) =>
    removeLines(
      source,
      [
        "export { ScientificChartToolInspector } from './presentation/ScientificChartToolInspector'",
      ],
    ),
)

await updateArchitectureTest()

console.log('')
console.log(
  'Inspector 遗留公共导出和架构测试已清理。',
)
console.log('')
console.log('执行：')
console.log('  node refactor.mjs')
console.log('  pnpm format')
console.log('  pnpm typecheck')
console.log('  pnpm test:architecture')
console.log('')

async function updateArchitectureTest() {
  const relativePath =
    'tests/architecture/check-properties-inspector-architecture.mjs'

  await updateFile(
    relativePath,
    (source) => {
      source = source.replace(
        `'必须通过 Portal 渲染到 Workspace Dock',`,
        `'必须通过 Portal 渲染到 Workspace 右侧属性侧边栏',`,
      )

      const obsoleteDefaultPanelTest = `requirePattern(
  'InspectorPortal',
  sources.portal,
  /<DefaultStylePanel/,
  '架构阶段必须使用官方 DefaultStylePanel 验证上下文',
)
`

      const currentPanelTest = `forbidPattern(
  'InspectorPortal',
  sources.portal,
  /<DefaultStylePanel(?:Content)?/,
  '自定义右侧属性侧边栏不得直接渲染官方默认面板',
)
`

      source = source.replace(
        obsoleteDefaultPanelTest,
        currentPanelTest,
      )

      const obsoleteSidebarTest = `requirePattern(
  'WorkspaceContainer',
  sources.workspaceContainer,
  /<CanvasInspectorDock\\s*\\/>/,
  'Workspace 必须只提供 Inspector Portal Dock',
)
`

      const currentSidebarTest = `requirePattern(
  'WorkspaceContainer',
  sources.workspaceContainer,
  /<CanvasInspectorRightSidebar\\s*\\/>/,
  'Workspace 必须只提供 Inspector Portal 右侧栏容器',
)
`

      source = source.replace(
        obsoleteSidebarTest,
        currentSidebarTest,
      )

      const obsoleteExtensionTest = `requirePattern(
  'ExtensionContract',
  sources.extensionContract,
  /creationInspectors/,
  'Extension API 必须使用 creation-specific contribution',
)
`

      source = source.replace(
        obsoleteExtensionTest,
        '',
      )

      return source
    },
  )
}

async function updateFile(
  relativePath,
  transform,
) {
  const filePath =
    path.join(
      root,
      relativePath,
    )

  const previous =
    normalize(
      await readFile(
        filePath,
        'utf8',
      ),
    )

  const next =
    transform(previous)

  await writeFile(
    filePath,
    next.trimEnd() + '\n',
    'utf8',
  )
}

function removeLines(
  source,
  lines,
) {
  const removals =
    new Set(
      lines.map(
        (line) =>
          line.trim(),
      ),
    )

  return source
    .split('\n')
    .filter(
      (line) =>
        !removals.has(
          line.trim(),
        ),
    )
    .join('\n')
}

function normalize(
  content,
) {
  return content.replaceAll(
    '\r\n',
    '\n',
  )
}
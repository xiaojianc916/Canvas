#!/usr/bin/env node

import {
  readFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const files = {
  editorCanvas: path.join(
    root,
    'editor/core/src/react/EditorCanvas.tsx',
  ),

  portal: path.join(
    root,
    'editor/core/src/react/canvas-inspector-portal.tsx',
  ),

  workspaceContainer: path.join(
    root,
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),

  workspaceShell: path.join(
    root,
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ),

  shellContract: path.join(
    root,
    'features/workspace/src/contracts/shell-contract.ts',
  ),

  extensionContract: path.join(
    root,
    'editor/core/src/contracts/extension-contract.ts',
  ),
}

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(
      async ([key, filePath]) => [
        key,
        await readFile(
          filePath,
          'utf8',
        ),
      ],
    ),
  ),
)

const violations = []

requirePattern(
  'EditorCanvas',
  sources.editorCanvas,
  /StylePanel:\s*function WorkspacePropertiesInspector/,
  '必须通过 tldraw StylePanel slot 接入 Inspector',
)

requirePattern(
  'InspectorPortal',
  sources.portal,
  /useRelevantStyles\s*\(/,
  '必须使用 tldraw 官方 useRelevantStyles',
)

requirePattern(
  'InspectorPortal',
  sources.portal,
  /createPortal\s*\(/,
  '必须通过 Portal 渲染到 Workspace 右侧属性侧边栏',
)

forbidPattern(
  'InspectorPortal',
  sources.portal,
  /<DefaultStylePanel(?:Content)?/,
  '自定义右侧属性侧边栏不得直接渲染官方默认面板',
)

const forbiddenWorkspacePatterns = [
  /getSelectedShapeIds\s*\(/,
  /getSelectedShapes\s*\(/,
  /getOnlySelectedShape\s*\(/,
  /getCurrentToolId\s*\(/,
  /getSharedStyles\s*\(/,
  /useRelevantStyles\s*\(/,
  /inspectorSelectionKey/,
  /CanvasInspectorContent/,
  /ToolInspectorRegistry/,
]

for (const pattern of forbiddenWorkspacePatterns) {
  forbidPattern(
    'WorkspaceContainer',
    sources.workspaceContainer,
    pattern,
    'Workspace 不得读取或路由 Editor Inspector 状态',
  )
}

requirePattern(
  'WorkspaceContainer',
  sources.workspaceContainer,
  /<CanvasInspectorRightSidebar\s*\/>/,
  'Workspace 必须只提供 Inspector Portal 右侧栏容器',
)

requirePattern(
  'WorkspaceShell',
  sources.workspaceShell,
  /inspectorAvailable/,
  'Workspace 必须使用内容 availability 控制布局',
)

forbidPattern(
  'WorkspaceShell',
  sources.workspaceShell,
  /inspectorSelectionKey/,
  'Workspace 不得接收 selection key',
)

forbidPattern(
  'WorkspaceShellProps',
  sources.shellContract,
  /inspectorSelectionKey/,
  'Workspace contract 不得暴露 selection key',
)

requirePattern(
  'WorkspaceShellProps',
  sources.shellContract,
  /readonly inspectorAvailable: boolean/,
  'Workspace contract 必须只暴露 availability',
)

forbidPattern(
  'ExtensionContract',
  sources.extensionContract,
  /toolInspectors/,
  'Extension API 不得恢复 tool-first Inspector',
)

requirePattern(
  'ExtensionContract',
  sources.extensionContract,
  /inspectorSections/,
  'Extension API 必须使用 Section contribution',
)


if (violations.length > 0) {
  console.error('')
  console.error(
    'Properties Inspector architecture: FAILED',
  )
  console.error('')

  for (const violation of violations) {
    console.error('- ' + violation)
  }

  console.error('')
  process.exitCode = 1
} else {
  console.log(
    'Properties Inspector architecture: OK',
  )
}

function requirePattern(
  owner,
  source,
  pattern,
  message,
) {
  if (!pattern.test(source)) {
    violations.push(
      owner + ': ' + message,
    )
  }
}

function forbidPattern(
  owner,
  source,
  pattern,
  message,
) {
  if (pattern.test(source)) {
    violations.push(
      owner + ': ' + message,
    )
  }
}

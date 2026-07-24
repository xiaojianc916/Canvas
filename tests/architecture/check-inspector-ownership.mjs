#!/usr/bin/env node

/**
 * Properties Inspector ownership architecture guard.
 *
 * Invariants:
 * - tldraw owns selection/tool/relevant-style state.
 * - Workspace owns only shell layout and local open/collapse state.
 * - Workspace must not construct tool-first inspector routing.
 */

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

assertAbsent(
  'EditorCanvas',
  sources.editorCanvas,
  /StylePanel\s*:\s*null/,
  '不得禁用 tldraw 官方 StylePanel 状态入口',
)

const forbiddenWorkspaceContainer = [
  [
    /from\s+['"]tldraw['"]/,
    'WorkspaceContainer 不得直接依赖 tldraw UI 状态',
  ],
  [
    /\buseValue\b/,
    'WorkspaceContainer 不得订阅 tldraw 响应式状态',
  ],
  [
    /getSelectedShapeIds\s*\(/,
    'WorkspaceContainer 不得读取选区 ID',
  ],
  [
    /getSelectedShapes\s*\(/,
    'WorkspaceContainer 不得读取选区对象',
  ],
  [
    /getOnlySelectedShape\s*\(/,
    'WorkspaceContainer 不得读取单一选区对象',
  ],
  [
    /getCurrentToolId\s*\(/,
    'WorkspaceContainer 不得读取当前工具',
  ],
  [
    /getSharedStyles\s*\(/,
    'WorkspaceContainer 不得计算 shared styles',
  ],
  [
    /useRelevantStyles\s*\(/,
    'WorkspaceContainer 不得计算 relevant styles',
  ],
  [
    /inspectorSelectionKey/,
    'WorkspaceContainer 不得传递 Inspector 选区镜像',
  ],
  [
    /CanvasInspectorContent/,
    'WorkspaceContainer 不得挂载旧外部 Inspector',
  ],
  [
    /ToolInspectorRegistry/,
    'WorkspaceContainer 不得创建 tool-first Inspector Registry',
  ],
]

for (
  const [
    pattern,
    message,
  ] of forbiddenWorkspaceContainer
) {
  assertAbsent(
    'WorkspaceContainer',
    sources.workspaceContainer,
    pattern,
    message,
  )
}

assertAbsent(
  'WorkspaceShell',
  sources.workspaceShell,
  /inspectorSelectionKey/,
  'WorkspaceShell 不得接收 Editor selection 标识',
)

assertAbsent(
  'WorkspaceShellProps',
  sources.shellContract,
  /inspectorSelectionKey/,
  'Workspace contract 不得暴露 Editor selection 标识',
)

assertPresent(
  'WorkspaceShell',
  sources.workspaceShell,
  /<InspectorHost>\{inspector\}<\/InspectorHost>/,
  'Workspace 应保留通用右栏布局容器',
)

if (violations.length > 0) {
  console.error('')
  console.error(
    'Properties Inspector 架构检查失败：',
  )
  console.error('')

  for (const violation of violations) {
    console.error(
      '- ' + violation,
    )
  }

  console.error('')
  process.exitCode = 1
} else {
  console.log(
    'Properties Inspector ownership architecture: OK',
  )
}

function assertAbsent(
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

function assertPresent(
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

#!/usr/bin/env node

/**
 * Properties Inspector 架构重构（无备份版）
 *
 * 目标：
 * - 恢复 tldraw 官方 StylePanel 的状态所有权
 * - Workspace 不读取 selection/current tool/shared styles
 * - 删除 inspectorSelectionKey
 * - 停止挂载旧 CanvasInspectorContent
 * - 停止创建 ToolInspectorRegistry
 * - 保留通用右栏容器，不讨论最终属性内容
 * - 增加架构测试，防止状态所有权重新泄漏
 *
 * 回滚直接使用 Git：
 *   git diff
 *   git restore .
 *
 * 执行：
 *   node refactor-inspector-architecture.mjs
 */

import {
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()

const paths = {
  editorCanvas: resolve(
    'editor/core/src/react/EditorCanvas.tsx',
  ),

  workspaceContainer: resolve(
    'apps/desktop/src/presentation/workspace/WorkspaceContainer.tsx',
  ),

  workspaceShell: resolve(
    'features/workspace/src/presentation/shell/WorkspaceShell.tsx',
  ),

  shellContract: resolve(
    'features/workspace/src/contracts/shell-contract.ts',
  ),

  packageJson: resolve('package.json'),

  architectureTest: resolve(
    'tests/architecture/check-inspector-ownership.mjs',
  ),

  obsoleteBackupDirectory: resolve(
    '.inspector-architecture-backup',
  ),
}

await main()

async function main() {
  await assertRepositoryRoot()

  /*
   * 删除上一个脚本可能生成的备份目录。
   * Git 是唯一回滚机制。
   */
  await rm(
    paths.obsoleteBackupDirectory,
    {
      recursive: true,
      force: true,
    },
  )

  const sources = {
    editorCanvas: normalize(
      await readFile(
        paths.editorCanvas,
        'utf8',
      ),
    ),

    workspaceContainer: normalize(
      await readFile(
        paths.workspaceContainer,
        'utf8',
      ),
    ),

    workspaceShell: normalize(
      await readFile(
        paths.workspaceShell,
        'utf8',
      ),
    ),

    shellContract: normalize(
      await readFile(
        paths.shellContract,
        'utf8',
      ),
    ),

    packageJson: normalize(
      await readFile(
        paths.packageJson,
        'utf8',
      ),
    ),
  }

  /*
   * 所有转换先在内存完成。
   * 转换或验证失败时不会写入半成品。
   */
  const transformed = {
    editorCanvas:
      transformEditorCanvas(
        sources.editorCanvas,
      ),

    workspaceContainer:
      transformWorkspaceContainer(
        sources.workspaceContainer,
      ),

    workspaceShell:
      transformWorkspaceShell(
        sources.workspaceShell,
      ),

    shellContract:
      transformShellContract(
        sources.shellContract,
      ),

    packageJson:
      transformPackageJson(
        sources.packageJson,
      ),

    architectureTest:
      createArchitectureTest(),
  }

  validate(transformed)

  await mkdir(
    path.dirname(
      paths.architectureTest,
    ),
    {
      recursive: true,
    },
  )

  await Promise.all([
    write(
      paths.editorCanvas,
      transformed.editorCanvas,
    ),

    write(
      paths.workspaceContainer,
      transformed.workspaceContainer,
    ),

    write(
      paths.workspaceShell,
      transformed.workspaceShell,
    ),

    write(
      paths.shellContract,
      transformed.shellContract,
    ),

    write(
      paths.packageJson,
      transformed.packageJson,
    ),

    write(
      paths.architectureTest,
      transformed.architectureTest,
    ),
  ])

  printSummary()
}

function transformEditorCanvas(source) {
  let next = source

  /*
   * 恢复官方 StylePanel。
   */
  next = next.replace(
    /^\s*StylePanel\s*:\s*null,\s*\n/m,
    '',
  )

  /*
   * 清理旧架构说明。
   */
  next = next.replace(
    /\s*\* StylePanel：\n\s*\* Canvas 使用原来的 Workspace CanvasInspectorContent，\n\s*\* 避免同时出现两套右侧属性面板。\n/,
    [
      ' * StylePanel：',
      ' * 样式状态、选区相关性与下一图形预设由 tldraw 官方能力负责。',
      ' * Workspace 不读取 selection、current tool 或 shared styles。',
      ' *',
      ' * 最终停靠式 Properties Inspector 将通过 tldraw StylePanel',
      ' * component slot 接入，而不是在 Workspace 外部重建状态模型。',
      '',
    ].join('\n'),
  )

  return finish(next)
}

function transformWorkspaceContainer(
  source,
) {
  let next = source

  /*
   * 删除 tldraw 响应式状态订阅。
   */
  next = next.replace(
    /^import\s+\{\s*useValue\s*\}\s+from\s+['"]tldraw['"]\s*\n/m,
    '',
  )

  /*
   * 删除旧 Inspector 内容入口。
   */
  next = next.replace(
    /^import\s+\{\s*CanvasInspectorContent\s*\}\s+from\s+['"]\.\/inspector\/CanvasInspectorContent['"]\s*\n/m,
    '',
  )

  next = next.replace(
    /^import\s+\{\s*createToolInspectorRegistry\s*\}\s+from\s+['"]\.\/inspector\/tools\/ToolInspectorRegistry['"]\s*\n/m,
    '',
  )

  /*
   * 删除 inspectorSelectionKey。
   *
   * 使用边界标记而不是复杂 AST 替换，是因为这段代码本身
   * 就是接下来要彻底移除的旧架构。
   */
  next = removeRangeIfPresent(
    next,
    '  const inspectorSelectionKey = useValue(\n',
    '  const workbench = useSyncExternalStore(\n',
  )

  /*
   * 删除 ToolInspectorRegistry 组合。
   */
  next = removeRangeIfPresent(
    next,
    [
      '  /*',
      '   * Core Inspector 与 Feature Inspector 合并。',
    ].join('\n'),
    '  const pages = useSyncExternalStore(\n',
  )

  /*
   * 停止挂载旧 CanvasInspectorContent。
   */
  next = next.replace(
    /\s{6}inspector=\{\s*<CanvasInspectorContent[\s\S]*?\/>\s*\}\s*\n\s{6}inspectorSelectionKey=\{inspectorSelectionKey\}\s*\n/,
    '      inspector={null}\n',
  )

  /*
   * 兼容已经由上一版脚本删除 selectionKey、
   * 但仍保留 CanvasInspectorContent 的情况。
   */
  next = next.replace(
    /\s{6}inspector=\{\s*<CanvasInspectorContent[\s\S]*?\/>\s*\}\s*\n/,
    '      inspector={null}\n',
  )

  /*
   * 兼容旧 Inspector 已替换，但 selectionKey 单独残留。
   */
  next = next.replace(
    /^\s*inspectorSelectionKey=\{inspectorSelectionKey\}\s*\n/m,
    '',
  )

  return finish(next)
}

function transformWorkspaceShell(
  source,
) {
  let next = source

  next = next.replace(
    /^\s*const previousInspectorSelectionKeyRef = useRef\(inspectorSelectionKey \?\? ''\)\s*\n/m,
    '',
  )

  next = next.replace(
    /^\s*inspectorSelectionKey,\s*\n/m,
    '',
  )

  /*
   * 删除 selection/tool 变化后强制展开右栏的 effect。
   */
  next = removeRangeIfPresent(
    next,
    [
      '  useEffect(() => {',
      '    const previousKey = previousInspectorSelectionKeyRef.current',
    ].join('\n'),
    '  const openSidebar = () => {\n',
  )

  return finish(next)
}

function transformShellContract(
  source,
) {
  let next = source

  next = next.replace(
    /\s{2}\/\*\*\n\s{3}\* 当前编辑器选区标识。\n\s{3}\* 仅用于请求显示属性面板，不承载画布文档状态。\n\s{3}\*\/\n\s{2}readonly inspectorSelectionKey\?: string\n/,
    '',
  )

  next = next.replace(
    /^\s*readonly inspectorSelectionKey\?: string\s*\n/m,
    '',
  )

  return finish(next)
}

function transformPackageJson(
  source,
) {
  const parsed = JSON.parse(source)

  const current =
    parsed.scripts?.[
      'test:architecture'
    ]

  if (typeof current !== 'string') {
    throw new Error(
      'package.json 缺少 scripts.test:architecture。',
    )
  }

  const command =
    'node tests/architecture/check-inspector-ownership.mjs'

  if (!current.includes(command)) {
    parsed.scripts[
      'test:architecture'
    ] = `${current} && ${command}`
  }

  return (
    JSON.stringify(
      parsed,
      null,
      2,
    ) + '\n'
  )
}

function createArchitectureTest() {
  return `#!/usr/bin/env node

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
  /StylePanel\\s*:\\s*null/,
  '不得禁用 tldraw 官方 StylePanel 状态入口',
)

const forbiddenWorkspaceContainer = [
  [
    /from\\s+['"]tldraw['"]/,
    'WorkspaceContainer 不得直接依赖 tldraw UI 状态',
  ],
  [
    /\\buseValue\\b/,
    'WorkspaceContainer 不得订阅 tldraw 响应式状态',
  ],
  [
    /getSelectedShapeIds\\s*\\(/,
    'WorkspaceContainer 不得读取选区 ID',
  ],
  [
    /getSelectedShapes\\s*\\(/,
    'WorkspaceContainer 不得读取选区对象',
  ],
  [
    /getOnlySelectedShape\\s*\\(/,
    'WorkspaceContainer 不得读取单一选区对象',
  ],
  [
    /getCurrentToolId\\s*\\(/,
    'WorkspaceContainer 不得读取当前工具',
  ],
  [
    /getSharedStyles\\s*\\(/,
    'WorkspaceContainer 不得计算 shared styles',
  ],
  [
    /useRelevantStyles\\s*\\(/,
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
  /<InspectorHost>\\{inspector\\}<\\/InspectorHost>/,
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
`
}

function validate(transformed) {
  const violations = []

  if (
    /StylePanel\s*:\s*null/.test(
      transformed.editorCanvas,
    )
  ) {
    violations.push(
      'EditorCanvas 仍然禁用了官方 StylePanel。',
    )
  }

  const workspaceForbidden = [
    /\buseValue\b/,
    /getSelectedShapeIds\s*\(/,
    /getSelectedShapes\s*\(/,
    /getOnlySelectedShape\s*\(/,
    /getCurrentToolId\s*\(/,
    /getSharedStyles\s*\(/,
    /useRelevantStyles\s*\(/,
    /inspectorSelectionKey/,
    /CanvasInspectorContent/,
    /createToolInspectorRegistry/,
  ]

  for (
    const pattern of workspaceForbidden
  ) {
    if (
      pattern.test(
        transformed.workspaceContainer,
      )
    ) {
      violations.push(
        `WorkspaceContainer 仍然匹配禁用模式：${String(pattern)}`,
      )
    }
  }

  if (
    /inspectorSelectionKey/.test(
      transformed.workspaceShell,
    )
  ) {
    violations.push(
      'WorkspaceShell 仍然包含 inspectorSelectionKey。',
    )
  }

  if (
    /inspectorSelectionKey/.test(
      transformed.shellContract,
    )
  ) {
    violations.push(
      'WorkspaceShellProps 仍然包含 inspectorSelectionKey。',
    )
  }

  if (
    !transformed.workspaceContainer.includes(
      'inspector={null}',
    )
  ) {
    violations.push(
      'WorkspaceContainer 没有明确停用旧 Inspector。',
    )
  }

  if (
    !transformed.workspaceShell.includes(
      '<InspectorHost>{inspector}</InspectorHost>',
    )
  ) {
    violations.push(
      'Workspace 通用 InspectorHost 被意外删除。',
    )
  }

  if (
    violations.length > 0
  ) {
    throw new Error(
      [
        '重构结果验证失败：',
        '',
        ...violations.map(
          (item) => `- ${item}`,
        ),
        '',
        '没有写入任何文件。',
      ].join('\n'),
    )
  }
}

function removeRangeIfPresent(
  source,
  startMarker,
  endMarker,
) {
  const start =
    source.indexOf(startMarker)

  if (start < 0) {
    return source
  }

  const end = source.indexOf(
    endMarker,
    start + startMarker.length,
  )

  if (end < 0) {
    throw new Error(
      [
        '找到待删除区域的起点，但没有找到终点。',
        '',
        `起点：${JSON.stringify(startMarker)}`,
        `终点：${JSON.stringify(endMarker)}`,
      ].join('\n'),
    )
  }

  return (
    source.slice(0, start) +
    source.slice(end)
  )
}

async function assertRepositoryRoot() {
  const packagePath =
    resolve('package.json')

  const agentsPath =
    resolve('AGENTS.md')

  await Promise.all([
    readFile(
      packagePath,
      'utf8',
    ),

    readFile(
      agentsPath,
      'utf8',
    ),

    readFile(
      paths.editorCanvas,
      'utf8',
    ),

    readFile(
      paths.workspaceContainer,
      'utf8',
    ),

    readFile(
      paths.workspaceShell,
      'utf8',
    ),

    readFile(
      paths.shellContract,
      'utf8',
    ),
  ])
}

async function write(
  filePath,
  content,
) {
  await writeFile(
    filePath,
    finish(content),
    'utf8',
  )
}

function resolve(relativePath) {
  return path.join(
    root,
    relativePath,
  )
}

function normalize(source) {
  return source.replaceAll(
    '\r\n',
    '\n',
  )
}

function finish(source) {
  return (
    normalize(source).trimEnd() +
    '\n'
  )
}

function printSummary() {
  console.log('')
  console.log(
    'Properties Inspector 所有权重构完成。',
  )
  console.log('')

  console.log('架构结果：')
  console.log(
    '  - tldraw 官方 StylePanel 已恢复',
  )
  console.log(
    '  - Workspace 不读取 selection/current tool',
  )
  console.log(
    '  - Workspace 不计算 shared/relevant styles',
  )
  console.log(
    '  - inspectorSelectionKey 已删除',
  )
  console.log(
    '  - 旧 CanvasInspectorContent 已停止挂载',
  )
  console.log(
    '  - ToolInspectorRegistry 已离开 composition root',
  )
  console.log(
    '  - Workspace 通用右栏容器继续保留',
  )
  console.log(
    '  - 已添加 Inspector 所有权架构测试',
  )

  console.log('')
  console.log('没有创建任何备份文件。')
  console.log('回滚请使用 Git。')

  console.log('')
  console.log('执行验证：')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test:architecture')
  console.log('  pnpm test')
  console.log('  pnpm build:desktop')
  console.log('')
}
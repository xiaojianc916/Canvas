#!/usr/bin/env node

/**
 * Properties Inspector 架构重构：第一阶段
 *
 * 目标：
 * 1. 恢复 tldraw 官方 StylePanel 作为样式检查器的唯一状态所有者。
 * 2. Workspace 不再读取 Editor selection / current tool。
 * 3. 删除 inspectorSelectionKey 这种 Editor 状态向 Workspace 的泄漏。
 * 4. 停止创建 App-owned ToolInspectorRegistry。
 * 5. 暂时不设计最终 Properties Inspector 的具体内容。
 * 6. 保留 Workspace 通用右栏容器，供后续通过 tldraw StylePanel slot / Portal 接入。
 *
 * 本阶段不会：
 * - 决定最终属性栏有哪些控件；
 * - 创建另一套 Inspector 状态机；
 * - 修改 TLStore；
 * - 创建 selection/tool 的 React 镜像状态；
 * - 删除现有 Inspector 内容文件，避免在架构稳定前混合迁移内容。
 *
 * 执行：
 *   node refactor-inspector-architecture.mjs
 *
 * 撤销：
 *   node refactor-inspector-architecture.mjs --undo
 */

import {
  access,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const shouldUndo = process.argv.includes('--undo')

const BACKUP_DIRECTORY = path.join(
  root,
  '.inspector-architecture-backup',
)

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

if (shouldUndo) {
  await undo()
} else {
  await apply()
}

async function apply() {
  await assertRepositoryRoot()
  await assertBackupDoesNotExist()

  const originals = await readAllFiles()

  /*
   * 所有转换先在内存中完成。
   * 只要任一断言失败，就不会修改仓库文件。
   */
  const transformed = {
    editorCanvas: transformEditorCanvas(
      originals.editorCanvas,
    ),

    workspaceContainer: transformWorkspaceContainer(
      originals.workspaceContainer,
    ),

    workspaceShell: transformWorkspaceShell(
      originals.workspaceShell,
    ),

    shellContract: transformShellContract(
      originals.shellContract,
    ),
  }

  validateTransformedFiles(transformed)

  await createBackups(originals)
  await writeAllFiles(transformed)

  printApplySummary()
}

async function undo() {
  await assertRepositoryRoot()

  if (!(await exists(BACKUP_DIRECTORY))) {
    throw new Error(
      [
        '没有找到 Inspector 架构重构备份。',
        '',
        `预期目录：${BACKUP_DIRECTORY}`,
        '',
        '无法安全执行撤销。',
      ].join('\n'),
    )
  }

  for (const [key, targetPath] of Object.entries(files)) {
    const backupPath = backupPathFor(key)

    if (!(await exists(backupPath))) {
      throw new Error(
        [
          '备份不完整，停止撤销。',
          '',
          `缺少：${backupPath}`,
          '',
          '仓库文件没有被修改。',
        ].join('\n'),
      )
    }

    await copyFile(backupPath, targetPath)
  }

  await rm(BACKUP_DIRECTORY, {
    recursive: true,
    force: true,
  })

  console.log('')
  console.log('已撤销 Properties Inspector 架构重构。')
  console.log('')
  console.log('已恢复：')

  for (const filePath of Object.values(files)) {
    console.log(`  ${relative(filePath)}`)
  }

  console.log('')
}

async function assertRepositoryRoot() {
  const agentsPath = path.join(root, 'AGENTS.md')
  const packagePath = path.join(root, 'package.json')

  if (
    !(await exists(agentsPath)) ||
    !(await exists(packagePath))
  ) {
    throw new Error(
      [
        '请在 Canvas 仓库根目录执行本脚本。',
        '',
        `当前目录：${root}`,
      ].join('\n'),
    )
  }

  for (const filePath of Object.values(files)) {
    if (!(await exists(filePath))) {
      throw new Error(
        [
          '缺少架构重构需要的文件。',
          '',
          `文件：${relative(filePath)}`,
          '',
          '脚本没有修改任何文件。',
        ].join('\n'),
      )
    }
  }
}

async function assertBackupDoesNotExist() {
  if (!(await exists(BACKUP_DIRECTORY))) {
    return
  }

  throw new Error(
    [
      '检测到上一次重构留下的备份目录。',
      '',
      `目录：${relative(BACKUP_DIRECTORY)}`,
      '',
      '为了避免覆盖可撤销备份，本次没有修改任何文件。',
      '',
      '如果要撤销上一次修改：',
      '  node refactor-inspector-architecture.mjs --undo',
      '',
      '如果已经确认不需要备份，请手动删除该目录后重新运行。',
    ].join('\n'),
  )
}

async function readAllFiles() {
  return {
    editorCanvas: normalizeNewlines(
      await readFile(files.editorCanvas, 'utf8'),
    ),

    workspaceContainer: normalizeNewlines(
      await readFile(files.workspaceContainer, 'utf8'),
    ),

    workspaceShell: normalizeNewlines(
      await readFile(files.workspaceShell, 'utf8'),
    ),

    shellContract: normalizeNewlines(
      await readFile(files.shellContract, 'utf8'),
    ),
  }
}

async function createBackups(originals) {
  await mkdir(BACKUP_DIRECTORY, {
    recursive: false,
  })

  for (const [key, content] of Object.entries(originals)) {
    await writeFile(
      backupPathFor(key),
      content,
      'utf8',
    )
  }

  await writeFile(
    path.join(BACKUP_DIRECTORY, 'README.txt'),
    [
      'Properties Inspector architecture refactor backup.',
      '',
      'Restore with:',
      '  node refactor-inspector-architecture.mjs --undo',
      '',
    ].join('\n'),
    'utf8',
  )
}

async function writeAllFiles(transformed) {
  /*
   * 到达这里说明所有文件都已成功转换和验证。
   * 备份也已经完整创建。
   */
  await writeFile(
    files.editorCanvas,
    transformed.editorCanvas,
    'utf8',
  )

  await writeFile(
    files.workspaceContainer,
    transformed.workspaceContainer,
    'utf8',
  )

  await writeFile(
    files.workspaceShell,
    transformed.workspaceShell,
    'utf8',
  )

  await writeFile(
    files.shellContract,
    transformed.shellContract,
    'utf8',
  )
}

function transformEditorCanvas(source) {
  let next = source

  /*
   * 删除旧注释中“Canvas 使用 Workspace Inspector”
   * 这项已经不再成立的架构声明。
   */
  next = replaceRequired(
    next,
    ` * StylePanel：
 * Canvas 使用原来的 Workspace CanvasInspectorContent，
 * 避免同时出现两套右侧属性面板。
`,
    ` * StylePanel：
 * 不在 Workspace 中复制 selection / tool / shared styles 状态。
 * 样式相关状态与响应式更新继续由 tldraw 官方 StylePanel 管理。
 *
 * 后续如需将官方 StylePanel 停靠到 Workspace 右栏，
 * 应通过 StylePanel component slot 和 Portal 完成，
 * 而不是在 Workspace 外部重新实现样式状态。
`,
    '更新 EditorCanvas 的 StylePanel 架构注释',
  )

  /*
   * 恢复官方 StylePanel。
   *
   * 删除 StylePanel: null 后，tldraw 会使用官方默认组件。
   * 这是架构重构的过渡状态：
   *
   * - 状态所有权已经回到 tldraw；
   * - 后续只替换 StylePanel 的呈现位置和内容组合；
   * - 不再由 Workspace 判断 selectedShapes / currentTool。
   */
  next = replaceRequired(
    next,
    `  StylePanel: null,
`,
    '',
    '恢复 tldraw 官方 StylePanel',
  )

  return ensureTrailingNewline(next)
}

function transformWorkspaceContainer(source) {
  let next = source

  /*
   * Workspace 不再直接订阅 tldraw selection / current tool。
   */
  next = replaceRequired(
    next,
    `import { useValue } from 'tldraw'
`,
    '',
    '删除 WorkspaceContainer 的 tldraw useValue import',
  )

  next = replaceRequired(
    next,
    `import { CanvasInspectorContent } from './inspector/CanvasInspectorContent'
`,
    '',
    '删除 CanvasInspectorContent import',
  )

  next = replaceRequired(
    next,
    `import { createToolInspectorRegistry } from './inspector/tools/ToolInspectorRegistry'
`,
    '',
    '删除 ToolInspectorRegistry import',
  )

  /*
   * 删除 Workspace 通过 Editor 状态生成 inspectorSelectionKey 的逻辑。
   *
   * selection 和 current tool 都应由 tldraw 内部的
   * StylePanel slot / useRelevantStyles 响应。
   */
  next = replaceBetweenRequired(
    next,
    `  const inspectorSelectionKey = useValue(
`,
    `  const workbench = useSyncExternalStore(
`,
    `  const workbench = useSyncExternalStore(
`,
    '删除 Workspace 的 Inspector selection/tool 订阅',
  )

  /*
   * 删除 App-owned ToolInspectorRegistry 的组合。
   *
   * Feature 的最终 Inspector 扩展契约会在内容阶段重新定义为：
   * - selection-specific contribution
   * - creation-specific contribution
   *
   * 这里不再创建“一工具一面板”的 Registry。
   */
  next = replaceBetweenRequired(
    next,
    `  /*
   * Core Inspector 与 Feature Inspector 合并。
`,
    `  const pages = useSyncExternalStore(
`,
    `  const pages = useSyncExternalStore(
`,
    '删除 ToolInspectorRegistry 组合逻辑',
  )

  /*
   * Workspace 右栏暂时不承载 Properties Inspector 内容。
   *
   * 这里传 null 的目的不是取消右栏能力，而是确保：
   * - 当前不会出现第二套 Inspector；
   * - Workspace 不再拥有 Editor 派生状态；
   * - 最终内容将在 tldraw StylePanel 上下文中确定。
   */
  next = replaceBetweenRequired(
    next,
    `      inspector={
        <CanvasInspectorContent
`,
    `      mainContent={mainContent}
`,
    `      inspector={null}
      mainContent={mainContent}
`,
    '断开旧 CanvasInspectorContent',
  )

  return ensureTrailingNewline(next)
}

function transformWorkspaceShell(source) {
  let next = source

  /*
   * 删除只为观察 Editor selection/tool 而存在的 ref。
   */
  next = replaceRequired(
    next,
    `  const previousInspectorSelectionKeyRef = useRef(inspectorSelectionKey ?? '')
`,
    '',
    '删除 previousInspectorSelectionKeyRef',
  )

  /*
   * WorkspaceShell props 不再接收 Editor selection key。
   */
  next = replaceRequired(
    next,
    `  inspectorSelectionKey,
`,
    '',
    '删除 WorkspaceShell inspectorSelectionKey 参数',
  )

  /*
   * 删除 selection/tool 变化后强制展开 Inspector 的 effect。
   *
   * 最终右栏是否可用，应由实际 StylePanel 内容决定；
   * 用户是否展开，则属于 Workspace 本地 UI 偏好。
   */
  next = replaceBetweenRequired(
    next,
    `  useEffect(() => {
    const previousKey = previousInspectorSelectionKeyRef.current
`,
    `  const openSidebar = () => {
`,
    `  const openSidebar = () => {
`,
    '删除 Inspector selection key 自动展开逻辑',
  )

  return ensureTrailingNewline(next)
}

function transformShellContract(source) {
  let next = source

  /*
   * 删除 WorkspaceShell 对 Editor selection 标识的依赖。
   */
  next = replaceRequired(
    next,
    `  /**
   * 当前编辑器选区标识。
   * 仅用于请求显示属性面板，不承载画布文档状态。
   */
  readonly inspectorSelectionKey?: string
`,
    '',
    '删除 shell-contract inspectorSelectionKey',
  )

  return ensureTrailingNewline(next)
}

function validateTransformedFiles(transformed) {
  const errors = []

  /*
   * EditorCanvas 必须恢复官方 StylePanel。
   */
  if (
    /StylePanel\s*:\s*null/.test(
      transformed.editorCanvas,
    )
  ) {
    errors.push(
      'EditorCanvas 仍然禁用了官方 StylePanel。',
    )
  }

  /*
   * WorkspaceContainer 不得再读取 selection/tool。
   */
  const forbiddenWorkspaceContainerPatterns = [
    {
      pattern: /\buseValue\b/,
      message:
        'WorkspaceContainer 仍然直接使用 tldraw useValue。',
    },
    {
      pattern: /getSelectedShapeIds\s*\(/,
      message:
        'WorkspaceContainer 仍然读取 selected shape ids。',
    },
    {
      pattern: /getSelectedShapes\s*\(/,
      message:
        'WorkspaceContainer 仍然读取 selected shapes。',
    },
    {
      pattern: /getCurrentToolId\s*\(/,
      message:
        'WorkspaceContainer 仍然读取 current tool。',
    },
    {
      pattern: /\binspectorSelectionKey\b/,
      message:
        'WorkspaceContainer 仍然包含 inspectorSelectionKey。',
    },
    {
      pattern: /\bCanvasInspectorContent\b/,
      message:
        'WorkspaceContainer 仍然挂载旧 CanvasInspectorContent。',
    },
    {
      pattern: /\bcreateToolInspectorRegistry\b/,
      message:
        'WorkspaceContainer 仍然创建 ToolInspectorRegistry。',
    },
  ]

  for (
    const {
      pattern,
      message,
    } of forbiddenWorkspaceContainerPatterns
  ) {
    if (
      pattern.test(
        transformed.workspaceContainer,
      )
    ) {
      errors.push(message)
    }
  }

  if (
    /\binspectorSelectionKey\b/.test(
      transformed.workspaceShell,
    )
  ) {
    errors.push(
      'WorkspaceShell 仍然依赖 inspectorSelectionKey。',
    )
  }

  if (
    /\binspectorSelectionKey\b/.test(
      transformed.shellContract,
    )
  ) {
    errors.push(
      'WorkspaceShellProps 仍然声明 inspectorSelectionKey。',
    )
  }

  /*
   * 必须保留 Workspace 通用 Inspector host。
   * 后续官方 StylePanel 可以通过 Portal 使用该位置。
   */
  if (
    !transformed.workspaceShell.includes(
      '<InspectorHost>{inspector}</InspectorHost>',
    )
  ) {
    errors.push(
      'WorkspaceShell 的通用 InspectorHost 被意外删除。',
    )
  }

  if (
    !transformed.workspaceContainer.includes(
      'inspector={null}',
    )
  ) {
    errors.push(
      'WorkspaceContainer 没有显式停用旧 Inspector 内容。',
    )
  }

  if (errors.length > 0) {
    throw new Error(
      [
        'Inspector 架构重构验证失败：',
        '',
        ...errors.map(
          (message) => `- ${message}`,
        ),
        '',
        '脚本没有修改任何仓库文件。',
      ].join('\n'),
    )
  }
}

function replaceRequired(
  source,
  search,
  replacement,
  operation,
) {
  const count = countOccurrences(
    source,
    search,
  )

  if (count !== 1) {
    throw new Error(
      [
        `无法安全执行：${operation}`,
        '',
        `预期匹配 1 次，实际匹配 ${count} 次。`,
        '',
        '仓库代码可能已经变化，脚本没有修改任何文件。',
      ].join('\n'),
    )
  }

  return source.replace(
    search,
    replacement,
  )
}

function replaceBetweenRequired(
  source,
  startMarker,
  endMarker,
  replacement,
  operation,
) {
  const startIndex = source.indexOf(startMarker)

  if (startIndex < 0) {
    throw new Error(
      [
        `无法安全执行：${operation}`,
        '',
        '没有找到起始标记。',
        '',
        `起始标记：${JSON.stringify(startMarker)}`,
        '',
        '脚本没有修改任何文件。',
      ].join('\n'),
    )
  }

  const secondStartIndex = source.indexOf(
    startMarker,
    startIndex + startMarker.length,
  )

  if (secondStartIndex >= 0) {
    throw new Error(
      [
        `无法安全执行：${operation}`,
        '',
        '起始标记出现多次，无法确定安全修改范围。',
        '',
        '脚本没有修改任何文件。',
      ].join('\n'),
    )
  }

  const endIndex = source.indexOf(
    endMarker,
    startIndex + startMarker.length,
  )

  if (endIndex < 0) {
    throw new Error(
      [
        `无法安全执行：${operation}`,
        '',
        '找到起始标记，但没有找到结束标记。',
        '',
        `结束标记：${JSON.stringify(endMarker)}`,
        '',
        '脚本没有修改任何文件。',
      ].join('\n'),
    )
  }

  return (
    source.slice(0, startIndex) +
    replacement +
    source.slice(
      endIndex + endMarker.length,
    )
  )
}

function countOccurrences(source, search) {
  if (!search) {
    return 0
  }

  let count = 0
  let offset = 0

  while (true) {
    const index = source.indexOf(
      search,
      offset,
    )

    if (index < 0) {
      return count
    }

    count += 1
    offset = index + search.length
  }
}

function backupPathFor(key) {
  return path.join(
    BACKUP_DIRECTORY,
    `${key}.backup`,
  )
}

async function exists(filePath) {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function normalizeNewlines(source) {
  return source.replaceAll(
    '\r\n',
    '\n',
  )
}

function ensureTrailingNewline(source) {
  return normalizeNewlines(
    source,
  ).trimEnd() + '\n'
}

function relative(filePath) {
  return path.relative(
    root,
    filePath,
  )
}

function printApplySummary() {
  console.log('')
  console.log(
    'Properties Inspector 第一阶段架构重构完成。',
  )
  console.log('')

  console.log('已修改：')

  for (const filePath of Object.values(files)) {
    console.log(`  ${relative(filePath)}`)
  }

  console.log('')
  console.log('架构结果：')
  console.log(
    '  - tldraw 官方 StylePanel 已恢复',
  )
  console.log(
    '  - Workspace 不再读取 selection',
  )
  console.log(
    '  - Workspace 不再读取 current tool',
  )
  console.log(
    '  - inspectorSelectionKey 已删除',
  )
  console.log(
    '  - App 不再创建 ToolInspectorRegistry',
  )
  console.log(
    '  - 旧 Workspace Inspector 已停止挂载',
  )
  console.log(
    '  - Workspace 通用右栏容器仍然保留',
  )

  console.log('')
  console.log('本阶段刻意没有修改：')
  console.log(
    '  - Properties Inspector 的具体属性内容',
  )
  console.log(
    '  - 多选 mixed 控件设计',
  )
  console.log(
    '  - Shape 专属属性内容',
  )
  console.log(
    '  - Creation preset 的具体内容',
  )
  console.log(
    '  - 最终 StylePanel Portal 实现',
  )
  console.log(
    '  - 旧 Inspector 内容文件',
  )

  console.log('')
  console.log('请执行验证：')
  console.log('  pnpm format')
  console.log('  pnpm lint')
  console.log('  pnpm typecheck')
  console.log('  pnpm test')
  console.log('  pnpm build:desktop')

  console.log('')
  console.log('撤销：')
  console.log(
    '  node refactor-inspector-architecture.mjs --undo',
  )
  console.log('')
}
#!/usr/bin/env node

/**
 * 统一 README、AGENTS 与当前实际架构。
 *
 * 使用：
 *   node tooling/script/refactor.mjs
 *   node tooling/script/refactor.mjs --write
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const SCRIPT_NAME =
  '007-align-readme-agents-architecture'

const README_PATH = 'README.md'
const AGENTS_PATH = 'AGENTS.md'

const argv = process.argv.slice(2)
const writeMode = argv.includes('--write')

main()

function main() {
  validateArguments()

  const root = findRepositoryRoot()

  validateRepository(root)
  validateActualArchitecture(root)

  const readmePath = join(root, README_PATH)
  const agentsPath = join(root, AGENTS_PATH)

  const originalReadme =
    readRequiredText(readmePath)

  const originalAgents =
    readRequiredText(agentsPath)

  const modifiedReadme =
    createCanonicalReadme()

  const modifiedAgents =
    transformAgents(originalAgents)

  const changes = [
    {
      relativePath: README_PATH,
      absolutePath: readmePath,
      original: originalReadme,
      modified: modifiedReadme,
    },
    {
      relativePath: AGENTS_PATH,
      absolutePath: agentsPath,
      original: originalAgents,
      modified: modifiedAgents,
    },
  ].filter(
    (change) =>
      normalizeNewlines(change.original) !==
      normalizeNewlines(change.modified),
  )

  if (changes.length === 0) {
    console.log(
      '无需修改：README、AGENTS 与实际架构已经一致。',
    )
    return
  }

  console.log(
    `\n模式：${writeMode ? 'WRITE' : 'DRY-RUN'}`,
  )
  console.log(`仓库：${root}`)

  console.log('\n计划修改：')

  for (const change of changes) {
    console.log(`- ${change.relativePath}`)
  }

  console.log('\n变更摘要：')
  console.log(
    '- 删除 README 中旧 domains 架构',
  )
  console.log(
    '- 删除 Yjs、y-websocket 和双文档模型描述',
  )
  console.log(
    '- 明确 tldraw Editor/TLStore 是唯一画布内核',
  )
  console.log(
    '- 明确 @tldraw/sync 是唯一画布同步协议',
  )
  console.log(
    '- 更新为实际 editor/features/platforms/foundations 结构',
  )
  console.log(
    '- 修正仓库克隆地址和开发命令',
  )
  console.log(
    '- 补齐 foundations/kernel 等实际包',
  )
  console.log(
    '- 建立 README、AGENTS、ADR 的文档职责边界',
  )

  if (!writeMode) {
    console.log('\n当前为 dry-run，没有写入文件。')
    console.log(
      '执行：node tooling/script/refactor.mjs --write',
    )
    return
  }

  ensureTargetsAreClean(root, changes)

  const backupRoot =
    createBackup(root, changes)

  console.log(
    `\n备份目录：${relative(root, backupRoot)}`,
  )

  try {
    for (const change of changes) {
      writeFileSync(
        change.absolutePath,
        ensureFinalNewline(
          change.modified,
        ),
        'utf8',
      )
    }

    assertPostconditions(root)

    run(
      'git',
      [
        'diff',
        '--check',
        '--',
        README_PATH,
        AGENTS_PATH,
      ],
      {
        cwd: root,
        label: 'Git diff 检查',
      },
    )

    run(
      'pnpm',
      ['test:architecture'],
      {
        cwd: root,
        label: '架构测试',
      },
    )

    console.log('\n修改完成。')
    console.log(
      'README 与 AGENTS 现在描述同一套 tldraw-first 实际架构。',
    )
  } catch (error) {
    console.error(
      '\n修改或验证失败，正在恢复原文件……',
    )

    for (const change of changes) {
      copyFileSync(
        join(
          backupRoot,
          change.relativePath,
        ),
        change.absolutePath,
      )
    }

    console.error(
      '已恢复到脚本执行前状态。',
    )

    throw error
  }
}

function validateArguments() {
  for (const argument of argv) {
    if (argument !== '--write') {
      throw new Error(`未知参数：${argument}`)
    }
  }
}

function findRepositoryRoot() {
  const result = spawnSync(
    'git',
    ['rev-parse', '--show-toplevel'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.error || result.status !== 0) {
    throw new Error(
      [
        '当前目录不在 Git 仓库中。',
        result.error?.message,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }

  return resolve(result.stdout.trim())
}

function validateRepository(root) {
  const packageJson = JSON.parse(
    readRequiredText(
      join(root, 'package.json'),
    ),
  )

  if (packageJson.name !== 'hybrid-canvas') {
    throw new Error(
      `仓库识别失败：${String(packageJson.name)}`,
    )
  }

  for (const path of [
    README_PATH,
    AGENTS_PATH,
  ]) {
    if (!existsSync(join(root, path))) {
      throw new Error(`文件不存在：${path}`)
    }
  }
}

function validateActualArchitecture(root) {
  const requiredDirectories = [
    'apps/desktop',
    'editor/assets',
    'editor/core',
    'editor/document',
    'editor/extensions',
    'editor/persistence',
    'features/flowchart',
    'features/freehand',
    'features/import-export',
    'features/scientific-plot',
    'features/settings',
    'features/workspace',
    'platforms/desktop-ipc',
    'platforms/desktop-runtime',
    'foundations/design-system',
    'foundations/geometry',
    'foundations/kernel',
    'foundations/observability',
    'foundations/serialization',
    'foundations/test-kit',
    'tests/architecture',
    'tests/cross-domain-contract',
    'tooling',
  ]

  const missing = requiredDirectories.filter(
    (path) =>
      !existsSync(join(root, path)),
  )

  if (missing.length > 0) {
    throw new Error(
      [
        '实际目录结构与脚本预期不一致：',
        ...missing.map(
          (path) => `- ${path}`,
        ),
        '',
        '脚本拒绝用旧架构覆盖当前仓库。',
      ].join('\n'),
    )
  }
}

function createCanonicalReadme() {
  return `# Hybrid Canvas

Hybrid Canvas 是一个以 tldraw 为核心、基于 Tauri、React 和 Rust 构建的本地优先桌面画布应用。

项目当前处于早期架构建设阶段。现有空目录、占位包和预留模块不代表功能已经完成；受允许的预留脚手架必须登记在 architecture.scaffolds.json，并明确所有者、激活条件和删除条件。

## 核心架构原则

### tldraw-first

- tldraw Editor 和 TLStore 是画布文档的事实标准。
- TLStore document records 是可持久化画布状态的唯一事实来源。
- Shape、Binding、Asset、Page 和自定义 Record 不得镜像到第二套文档模型。
- 所有文档修改必须通过 Editor 或 Store transaction。
- tldraw History 是唯一 Undo/Redo 实现。
- @tldraw/sync 是唯一画布同步协议。
- 不为假想的 tldraw 可替换性维护第二套文档内核。
- 大型二进制数据、文件句柄和运行时对象必须保留在 TLStore 外部。

### 本地优先

- 用户文档以 TLStore Snapshot 为核心。
- .draw 是唯一正式持久化容器。
- 保存流程采用临时文件、同步落盘和原子替换。
- 无法安全理解的新格式只能只读，不得静默降级后覆盖原文件。
- 文件格式、迁移、兼容窗口和 round-trip fixture 必须保持一致。

### 明确所有权

- editor/core 创建 TLSchema、TLStore 并控制 Editor 生命周期。
- editor/document 拥有文档会话、文件位置、revision、保存状态和关闭计划。
- features 通过 EditorExtension 扩展画布。
- features/workspace 拥有工作台、命令、标签页和产品 Shell。
- platforms 实现平台能力，不拥有产品规则或编辑器状态。
- apps 是最终 composition root。
- foundations 只提供稳定、通用且无产品语义的基础能力。
- foundations/kernel 提供 ID、基础错误和无产品语义的核心类型。

## 当前目录结构

    hybrid-canvas/
    ├── apps/
    │   └── desktop/                 Tauri 桌面应用与组合入口
    ├── editor/
    │   ├── assets/                  TLAssetStore 与资产能力
    │   ├── core/                    tldraw Editor、TLStore 与扩展注册
    │   ├── document/                文档会话、保存状态和关闭计划
    │   ├── extensions/              扩展声明与生命周期
    │   └── persistence/             .draw 容器、序列化与迁移
    ├── features/
    │   ├── flowchart/               流程图 Shape、Binding、Tool 与布局
    │   ├── freehand/                自由绘制领域与扩展
    │   ├── import-export/           导入导出契约与编排
    │   ├── scientific-plot/         科学图表 Shape、数据与计算
    │   ├── settings/                设置模型与界面
    │   └── workspace/               工作台、命令、标签页与产品 Shell
    ├── platforms/
    │   ├── desktop-ipc/             生成式桌面 IPC 契约
    │   └── desktop-runtime/         文件、对话框、窗口等桌面适配
    ├── foundations/
    │   ├── design-system/           设计令牌与 UI 原语
    │   ├── geometry/                通用几何能力
    │   ├── kernel/                  ID、错误和基础类型
    │   ├── observability/           日志与诊断
    │   ├── serialization/           通用序列化能力
    │   └── test-kit/                测试 fixture 与辅助能力
    ├── tests/
    │   ├── architecture/            架构约束
    │   ├── cross-domain-contract/   跨包契约测试
    │   ├── desktop-e2e/             桌面端到端测试
    │   ├── performance/             性能与体积预算
    │   ├── release/                 发布验证
    │   └── security/                安全验证
    ├── tooling/                     工程、生成器与发布工具
    ├── architecture.scaffolds.json
    ├── package.json
    ├── pnpm-workspace.yaml
    ├── Cargo.toml
    └── turbo.json

## 依赖方向

    apps ───────────────► editor + features + platforms
    editor/core ─────────► foundations
    editor/document ─────► editor/core + editor/persistence contracts
    features ───────────► editor/core public extension API
    platforms ──────────► application-defined ports
    foundations ────────► no product packages

约束：

- 跨包访问必须经过 package exports。
- 禁止跨包 deep import。
- 禁止循环依赖。
- 禁止 foundations 反向依赖 editor、features、platforms 或 apps。
- 禁止 feature 直接依赖 Tauri。
- editor/document 不得依赖 React、Workspace、Tauri 或桌面 adapter。
- 跨 editor 与 workspace 的编排只能位于 apps composition root。
- 不创建根级 components、services、utils、stores、types 或 managers。

## TypeScript、Rust 与 IPC 边界

TypeScript 负责：

- tldraw 扩展与产品交互
- 文档会话和应用编排
- 工作台、命令和 UI
- 平台无关的产品规则
- 输入校验和前端状态

Rust 负责：

- 原子文件操作
- 文件和资源流
- 系统能力
- 安全边界
- 崩溃恢复
- 需要原生能力的后台任务

IPC 必须使用显式、生成式、可验证的 DTO。禁止让 serde_json::Value、任意路径、第三方对象或原始错误堆栈直接穿透 IPC。

## 扩展模型

Feature 只能通过明确的 EditorExtension 贡献能力，例如：

- Shape utils
- Binding utils
- Tools
- Custom records
- Commands
- Panels
- Asset handlers
- Importers
- Exporters

插件和 WebView 不得直接访问 Editor、Tauri、文件系统、网络或宿主 Store。原生能力必须通过显式 capability 和受控 RPC。

## 文档格式

.draw 容器以 TLStore Snapshot 为核心，并为资源、预览和版本信息提供容器边界。

设计要求：

- 格式版本明确
- 迁移确定且可测试
- 未知字段和未知扩展无损保留
- 新格式无法理解时进入只读模式
- 保存采用原子替换
- 资源受大小、路径和完整性约束
- 兼容策略有明确版本窗口

## 环境要求

- Node.js：由 .node-version 固定
- pnpm：由 packageManager 固定
- Rust：由 rust-toolchain.toml 固定
- Windows：需要 WebView2、Windows SDK 和 Visual Studio Build Tools

## 开始开发

    git clone https://github.com/xiaojianc916/Canvas.git
    cd Canvas
    corepack enable
    pnpm install
    pnpm tauri:dev

## 常用命令

    pnpm dev
    pnpm typecheck
    pnpm lint
    pnpm test:architecture
    pnpm test
    pnpm build
    pnpm clippy
    pnpm audit
    pnpm audit:rust
    pnpm verify:release

## 测试策略

- 单元测试验证局部规则和值对象。
- 契约测试验证跨包公开接口、文件格式和 IPC。
- 架构测试验证依赖方向、public API、循环依赖和平台边界。
- E2E 测试验证启动、创建、编辑、保存、恢复和关闭。
- 性能测试使用固定 fixture、目标设备和可重复预算。
- 安全测试覆盖文件、ZIP、SVG、图片、字体、剪贴板、插件和协作输入。

## 文档职责

- README.md：项目入口、当前架构概览和开发方式。
- AGENTS.md：强制性的架构约束和修改规则。
- docs/architecture：稳定的系统设计说明。
- docs/rfcs：尚未接受的设计提案。
- docs/adr：已经接受的重要架构决策。
- architecture.scaffolds.json：有意预留的脚手架及其生命周期。

上述文档不得同时描述互相冲突的文档内核、同步协议、目录结构或依赖方向。

## 当前状态

项目仍处于早期阶段。目录、契约和架构测试的存在不代表对应产品功能已经完成。完成状态应以实际实现、测试、构建和发布验证为准。

## 许可证

许可证和仓库元数据以根 LICENSE、package.json 与 Cargo workspace 的一致配置为准。
`
}

function transformAgents(source) {
  let next = source

  const oldFoundationsTree = `├── foundations/        # 共享基础设施
│   ├── design-system/
│   ├── geometry/
│   ├── observability/
│   ├── serialization/
│   └── test-kit/`

  const newFoundationsTree = `├── foundations/        # 共享基础设施
│   ├── design-system/
│   ├── geometry/
│   ├── kernel/
│   ├── observability/
│   ├── serialization/
│   └── test-kit/`

  if (next.includes(oldFoundationsTree)) {
    next = next.replace(
      oldFoundationsTree,
      newFoundationsTree,
    )
  } else if (
    !next.includes('│   ├── kernel/')
  ) {
    throw new Error(
      '无法安全更新 AGENTS.md 的 foundations 目录树',
    )
  }

  const documentationSection = `## 文档一致性

- README.md 负责项目入口、当前架构概览和开发方式。
- AGENTS.md 是强制性的架构约束与修改规则。
- docs/rfcs 只描述尚未接受的提案，不得伪装成当前实现。
- docs/adr 记录已经接受的重要决策。
- architecture.scaffolds.json 只登记有明确所有者、激活条件和删除条件的预留结构。
- README、AGENTS、ADR、代码和测试不得同时声明不同的文档内核、同步协议、目录结构或依赖方向。
- 已废弃的架构描述必须与旧实现、旧测试、旧导出和旧配置一起删除。
- 目录和契约的存在不代表功能已经完成；完成状态必须由实现和验证结果证明。

`

  if (
    !next.includes('## 文档一致性')
  ) {
    const insertionMarker = '## 验证'

    const markerIndex =
      next.indexOf(insertionMarker)

    if (markerIndex < 0) {
      throw new Error(
        '无法在 AGENTS.md 中找到验证章节',
      )
    }

    next =
      next.slice(0, markerIndex) +
      documentationSection +
      next.slice(markerIndex)
  }

  return next
}

function assertPostconditions(root) {
  const readme = readRequiredText(
    join(root, README_PATH),
  )

  const agents = readRequiredText(
    join(root, AGENTS_PATH),
  )

  const requiredReadmeFragments = [
    'tldraw Editor 和 TLStore 是画布文档的事实标准',
    '@tldraw/sync 是唯一画布同步协议',
    'editor/core',
    'editor/document',
    'features/workspace',
    'foundations/kernel 提供 ID、基础错误和无产品语义的核心类型',
    'https://github.com/xiaojianc916/Canvas.git',
    'architecture.scaffolds.json',
  ]

  for (const fragment of requiredReadmeFragments) {
    if (!readme.includes(fragment)) {
      throw new Error(
        `README 修改后缺少：${fragment}`,
      )
    }
  }

  const forbiddenReadmeFragments = [
    '├── domains/',
    'Yjs',
    'y-websocket',
    'hybrid-canvas.git',
    'domains → foundations',
    '文档模型不依赖具体画布渲染器',
  ]

  for (const fragment of forbiddenReadmeFragments) {
    if (readme.includes(fragment)) {
      throw new Error(
        `README 仍残留旧架构描述：${fragment}`,
      )
    }
  }

  const requiredAgentsFragments = [
    '│   ├── kernel/',
    '## 文档一致性',
    'README、AGENTS、ADR、代码和测试不得同时声明不同的文档内核',
  ]

  for (const fragment of requiredAgentsFragments) {
    if (!agents.includes(fragment)) {
      throw new Error(
        `AGENTS 修改后缺少：${fragment}`,
      )
    }
  }
}

function ensureTargetsAreClean(
  root,
  changes,
) {
  const result = spawnSync(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      ...changes.map(
        (change) => change.relativePath,
      ),
    ],
    {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
    },
  )

  if (result.error || result.status !== 0) {
    throw new Error(
      '无法检查目标文件状态',
    )
  }

  if (result.stdout.trim()) {
    throw new Error(
      [
        '目标文件存在未提交修改，脚本拒绝覆盖：',
        result.stdout.trim(),
      ].join('\n'),
    )
  }
}

function createBackup(root, changes) {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-')

  const backupRoot = join(
    root,
    '.refactor-backup',
    SCRIPT_NAME,
    timestamp,
  )

  for (const change of changes) {
    const destination = join(
      backupRoot,
      change.relativePath,
    )

    mkdirSync(dirname(destination), {
      recursive: true,
    })

    copyFileSync(
      change.absolutePath,
      destination,
    )
  }

  return backupRoot
}

function normalizeNewlines(value) {
  return value.replace(/\r\n/g, '\n')
}

function ensureFinalNewline(value) {
  return `${normalizeNewlines(value).replace(/\s*$/u, '')}\n`
}

function readRequiredText(path) {
  if (!existsSync(path)) {
    throw new Error(`文件不存在：${path}`)
  }

  return readFileSync(path, 'utf8')
}

function run(
  command,
  commandArgs,
  {
    cwd,
    label,
  },
) {
  const invocation =
    createCommandInvocation(
      command,
      commandArgs,
    )

  console.log(`\n[${label}]`)
  console.log(
    `$ ${command} ${commandArgs.join(' ')}`,
  )

  const result = spawnSync(
    invocation.command,
    invocation.args,
    {
      cwd,
      encoding: 'utf8',
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    },
  )

  if (result.error) {
    throw new Error(
      `${label} 无法启动：${result.error.message}`,
    )
  }

  if (result.status !== 0) {
    throw new Error(
      `${label} 失败，退出码 ${String(result.status)}`,
    )
  }
}

function createCommandInvocation(
  command,
  commandArgs,
) {
  if (process.platform !== 'win32') {
    return {
      command,
      args: commandArgs,
    }
  }

  const commandsRequiringCmd =
    new Set([
      'corepack',
      'npm',
      'npx',
      'pnpm',
      'yarn',
    ])

  if (
    !commandsRequiringCmd.has(command)
  ) {
    return {
      command,
      args: commandArgs,
    }
  }

  const comspec =
    process.env.ComSpec ||
    process.env.COMSPEC ||
    'C:\\Windows\\System32\\cmd.exe'

  const commandLine = [
    quoteWindowsCommandArgument(command),
    ...commandArgs.map(
      quoteWindowsCommandArgument,
    ),
  ].join(' ')

  return {
    command: comspec,
    args: [
      '/d',
      '/s',
      '/c',
      commandLine,
    ],
  }
}

function quoteWindowsCommandArgument(
  value,
) {
  const text = String(value)

  if (/[\r\n&|<>^%!]/u.test(text)) {
    throw new Error(
      `命令参数包含不允许的字符：${text}`,
    )
  }

  if (text.length === 0) {
    return '""'
  }

  if (!/[\s"]/u.test(text)) {
    return text
  }

  return `"${text.replaceAll('"', '""')}"`
}
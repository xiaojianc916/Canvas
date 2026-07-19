# Hybrid Canvas

Hybrid Canvas 是一个基于 **Tauri、React 和 Rust** 构建的模块化桌面画布应用。

项目致力于将无限画布、流程图、自由绘制、科学图表、文档管理、实时协作和插件扩展整合到统一的桌面工作台中，同时保持业务领域、平台适配和基础设施之间清晰的架构边界。

> 项目目前处于早期开发阶段，正在建设工程基础、领域模型、桌面运行时和核心画布能力。文档中标记为规划中的功能尚不代表已经完成。

---

## 项目目标

Hybrid Canvas 的目标不是简单封装一个画布组件，而是建立一套能够长期演进的混合画布基础设施：

- 支持无限画布和结构化文档共同工作。
- 支持流程图、自由绘制、科学图表等多种内容类型。
- 提供可验证、可迁移的本地文档格式。
- 通过 Rust 处理文件系统、资源存储和高性能任务。
- 通过 TypeScript 领域层维护平台无关的业务规则。
- 提供桌面端、Web 和 Worker 等不同运行时适配能力。
- 支持实时协作、插件扩展、导入导出和后台计算。
- 通过架构测试约束模块依赖方向。

---

## 当前状态

| 模块 | 状态 |
| --- | --- |
| Monorepo 工程基础 | 建设中 |
| Tauri 桌面应用 | 建设中 |
| React 工作台界面 | 建设中 |
| tldraw 画布适配 | 建设中 |
| 文档领域模型 | 建设中 |
| 本地文件格式 | 规划中 |
| 流程图 | 规划中 |
| 自由绘制 | 规划中 |
| 科学绘图 | 规划中 |
| 实时协作 | 规划中 |
| 导入导出 | 规划中 |
| WASM 插件系统 | 规划中 |

---

## 技术栈

| 类型 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 前端框架 | React 19 |
| 编程语言 | TypeScript 7、Rust |
| 构建工具 | Vite 8、Turborepo |
| 包管理器 | pnpm 11 |
| 画布引擎 | tldraw 5 |
| UI 基础 | Radix UI、Tailwind CSS 4 |
| 组件模式 | shadcn/ui |
| 图标 | Lucide |
| 状态管理 | Zustand 5 |
| 数据校验 | Valibot 1 |
| 实时协作 | Yjs、y-websocket |
| 流程图布局 | Dagre、ELK |
| 自由绘制 | perfect-freehand |
| 科学绘图 | uPlot、Apache Arrow、D3 |
| TypeScript 测试 | Vitest |
| 端到端测试 | Playwright |
| Rust 测试 | Cargo Test |
| 代码检查 | Biome、TypeScript、Clippy |
| 依赖审计 | cargo-deny |

---

## 目录结构

```

hybrid-canvas/

├── apps/
│   └── desktop/                    # Tauri 桌面应用
│       ├── src/                    # React 前端
│       │   ├── bootstrap/          # 应用初始化
│       │   ├── composition/        # 领域与平台能力组合
│       │   └── windows/            # 窗口入口与管理
│       └── src-tauri/              # Rust 桌面后端
│           ├── src/
│           │   ├── bindings/       # 前后端类型绑定
│           │   ├── bootstrap/      # Tauri 初始化
│           │   ├── commands/       # IPC 命令
│           │   └── ipc/            # IPC 契约
│           └── capabilities/       # Tauri 权限声明
│
├── domains/                        # 业务领域模块
│   ├── asset/                      # 图片、附件和资源引用
│   ├── canvas/                     # 画布渲染与 tldraw 适配
│   ├── collaboration/              # Yjs 实时协作
│   ├── document/                   # 文档、页面、元素和历史
│   ├── file/                       # 文件用例、序列化和迁移
│   ├── flowchart/                  # 流程图与自动布局
│   ├── freehand/                   # 自由绘制
│   ├── import-export/              # 外部格式导入导出
│   ├── plugin/                     # 插件模型和 WASM 沙箱
│   ├── scientific-plot/            # 科学图表和列式数据
│   ├── settings/                   # 用户设置
│   └── workspace/                  # 工作台、标签页和命令入口
│
├── foundations/                    # 共享基础设施
│   ├── design-system/              # UI 原语和设计令牌
│   ├── geometry/                   # 点、矩形、变换等几何类型
│   ├── kernel/                     # ID、Result、Clock 和错误类型
│   ├── observability/              # 日志、指标和诊断
│   ├── serialization/              # 通用序列化工具
│   └── test-kit/                   # 测试工具和 Fixture
│
├── platforms/                      # 平台适配器
│   ├── desktop-ipc/                # Tauri IPC TypeScript 接口
│   ├── desktop-runtime/            # 桌面平台能力实现
│   ├── web-runtime/                # Web 平台能力实现
│   └── worker-runtime/             # Web Worker 运行时
│
├── tests/                          # 跨模块测试
│   ├── architecture/               # 架构约束测试
│   ├── cross-domain-contract/      # 跨领域契约测试
│   ├── desktop-e2e/                # 桌面端端到端测试
│   ├── performance/                # 性能和基准测试
│   ├── release/                    # 发布验证
│   └── security/                   # 安全测试
│
├── tooling/                        # 工程工具
│   ├── benchmarks/                 # 基准测试工具
│   ├── config/                     # 共享工程配置
│   ├── dependency-rules/           # 依赖边界规则
│   ├── generators/                 # 代码生成器
│   └── release/                    # 发布自动化
│
├── docs/                           # 项目文档
│   ├── adr/                        # 架构决策记录
│   ├── architecture/               # 架构设计
│   ├── compatibility/              # 兼容性矩阵
│   ├── domain-map/                 # 领域关系图
│   ├── rfcs/                       # 设计提案
│   └── runbooks/                   # 开发和运维手册
│
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── turbo.json
├── tsconfig.base.json
├── biome.json
├── Cargo.toml
├── Cargo.lock
├── rust-toolchain.toml
└── deny.toml

```

---

## 架构分层

项目划分为五个主要层级。

### Applications

`apps` 是应用程序组合入口。

应用层负责：

- 初始化应用。
- 装配领域能力。
- 注入平台适配器。
- 管理窗口和应用生命周期。
- 提供最终可执行程序。

应用层不应承载可复用的核心业务规则。

### Domains

`domains` 存放业务能力。

领域模块负责：

- 定义业务实体和值对象。
- 定义领域服务和用例。
- 定义平台能力端口。
- 定义公开契约。
- 维护领域不变量。

领域模块不应直接依赖 Tauri、Node.js 文件系统或具体数据库实现。

### Foundations

`foundations` 提供跨领域基础能力。

基础模块必须保持稳定、通用和低耦合，不应依赖任何具体业务领域。

### Platforms

`platforms` 实现领域层定义的端口。

例如：

- 文件系统访问。
- Tauri IPC 调用。
- Web Storage。
- Web Worker。
- 系统剪贴板。
- 系统通知。
- 原子文件写入。

### Tooling and Tests

`tooling` 负责工程自动化，`tests` 负责跨模块验证。

它们不应成为业务运行时代码的一部分。

---

## 依赖规则

允许的主要依赖方向：

```

apps

├── domains
├── platforms
└── foundations

platforms
├── domains
└── foundations

domains
└── foundations

foundations
└── 第三方基础库

```

禁止的依赖方向：

```

foundations → domains

foundations → platforms

foundations → apps

domains → apps

domains → 具体平台实现

platforms → apps

```

其他约束：

1. 跨包访问必须经过包的公开入口。
2. 禁止从其他包导入 `src/internal` 等内部路径。
3. 领域间依赖必须保持单向。
4. 运行时代码使用的依赖必须声明在 `dependencies`。
5. 测试工具只能声明在 `devDependencies`。
6. React 共享组件包通过 `peerDependencies` 声明 React。
7. 平台 API 必须封装在 `platforms` 或应用层。
8. 不允许为了目录结构完整而创建无职责的空目录。

---

## 前端与 Rust 的职责边界

### TypeScript 负责

- 文档领域模型。
- 画布交互。
- 命令系统。
- 工作台状态。
- 属性面板。
- 领域用例。
- 数据校验。
- 平台无关的业务规则。
- UI 状态与渲染。

### Rust 负责

- 本地文件系统访问。
- 原子保存。
- ZIP 容器读写。
- 大文件流式处理。
- 资源完整性校验。
- 系统级能力调用。
- 安全边界。
- 高性能后台任务。
- Tauri IPC 命令。

前端不直接操作真实文件路径，Rust 也不负责前端界面状态。

---

## 文档格式方向

Hybrid Canvas 计划使用版本化的 `.draw` 文档容器。

概念结构如下：

```

example.draw
├── manifest.json
├── document.json
├── assets/
│   └── <sha256>
└── previews/
└── thumbnail.webp

```

设计目标：

- 文档格式具有明确版本。
- 文档内容可以迁移和校验。
- 资源通过 SHA-256 进行内容寻址。
- 文件保存采用临时文件和原子替换。
- 未知字段尽可能保留。
- 损坏文档能够进入恢复流程。
- 文档模型不依赖具体画布渲染器。

该格式仍处于设计和实现阶段。

---

## 环境要求

推荐环境：

| 工具 | 版本 |
| --- | --- |
| Node.js | `>=24 <27` |
| pnpm | `>=11 <12` |
| Rust | 由 `rust-toolchain.toml` 固定 |
| Git | 最新稳定版 |

Windows 开发 Tauri 还需要：

- Microsoft Visual Studio Build Tools。
- Desktop development with C++。
- Windows SDK。
- Microsoft Edge WebView2 Runtime。

确认环境：

```

node --version

pnpm --version

rustc --version

cargo --version

git --version

```

---

## 开始开发

### 克隆仓库

```

git clone https://github.com/xiaojianc916/hybrid-canvas.git

cd hybrid-canvas

```

### 安装依赖

```

corepack enable

pnpm install

```

### 启动桌面应用

```

pnpm tauri dev

```

也可以直接进入桌面应用：

```

pnpm --filter @hybrid-canvas/desktop tauri dev

```

---

## 常用命令

### 启动开发环境

```

pnpm dev

```

### 启动 Tauri

```

pnpm tauri dev

```

### 类型和架构检查

```

pnpm check

```

### 运行 TypeScript 测试

```

pnpm test

```

### 构建所有 TypeScript 包

```

pnpm build

```

### 检查代码格式

```

pnpm biome check .

```

### 自动修复可修复问题

```

pnpm biome check --write .

```

### 检查 Rust workspace

```

cargo check --workspace

```

### 运行 Rust 测试

```

cargo test --workspace

```

### 运行 Clippy

```

cargo clippy --workspace --all-targets --all-features -- -D warnings

```

### 检查 Rust 格式

```

cargo fmt --all --check

```

### 检查依赖状态

```

pnpm outdated -r

pnpm ls -r

cargo tree

```

### 清理构建产物

```

pnpm clean

cargo clean

```

---

## 包开发约定

每个 TypeScript 包应提供明确的公开入口：

```

src/public-api.ts

```

其他包只能通过包名导入：

```

import {

createDocumentId,

} from '@hybrid-canvas/foundations-kernel'

```

不要跨包导入内部文件：

```

// 禁止

import {

createDocumentId,

} from '../../foundations/kernel/src/id/create-document-id'

```

领域模块建议采用以下内部结构：

```

src/
├── application/       # 用例、命令和查询
├── domain/            # 实体、值对象和领域服务
├── ports/             # 外部能力接口
├── presentation/      # 可选的领域 UI
├── infrastructure/    # 非平台相关的基础实现
└── public-api.ts      # 包公开入口

```

只在存在真实职责时创建目录，不使用 `.gitkeep` 批量保留空目录。

---

## IPC 约定

桌面前端与 Rust 后端通过显式 IPC 契约通信。

IPC 设计应满足：

- 输入和输出类型明确。
- 错误使用结构化错误码。
- IPC 类型由单一来源生成。
- 前端不直接拼接命令名称。
- Rust 不向前端暴露任意文件系统能力。
- 每项 Tauri 能力遵循最小权限原则。

示例：

```

export interface OpenDocumentRequest {

readonly path: string

}

export interface OpenDocumentResult {

readonly documentId: string

readonly revision: number

}

```

---

## 测试策略

项目采用分层测试策略。

### 单元测试

验证：

- 值对象。
- 领域服务。
- 几何计算。
- 序列化。
- 数据迁移。
- 命令处理。

### 契约测试

验证：

- 跨领域公开接口。
- TypeScript 与 Rust IPC 契约。
- 文件格式版本兼容性。
- 平台端口实现。

### 架构测试

验证：

- 领域模块不能依赖应用层。
- Foundation 不能依赖 Domain。
- 禁止跨包内部路径导入。
- 禁止循环依赖。
- 禁止领域代码直接访问平台 API。

### 端到端测试

使用 Playwright 验证：

- 应用启动。
- 创建和打开文档。
- 编辑与撤销。
- 保存和恢复。
- 导入与导出。
- 多窗口行为。

### 性能测试

重点关注：

- 大型文档加载时间。
- 高频指针事件。
- 画布缩放和平移。
- 大量元素渲染。
- 科学数据集处理。
- 文档序列化。
- 增量保存。

---

## 安全原则

- Tauri capabilities 遵循最小权限原则。
- 前端不能访问任意系统路径。
- 文件访问必须经过 Rust 命令。
- 插件不能直接获得宿主系统权限。
- 外部文档必须经过结构校验。
- 导入器必须限制资源大小和递归深度。
- 资源内容必须进行完整性验证。
- 日志不得记录密钥、令牌和完整用户文档。
- 发布前必须执行依赖和权限审计。

---

## 文档

项目文档位于 `docs/`：

```

docs/
├── adr/                # 已接受的架构决策
├── architecture/       # 系统架构设计
├── compatibility/      # 文件和平台兼容性
├── domain-map/         # 领域关系
├── rfcs/               # 设计提案
└── runbooks/           # 开发、发布和故障处理手册

```

重要架构变更应先提交 RFC，并在决策稳定后形成 ADR。

---

## 提交代码

提交前至少执行：

```

pnpm check

pnpm test

pnpm build

cargo fmt --all --check

cargo clippy --workspace --all-targets --all-features -- -D warnings

cargo test --workspace

```

推荐使用语义化提交信息：

```

feat: add document creation use case

fix: prevent duplicate asset references

refactor: isolate desktop file adapter

test: add document migration coverage

docs: describe IPC contract rules

chore: update workspace dependencies

```

---

## 路线图

### 第一阶段：工程基础

- [ ] 完成 Monorepo 构建和检查链路。
- [ ] 建立模块依赖约束。
- [ ] 完成 TypeScript 与 Rust IPC 类型生成。
- [ ] 建立基础设计系统。
- [ ] 建立测试和持续集成流程。

### 第二阶段：核心文档与画布

- [ ] 完成文档领域模型。
- [ ] 完成 tldraw 画布适配。
- [ ] 建立命令、撤销和重做系统。
- [ ] 实现属性面板和页面管理。
- [ ] 实现本地文档保存和恢复。

### 第三阶段：专业内容能力

- [ ] 实现流程图和自动布局。
- [ ] 实现自由绘制。
- [ ] 实现科学图表。
- [ ] 实现外部格式导入导出。
- [ ] 实现资源管理和缩略图。

### 第四阶段：协作与扩展

- [ ] 实现 Yjs 实时协作。
- [ ] 实现离线同步和冲突处理。
- [ ] 实现 Worker 后台任务。
- [ ] 实现 WASM 插件沙箱。
- [ ] 建立插件权限模型。

### 第五阶段：发布质量

- [ ] 完成性能基线。
- [ ] 完成安全审计。
- [ ] 完成文件格式兼容性测试。
- [ ] 完成安装包和自动更新流程。
- [ ] 完成发布验证和恢复演练。

---

## 许可证

项目当前尚未声明开源许可证。

在仓库添加正式 `LICENSE` 文件之前，源代码默认不授予复制、修改、分发或商业使用权。
```
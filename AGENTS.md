# AGENTS.md

## 使命

守住 Hybrid Canvas 的长期架构地基：**本地优先、领域驱动、安全、高性能、可演进**。

领域模型与用户文件是核心；React、tldraw、Tauri、Yjs、WASM、数据库及云服务均为可替换适配器。

## 不可违反的边界

```

apps ───────────────► domains + platforms

presentation ───────► application ─────► domain

adapters ───────────► ports ───────────► domain

platforms ─ implements domain ports

domain ─────────────► foundations

```

- `domains/*` 分别拥有各自业务事实；不得跨域直接读写状态。
- `document` 只拥有通用文档结构、元素信封、关系、事务与历史；专业数据归对应领域。
- `apps/*` 只负责启动、路由和依赖装配。
- `platforms/*` 只实现平台能力，不拥有业务规则或领域状态。
- `foundations/*` 只接收无业务语义、已被多个领域稳定复用的基础能力。
- 跨领域只能依赖 `public-api.ts`；禁止 deep import、循环依赖和共享可变 Store。
- 禁止根级 `components`、`services`、`utils`、`stores`、`types`、`managers`。
- 不为假想需求创建抽象、空目录、兼容层或第二套实现。

## 领域内部

按真实职责创建：

```

domain/         实体、值对象、不变量、领域事件

application/    用例、命令、事务与任务编排

ports/          本领域所需能力的稳定契约

adapters/       框架、存储、网络与平台实现

presentation/   UI 与交互适配

worker/         可取消的重计算任务

public-api.ts   唯一跨领域入口

```

约束：

- `domain` 不依赖 React、tldraw、Tauri、Yjs、DOM、网络、文件系统或数据库。
- `application` 不依赖 `adapters`、`presentation` 或具体平台。
- 第三方类型不得穿透 Port、领域事件、IPC 或公开 API。
- 一个领域不得访问另一领域的内部对象、Store、数据库表或 TLStore records。
- 跨域写入必须调用目标领域的 Command 或 Use Case。

## 状态与写入

- 各领域事实只存在于其领域模型。
- tldraw Store 是编辑投影，不是文件格式或业务事实来源。
- Yjs 是协作适配器，不是单机模型的前提。
- React Store 只保存瞬时 UI 状态，不复制领域事实。
- 文件、缓存、协作状态与 UI 状态必须有明确且唯一的所有者。

所有持久修改必须经过：

```

Intent → Command → Validation → Domain Transaction

→ Domain Events → Projection → Persistence / Collaboration

```

- 一次用户意图对应一个原子事务和一个 Undo 单元。
- 保存、同步、投影和索引不得产生用户历史。
- 异步结果提交前必须校验 revision；过期结果直接丢弃。
- 禁止旁路写入、双写、镜像状态和全局事件总线。

## Rust、Tauri 与 IPC

- Rust 负责原子文件操作、资源流、系统集成、安全边界和崩溃恢复。
- TypeScript 负责产品语义、领域事务与交互编排。
- 禁止在 Rust 与 TypeScript 中重复实现领域规则、迁移或导出语义。
- IPC 使用生成式、显式、可验证的 DTO。
- 禁止 `serde_json::Value`、任意路径、第三方对象和原始堆栈穿透 IPC。
- 每个命令必须定义 capability、错误码、超时、取消、幂等及重试语义。
- WebView、Worker 和插件不得获得任意原生能力。

## 文件与兼容性

- 用户文件是最终真相；云端、缓存和 TLStore 均非权威数据源。
- Schema 变更必须提供确定性迁移、兼容策略和 round-trip fixture。
- 未知字段与未知扩展必须无损保留。
- 无法安全理解的新格式只能只读；禁止静默降级后覆盖原文件。
- 保存必须采用 `serialize → temp → fsync → atomic replace`，并支持崩溃恢复。
- 大型数据、资源及运行时实例不得进入 Shape props、React state 或 JSON IPC。

## 安全与插件

- 文件、ZIP、SVG、字体、图片、CSV、剪贴板、插件和协作消息一律视为不可信输入。
- 所有边界输入必须校验 schema、权限、大小、路径和资源预算。
- 插件只能通过声明式贡献或受控 RPC 使用显式 capability。
- 插件不得直接访问 Editor、Tauri、文件系统、网络或宿主 Store。
- 插件或单个 Shape 失败必须局部降级，不得阻止文档保存。
- 未经基准与威胁模型证明，不引入 WASM、原生重写或更宽权限。

## 性能与并发

- 布局、数据处理、导入导出及重计算不得阻塞主线程。
- 长任务必须可取消、可超时、可诊断，并使用不可变输入和版本化输出。
- 大规模画布必须采用视口剔除、LOD、增量投影和有界缓存。
- 性能决策必须基于固定 fixture、目标设备和可重复基准。
- 不以未经验证的性能假设增加架构复杂度。

## 修改准则

修改前：

1. 确认事实所有者、目标领域和依赖方向。
2. 阅读相关 README、ADR、公开 API、契约与测试。
3. 搜索现有模型和写入路径，避免重复实现。
4. 判断是否影响文件格式、IPC、插件 API、权限或跨域依赖。

修改时：

1. 先定义领域行为、不变量和失败语义，再实现适配器与 UI。
2. 保持单一事实来源和单一写入路径。
3. 替换旧路径时同步删除旧实现，不保留无期限双轨。
4. 新依赖必须说明必要性、边界位置和退出策略。
5. 持久格式、IPC、权限、插件 API 或依赖方向变更必须进入 ADR/RFC。

禁止：

- 用兼容层掩盖错误边界。
- 绕过公开 API、Command Bus 或架构测试。
- 空 `catch`、隐式副作用、万能 Store、万能 Manager。
- 未经请求扩大改动范围。
- 未验证即宣称完成。

## 验证

至少执行：

```

pnpm lint

pnpm typecheck

pnpm test

cargo fmt --check

cargo clippy --workspace --all-targets --all-features

cargo test --workspace

```

并执行所有受影响的架构、契约、E2E、性能、安全及兼容性测试。

## 完成标准

只有同时满足以下条件才算完成：

- 事实来源唯一，写入路径唯一。
- 依赖方向合法，无 deep import、循环依赖或跨域越权。
- 正常、失败、取消、恢复及兼容路径明确。
- 测试覆盖领域不变量和边界契约。
- 无死代码、双轨逻辑、临时绕过或无主抽象。
- 文档、契约、实现与测试一致。
```
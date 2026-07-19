# ADR-001: tldraw 采用、许可成本、license key 注入、升级策略、退出策略

## 状态
Accepted

## 背景
项目采用 `tldraw@5.2.5` 作为画布编辑器核心。tldraw 采用 **源码可用、非开源** 的商业许可模式：

- 开发环境可免费使用
- 生产环境（商业/非商业）均需购买许可证
- 许可证通过 license key 注入验证
- 无许可证构建会在控制台报警、功能受限

若等到发布前处理许可证，将面临：
1. 无法合法分发生产构建
2. 架构已深度耦合 tldraw Store / TLRecord / Shape / Tool / Binding，替换成本极高
3. 可能被迫接受不利商业条款

## 决策

### 1. 现在即建立许可证管理流程
- 在 CI/CD 中注入 `TLDRaw_LICENSE_KEY` 环境变量
- 本地开发通过 `.env.local` 配置（不提交）
- 构建脚本校验 license key 存在性，缺失则失败

### 2. 架构层面解耦 tldraw（退出策略前置）
在 `domains/canvas` 内部建立 **严格边界**：

| 层 | 职责 | 禁止事项 |
|---|---|---|
| `adapters/tldraw` | TLStore 初始化、shape/tool/binding 注册、license key 注入、导入导出适配 | 不导出 tldraw 类型到 public-api |
| `application/` | 画布用例（创建/删除元素、撤销重做、选择、编组） | 不直接操作 TLStore |
| `domain/` | 画布领域模型（Canvas、Element、Selection、History） | 零 tldraw 依赖 |
| `ports/` | `CanvasPort`、`CanvasRepository`、`ShapeSerializer` | 仅领域类型 |

**关键约束：**
- `domain/`、`application/`、`ports/` **零 tldraw 导入**
- 仅 `adapters/tldraw/` 可导入 `tldraw`、`@tldraw/tlschema`、`@tldraw/editor`
- 文件格式 `.draw` **不等于** TLStore snapshot；领域层自有序列化 Schema
- Shape/Tool/Binding 仅存在于 adapter 内部，领域层使用 `Element` + `ShapeType` 枚举

### 3. 许可证成本纳入预算
- 团队版许可证费用记入项目运营预算
- 每年评估续费 ROI；若成本超阈值，触发退出策略

### 4. 升级策略
- 锁定 minor 版本（`5.2.x`），仅打 patch 补丁
- 升级前跑完整：契约测试、E2E、性能基线、license key 验证
- 重大版本升级视为架构变更，需 ADR

### 5. 退出策略（随时可执行）
若许可证谈判失败、tldraw 变更许可模式、或技术栈调整：
1. 在 `adapters/` 新增 `canvas-kit` / `fabric` / `excalidraw` 等替代 adapter
2. 领域层、应用层、端口**零修改**
3. 通过 feature flag 逐步切流量
4. 保留 `.draw` 文件格式兼容性（迁移脚本由 import-export 领域提供）

## 后果

### 正面
- 合规风险提前消除
- 架构边界倒逼领域模型纯净，降低长期维护成本
- 具备真实的技术选型可逆性

### 负面
- 初期需编写 adapter 层胶水代码（约 2-3 人周）
- 需维护双套序列化（领域 Schema + tldraw snapshot）

## 验收标准
- [ ] CI 中 `pnpm build` 缺少 `TLDRaw_LICENSE_KEY` 直接失败
- [ ] `domains/canvas/src/public-api.ts` **不导出** 任何 `tldraw` 类型
- [ ] `domains/canvas/src/domain/`、`application/`、`ports/` 目录下 `grep -r "tldraw"` 结果为空
- [ ] `.draw` 文件 round-trip 测试通过（不依赖 tldraw 运行时）
- [ ] ADR 评审通过，记录许可证费用、到期日、负责人
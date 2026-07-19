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

### 2. 架构层面：tldraw 为编辑器内核，退出策略通过扩展边界保障

tldraw 是 `editor/core` 的不可分割内核，而非可替换适配器。退出策略通过限定 `public-api.ts` 的导出边界实现：

| 层 | 职责 | 禁止事项 |
|---|---|---|
| `editor/core` | Editor Runtime、TLSchema/TLStore 创建、Extension Registry | 不将 tldraw 类型泄漏到 features/public-api |
| `features/*` | 通过 `EditorExtension` 贡献 Shape/Tool/Binding/Record | 直接创建 TLStore 或 Editor |
| `editor/extensions` | 插件声明与生命周期管理 | 直接操作 Editor |

**关键约束：**
- 只有 `editor/core` 可以创建 TLSchema、TLStore、Editor
- Feature 通过 `EditorExtension` 接口贡献类型
- 文件格式 `.draw` 以 TLStore snapshot 为核心
- 退出场景下仅需替换 `editor/core` 及其 snapshot 格式

### 3. 许可证成本纳入预算
- 团队版许可证费用记入项目运营预算
- 每年评估续费 ROI；若成本超阈值，触发退出策略

### 4. 升级策略
- 锁定 minor 版本（`5.2.x`），仅打 patch 补丁
- 升级前跑完整：契约测试、E2E、性能基线、license key 验证
- 重大版本升级视为架构变更，需 ADR

### 5. 退出策略（随时可执行）
若许可证谈判失败、tldraw 变更许可模式、或技术栈调整：
1. 替换 `editor/core` 实现（适配新内核的 Editor Runtime、TLSchema、Extension API）
2. Feature 层通过一致的 `EditorExtension` 接口迁移
3. 通过 feature flag 逐步切流量
4. 保留 `.draw` 文件格式兼容性（迁移脚本由 import-export feature 提供）

## 后果

### 正面
- 合规风险提前消除
- 架构边界倒逼领域模型纯净，降低长期维护成本
- 具备真实的技术选型可逆性

### 负面
- 退出时需要替换整个 `editor/core`，成本约为 3-5 人周

## 验收标准
- [ ] CI 中 `pnpm build` 缺少 `TLDRaw_LICENSE_KEY` 直接失败
- [ ] `editor/core/src/public-api.ts` **不导出** 任何 `tldraw` 类型
- [ ] Feature 通过 `EditorExtension` 贡献，不直接创建 Editor 或 TLStore
- [ ] `.draw` 文件 round-trip 测试通过
- [ ] ADR 评审通过，记录许可证费用、到期日、负责人
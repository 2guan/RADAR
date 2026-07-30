# RADAR GitHub Enterprise 协作与合并管理规约

## 分支、工作区与 PR

- 每个需求使用独立工作区与短生命周期分支：`<开发者账号>/REQ-YYYYMMDD-001-short-name`，例如 `hengguan/REQ-20260729-002-task-status-columns`。分支名必须包含需求编号；需求类型、模块和变更说明通过提交信息与 PR 标题表达。
- 一个 PR 只交付一个细粒度需求，必须引用需求编号并说明模块、契约、数据库、权限、审计、验证、发布和回退。
- 不直接向 `main` 推送；不自行批准自己的 PR；不绕过 required checks、CODEOWNERS 或分支保护。

当前仅 `REQ-20260724-001` 获项目负责人书面授权，可在单维护人过渡期直接维护 `main`。该例外必须同时记录在需求与 AI 任务范围中，并在 `review_by` 前复核；它不适用于后续多人协作需求，也不免除测试、审计与范围检查。

## 审批与保护

`CODEOWNERS` 和 `modules.yaml` 共同定义审批责任。实际 GitHub 团队配置完成前，仓库只保留占位说明，不得把占位 Owner 配为可满足的强制审批人。主分支 Ruleset 须由仓库管理员在 GitHub Enterprise 配置：PR、至少一名非作者审批、CODEOWNERS、必过检查、线性历史与限制强推。

## 自动门禁

PR 必须通过：任务范围路径检查、模块依赖检查、构建、静态检查、单元/API/权限测试、SQLite 与 TDSQL/MySQL 8 迁移验证，以及密钥、依赖、许可证和容器扫描。修改公共能力时还须校验 Shared Change Issue 与对应 Owner。已有依赖风险只能记录在 `governance/security-audit-baseline.json` 中，并设置复核截止日；新增风险、关键风险或过期基线必须失败。

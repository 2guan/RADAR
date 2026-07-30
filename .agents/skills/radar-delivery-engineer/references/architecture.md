# 架构与所有权

## 事实源

- `governance/modules.yaml`：模块路径、Owner、依赖、公开契约和风险等级。
- `docs/governance/PROJECT-RULES.md`：架构、数据、配置和质量规则。
- `docs/governance/AI-CODING-RULES.md`：AI准入、数据边界和完成报告。
- `docs/governance/GITHUB-RULES.md`：分支、PR、审批和CI规则。
- 当前 `docs/requirements/<REQ>/requirement.md` 与 `ai-task-scope.yaml`：单任务权限和验收。

## 所有权模型

- `server/src/platform`、`web/src/platform`：认证、持久化、审计、附件、运行时、HTTP、布局和应用状态等技术能力。除对应平台模块或治理任务外只读。
- `server/src/shared`、`web/src/shared`：无业务表所有权的公共能力，修改需声明公共能力变更并完成回归。
- `server/src/modules/<module>`、`web/src/modules/<module>`：业务模块私有实现。
- `settings/reference-data`：字典、系统、投产点、编号规则和参考数据。
- `settings/process-configuration`：字段、分区、交付件、状态规则、布局和配置版本。

跨模块只能使用登记的 `index.js` 或 `contracts/**`。不得导入其他模块的路由、仓储、私有组件或持久化实现。

## 变更归属

| 变更 | Owner |
| --- | --- |
| 业务行为和业务页面 | 对应业务模块 |
| 字典、系统、投产点、编号规则 | `settings/reference-data` |
| 可配置字段、交付件、分区和布局 | `settings/process-configuration` |
| 认证、审计、附件、运行时 | 对应 `platform/*` |
| 跨模块DTO、工具和共享UI | `shared/contracts`，需公共能力审批 |
| 规约、脚本、CI和仓库Skill | `governance` |

同时涉及多个 Owner 时，通过公开契约拆分工作，在需求范围中声明全部影响模块。

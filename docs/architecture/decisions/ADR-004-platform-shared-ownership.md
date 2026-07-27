# ADR-004：platform 与 shared 的归属和写入边界

## 背景

多人共创时，认证、持久化、审计、附件和前端应用壳需要稳定复用；表格、流程展示和无领域工具也需要跨模块共同维护。若两类代码都允许业务模块自由修改，会把基础设施与领域规则耦合，并放大并发冲突。

## 决策

- `platform` 是只读基础设施。业务模块只能通过 `governance/modules.yaml` 登记的公开契约调用；仅平台 Owner 或获批治理任务可以修改。
- `shared` 是无业务数据所有权的复用能力，可包含 DTO、纯工具、共享 UI 和流程展示。获授权模块可在 Shared Change Issue、Owner 审批和回归测试前提下维护。
- `shared` 不得写入业务表、承载业务状态流转决策或直接依赖其他业务模块私有实现。
- 配置不是公共基础设施：内置字段、扩展字段、交付件、布局、状态规则与配置版本归 `settings/process-configuration`；字典、系统、投产点和编号规则归 `settings/reference-data`。

## 后果

前后端均使用 `platform / shared / modules` 三层目录。模块间依赖必须通过公开入口，目录、Owner 和可依赖关系以 `governance/modules.yaml` 为机器可读事实源；`scripts/check-module-boundaries.mjs` 和 `scripts/check-ai-scope.mjs` 在 CI 中执行约束。

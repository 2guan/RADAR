# 后端业务模块规则

模块仅拥有 `governance/modules.yaml` 登记的表和公开契约。跨模块访问必须通过目标模块 `index.js` 或 `contracts/**`；不得导入其他模块 `api/`、`application/` 或私有数据访问实现，也不得直接写其表。

- `platform` 只提供认证、持久化、审计、附件、导入导出、运行时和可观测性能力；业务模块仅可调用登记的公开入口。
- `shared` 只提供无数据所有权的 DTO、工具和流程协作能力；不得在其中新增业务表写入、业务状态决策或私有模块依赖。
- 新增公共能力需在任务范围声明 Shared Change Issue、Owner 审批和兼容性测试；SQLite 与 TDSQL/MySQL 8 的 schema 变更必须成对追加迁移。

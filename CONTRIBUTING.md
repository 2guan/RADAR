# RADAR 贡献指南

正式研发规约位于 [docs/governance/README.md](docs/governance/README.md)。本文件仅说明日常入口。

## 开始开发

1. 从 `docs/requirements/TEMPLATE.md` 创建一个可独立实现、测试和验收的需求目录。
2. 研发受理后填写 `ai-task-scope.yaml`，明确模块、分支、工作区、可写/只读/禁止路径、风险和测试。
3. 从最新 `main` 创建独立工作区和短生命周期分支：`feat|fix|hotfix|docs|chore/REQ-YYYYMMDD-001-short-name`。
4. 阅读根目录、目标模块 `AGENTS.md` 和 `governance/modules.yaml` 后再修改。

## 提交前

- 一个 PR 只对应一个需求范围；不得混入无关格式化、依赖升级或重构。
- 修改公开契约、platform、shared/contracts、迁移、权限、审计、附件或外网能力时，必须按任务范围完成额外审批与测试。
- 至少执行任务范围要求的构建、静态检查、单元/API/权限测试；数据库变更还须验证 SQLite 与 TDSQL/MySQL 8。

## 合并

PR 必须引用需求编号，并说明模块、契约、数据库、权限、审计、验证与回退。不得绕过 required checks、CODEOWNERS 或主分支保护。

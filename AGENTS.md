# RADAR AI 开发入口

本文件供 AI 和自动化开发工具在仓库根目录自动发现。它只定义资料定位和读取顺序；架构、数据、安全、协作等规则以其对应的正式文档为唯一来源。

## 开始改动前

1. 确认需求编号，读取 `docs/requirements/<REQ>/requirement.md` 与 `ai-task-scope.yaml`。需求、任务范围或目标模块缺失时停止改动。
2. 在 [`governance/modules.yaml`](governance/modules.yaml) 确认目标模块、Owner、可修改路径、依赖和公开契约。
3. 读取本文件所在目录至目标文件路径上最近的 `AGENTS.md`；较深目录仅补充该目录特有的实现约定。
4. 按下表读取适用的唯一事实源，再开始设计或修改。

| 问题或变更类型 | 必读来源 |
| --- | --- |
| 架构、跨模块访问、数据、接口、迁移、权限、审计、外网、质量 | [docs/governance/PROJECT-RULES.md](docs/governance/PROJECT-RULES.md) |
| AI 准入、敏感信息、任务范围和完成报告 | [docs/governance/AI-CODING-RULES.md](docs/governance/AI-CODING-RULES.md) |
| 分支、PR、审批、CI | [docs/governance/GITHUB-RULES.md](docs/governance/GITHUB-RULES.md) |
| 模块职责与物理目录 | [docs/architecture/MODULES.md](docs/architecture/MODULES.md) |
| UI、组件、响应式与可访问性 | [DESIGN.md](DESIGN.md) |
| 数据库搬迁、备份与恢复 | [MIGRATION.md](MIGRATION.md) |

## 定位约定

- 以 `modules.yaml` 判断模块边界和公开契约；不要从目录结构或相似实现推断权限。
- 以 `ai-task-scope.yaml` 判断可写、只读和禁止路径；不要扩大任务范围。
- 需求目录说明业务结果和验收条件；架构决策在 `docs/architecture/decisions/` 中查找。
- 完成时按 AI Coding 规约如实报告实际文件、验证、风险和回退方式。

# RADAR 项目 AI 协作指令

本文件适用于仓库内所有开发人员和 AI Coding 工具。更近目录存在 `AGENTS.md` 时，须同时遵循；冲突时以限制更严格者为准，无法判断时停止修改并报告。

## 编码前必读

开始改动前必须读取：

1. `docs/governance/PROJECT-RULES.md`
2. `docs/governance/AI-CODING-RULES.md`
3. `docs/governance/GITHUB-RULES.md`
4. `governance/modules.yaml`
5. 当前需求目录中的 `requirement.md` 与 `ai-task-scope.yaml`
6. 目标模块最近的 `AGENTS.md`

缺少需求、任务范围、目标模块或影响正确实现的结论时，不得开始编码。

## 强制约束

- 只能修改任务范围 `writable_paths` 中的文件；`read_only_paths` 仅可读取；不得读取或修改 `forbidden_paths`。
- 不得将涉密信息、生产数据、真实用户数据、账号口令、密钥、内网地址、真实日志或附件发送给互联网模型；不得连接或修改生产系统。
- 模块只能通过 `governance/modules.yaml` 声明的公开契约访问其他模块；不得直接访问其内部实现或写入其负责的数据表。
- `platform` 是面向其他模块的只读技术能力：除所属平台模块或治理任务外，不得直接修改。`shared` 是经登记的可复用协作能力，可被模块读写，但变更必须保持无领域数据所有权、经公共能力审批并完成回归。
- 不得绕过 RBAC、审计、附件访问控制、外网白名单、自动化测试、CODEOWNERS 或分支保护；AI 不得自行审批、合并或发布。
- 数据库变更必须追加迁移，并同时兼容 SQLite 与 TDSQL/MySQL 8；不得改写已发布迁移。

## 实施与完成

编码前说明目标模块、拟改文件、公共能力、数据/权限/审计影响、测试和未决问题。完成后报告实际变更文件、范围一致性、测试结果、已知风险、上线验证及回退方式。

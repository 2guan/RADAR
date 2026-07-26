# RADAR AI Coding 研发协作与数据边界规约

## 任务准入

AI 任务必须关联状态为 `ready` 的 `requirement.md` 和完整 `ai-task-scope.yaml`。任务范围必须声明目标模块、独立分支/工作区、可写/只读/禁止路径、风险、测试、数据库与外网影响。范围缺失、规则冲突或存在影响实现的未决问题时，AI 必须停止编码。

## 数据与环境边界

- 禁止将生产数据、真实个人信息、账号口令、Token、Cookie、密钥、证书、内网地址、真实日志、真实附件、签名和未脱敏截图提供给互联网 AI。
- `contains_confidential_information=true` 时，`internet_ai_coding_allowed` 必须为 `false`；完成脱敏并确认上下文无敏感内容后才可变更。
- 禁止访问、连接、修改生产应用、生产数据库、生产文件存储和生产密钥系统。

## 修改边界与公共能力

- AI 仅能写入 `writable_paths`；不得以重命名、批量格式化或“顺手修复”扩大范围。
- 跨模块只能调用公开契约；不得直接写其他模块数据表。
- 修改 `platform`、`shared/contracts` 或模块公开契约时，任务范围必须声明 `public_capability_change`、Shared Change Issue、Owner 审批及旧行为回归测试。
- 默认新增语义明确的方法；修改已有公共方法行为仅限缺陷或安全修复，并必须说明兼容性。

## 完成报告

必须如实报告实际修改文件、运行过的命令及结果、数据库变更、已知风险和回退方式；不得声称未执行的验证已经通过。

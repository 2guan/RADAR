# 工单模块开发指令

本模块拥有 ticket 表、/tickets API 及其公开读取契约 index.js、contracts/**。工单与需求保持独立；下游只能调用此公开契约，禁止直接查询或写入 ticket 表。

允许依赖以 governance/modules.yaml 为准。写操作必须执行 RBAC、状态/必填校验及统一审计；附件必须通过 platform attachments。保持 ticket_code 和既有 REST API 兼容，跨模块新参数使用 workItemCode。必须覆盖正常、异常、无权限与边界路径。


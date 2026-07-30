# 工单模块补充约定

本模块拥有 `ticket` 表、`/tickets` API 和 `index.js`、`contracts/**` 公开读取契约。工单与需求保持独立；下游通过该公开契约协作，不直接访问工单数据。

保持 `ticket_code` 和既有 REST API 的兼容；跨模块新参数使用 `workItemCode`。

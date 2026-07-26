# RADAR 后端开发指令

- 新业务写入对应模块的 api / application / infrastructure / contracts 分层；旧 routes.js 仅作为迁移兼容入口。
- 路由只处理 HTTP、认证、参数与响应；业务编排不得继续堆入路由。`server/src/lib/` 已移除；新增 application、infrastructure、contracts 或 api 代码必须通过平台或业务模块公开契约访问跨模块能力。
- 业务模块只通过目标模块的 index.js 和 contracts/** 协作，禁止写其他模块数据表。
- 所有查询参数化；查询、排序、更新字段使用服务端白名单；不得记录口令、Token、敏感字段或附件内容。
- 认证、审计、附件、签名和持久化复用 platform 公开契约；SQLite 与 TDSQL/MySQL 8 必须同时兼容。
- 变更必须覆盖正常、异常、未登录、无权限和边界测试；外网能力获批前不得新增外网路由。

# RADAR 后端目录约定

本目录只补充后端实现位置；架构、数据和安全规则以根目录 `AGENTS.md` 指向的正式规约为准。

- 新业务实现放在所属模块的 `api/`、`application/`、`contracts/` 与 `index.js`；旧 `routes.js` 仅保留兼容入口。
- 路由负责 HTTP 适配；业务编排位于 `application/`；持久化能力由 `platform/persistence` 提供。
- 后端跨模块协作从目标模块的 `index.js` 或 `contracts/` 进入。

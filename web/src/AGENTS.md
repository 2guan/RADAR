# RADAR 前端目录约定

本目录只补充前端实现位置；设计、权限和跨模块规则以根目录 `AGENTS.md` 指向的正式文档为准。

- 新页面、业务组件、模块 API 和测试放在 `web/src/modules/<module>/`；不在已移除的顶层 `pages/`、`components/`、`hooks/`、`utils/` 或 `config/` 下新增实现。
- 通用 HTTP client、认证、路由、布局、应用状态、主题、附件和审计入口位于 `web/src/platform/`；跨模块共享 UI、流程展示和纯工具位于 `web/src/shared/`。
- 每个业务模块拥有自己的 `api/`、`pages/`、`components/` 和测试；业务页优先使用本模块 API 与已登记的共享能力。

# 前端业务模块规则

每个模块拥有自己的 pages、components、api、状态和测试。共享 UI 放 web/src/shared，应用壳/API client 放 web/src/platform。不要从其他模块复制或直接导入私有业务组件；跨模块复用须先形成公开组件或契约。


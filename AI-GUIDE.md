# RADAR 开发上下文指南

本指南为参与 RADAR 的开发者和开发助手提供最短的、以当前代码为准的上下文。开始改动前，先阅读 [PRODUCT.md](PRODUCT.md)、[DESIGN.md](DESIGN.md) 与 [COLLABORATION.md](COLLABORATION.md) 中和任务有关的章节。

## 项目事实

- **前端**：React 18、Vite 5、React Router 6、Ant Design 5、Zustand、ECharts。入口是 `web/src/main.jsx`，受保护路由由 `web/src/app.jsx` 装配。
- **后端**：Node.js `>=22.5.0`、Fastify 5、ESM。入口是 `server/src/server.js`；启动时依次执行迁移、种子、应用装配。
- **数据**：默认 SQLite；可用 `DB_CLIENT=tdsql` 或 `mysql` 连接 TDSQL/MySQL 兼容库。业务代码只能使用 `server/src/db/index.js` 暴露的异步接口。
- **部署**：前端构建产物位于 `web/dist`；生产时 Fastify 同时提供 `/api` 和 SPA 静态资源。`data/`、`attachments/` 必须持久化。
- **认证**：JWT + 角色权限并集；超级管理员绕过权限矩阵。生产写请求需要 `X-Requested-By` 与 `CSRF_HEADER_VALUE` 匹配。

## 先定位，再修改

| 需求 | 首先查看 |
| --- | --- |
| 页面、菜单、详情页 | `web/src/pages/`、`web/src/router/`、`web/src/layout/MainLayout.jsx` |
| 表格、筛选、导入导出 | `DataTable.jsx`、`FilterPanel.jsx`、`ImportModal.jsx`、`CrudManager.jsx` |
| 新建或编辑工作项 | `web/src/components/editors/` 与对应 `server/src/modules/*/routes.js` |
| 状态、终态、必填项 | `server/src/lib/status.js`、`required-fields.js`、`status-permission.js` |
| 权限 | `server/src/lib/perm-catalog.js`、`server/src/plugins/auth.js`、`web/src/components/Can.jsx` |
| 附件、审计、编号、Excel | `server/src/lib/attachment.js`、`audit.js`、`code-gen.js`、`excel.js` |
| 数据库、SQL、迁移 | `server/src/db/index.js`、`providers/`、`dialects/`、`migrations/` |
| 仪表盘 | `modules/dashboard/`、`lib/chart-dims.js`、`components/dashboard/` |

## 本地工作流

```bash
npm install
npm ci --prefix server
npm ci --prefix web
npm run dev

# 提交前至少执行
npm test --prefix server
npm run build --prefix web
```

不要将真实 `.env`、数据库文件、附件、构建目录或导入导出样本数据提交到仓库。

## 代码约定

1. 先复用现有服务和组件；只有现有抽象无法承载时再新增抽象。
2. 业务路由放在相应 `modules/<domain>/routes.js`，跨领域规则放在 `lib/`；不要把业务 SQL 或权限判断复制到前端。
3. 后端响应使用 `ok(data, message)`，错误使用 `badRequest`、`unauthorized`、`forbidden`、`notFound`；前端统一经 `api/client.js` 请求，避免裸 `axios`。
4. 所有外部输入必须白名单、参数化或校验。列表查询优先使用 `listQuery`；简单后台配置资源优先使用 `registerCrud`。
5. 业务写操作须考虑 `auditCreate`、`auditUpdate` 或 `auditDelete`；有状态变化时还须走 `assertStatusChangePermission`、状态合法性与动态必填校验。
6. SQLite 与 TDSQL 都是支持目标。不要在业务模块直接使用某一数据库特有的 JSON、日期、占位符或事务行为；需要差异时扩展 provider/dialect。
7. 前端权限展示使用 `<Can>` 和 store 的 `can()`，但它不是安全边界；后端每一个受保护接口必须使用 `authenticate`、`requirePerm` 或动态的测试类型权限校验。
8. 视觉实现遵循 [DESIGN.md](DESIGN.md)：复用 `DataTable`、`StatusBadge`、`DictSelect`、`SystemSelect`、`PersonPicker`、`EditorShell` 等公共组件，并同时检查明暗模式和窄屏。

## 改动检查单

- [ ] 已识别相关工作项链路、权限模块和投产点过滤口径。
- [ ] 新接口采用统一响应、鉴权、参数校验、审计与错误处理。
- [ ] 新字段有数据库迁移，SQLite 和 TDSQL 均可用，导入导出/详情/列表口径一致。
- [ ] 新状态已接入状态字典、终态语义、权限和必填项配置；未绕过前端限制。
- [ ] 新页面已补路由、菜单（如需）、权限控制、加载/空态/失败态、移动端表现。
- [ ] 已运行后端测试与前端构建；对关键链路完成手工验证。
- [ ] 已更新受影响的根目录文档或操作手册。

## 常见误区

- `req_code` 在开发、测试和部分审批表中是“关联工作项编号”，可以是需求编号也可以是工单编号。
- NFT、SEC 不是每个工作项必经阶段；不能因为没有任务就当作失败或缺失数据。
- 投产任务依赖“对象编号 + 申请投产点”定位；不要只按编号更新。
- `app_config`、`dict_item` 和权限矩阵属于运行时可配置的业务规则，修改它们的默认值需要考虑已有环境。
- 前端主题是八套可选预设，默认是“蔚蓝”，不是固定的单一翡翠绿主题。

# CLAUDE.md

RADAR · 日常需求研发流程管理平台（常规投产版本全生命周期流程管控平台）。以"投产版本（投产点）"为主线，把"需求分析 → 开发管理 → 测试管理(SIT/UAT/NFT/SEC) → 投产管理"全链路数字化。

## 技术栈

- **后端**：Node.js（≥22，推荐 25）+ Fastify + 原生 `node:sqlite`（同步 API，WAL，预编译参数化）+ JWT + RBAC 权限矩阵。
- **前端**：React 18 + Vite + Ant Design 5 + ECharts + zustand。翡翠绿主题（可配置，非蓝）、明暗双主题、全中文、PC/PAD/手机响应式。
- **部署**：Docker Compose（单容器，Fastify 同时供 API 与前端静态），挂载 `data/`(SQLite) 与 `attachments/`。

## 目录结构

- `server/src/` — `app.js`(装配) `server.js`(入口) `config.js`；`db/`(连接/迁移/seed) `plugins/auth.js`(JWT+RBAC) `lib/`(crud/query/audit/code-gen/deviation/status/attachment/excel) `modules/`(按业务域：auth/dict/systems/release-points/roles/users/settings/requirements/dev-tasks/test-tasks/release/attachments/audit/overview/dashboard)。
- `web/src/` — `api/` `stores/` `layout/` `router/` `components/`(DataTable/DictSelect/SystemSelect/PersonPicker/AttachmentField/HistoryDrawer/StatusBadge/ChainBar/CrudManager/Can 等) `pages/` `hooks/`。

## 本地运行

```bash
cd server && npm install && npm run dev   # 后端 :3000
cd web && npm install && npm run dev       # 前端 :5173（代理 /api）
# 登录：admin / admin2026
```
生产：`cd web && npm run build` 后 `cd server && npm start`。首次启动自动迁移 + 种子。

## 核心约定（迭代请遵循）

- 文件头写中文注释块（用途/作者 hengguan），函数级中文注释；分层 routes→service/lib→DAO。
- 简单配置表用 `lib/crud.js#registerCrud`；列表查询走 `lib/query.js#listQuery`（列白名单防注入）。
- 业务写操作经 `lib/audit.js` 留痕；编号 `lib/code-gen.js`；偏差率 `lib/deviation.js`；终态判定 `lib/status.js`。
- 权限：后端 `fastify.requirePerm(module, action)`（超管放行）；前端 `<Can>` + 路由守卫 + 菜单过滤，目录见 `lib/perm-catalog.js`。
- 统一响应 `{code,data,message}`；前端 `api/client.js` 自动解包、注入 JWT、401 跳登录。

## Design Context

设计上下文由 impeccable 维护，新增/改造界面前请先读：

- **[PRODUCT.md](PRODUCT.md)** — 战略：register=product；用户=农信/金科研发协同团队；品牌人格=精密·沉稳·数据导向（现代精致科技感）；5 条设计原则（状态先行 / 密度即效率 / 一致胜于惊喜 / 克制的精致 / 可追溯即可信）；无障碍=WCAG AA + 明暗对等 + 大小屏一致。
- **[DESIGN.md](DESIGN.md)** — 视觉系统：主色翡翠绿 `#0E9F6E`（非蓝）、语义状态色、系统字体栈、圆角 8px、偏平分层阴影、统一组件清单、Do's & Don'ts。

设计/迭代界面时用 impeccable 命令（需重启 Claude Code 后斜杠命令方可用）：`/impeccable craft|shape|critique|audit|polish|live <目标>`。

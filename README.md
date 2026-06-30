# RADAR · 日常需求研发流程管理

> **R**equirement **A**gile **D**elivery & **A**cceleration **R**esource
>
> 常规投产版本全生命周期流程管控平台 —— 以「**投产版本（投产点）**」为主线，把
> **需求分析 → 开发管理 → 测试管理（SIT / UAT / NFT / SEC）→ 投产管理** 全链路数字化，
> 替代依赖人工协调的信息孤岛，让每个阶段的任务状态实时透明、进度可视化、效能可度量、评审会签可追溯。

面向云南农信与建信金科的协同研发团队（农信/金科的业务、开发、测试、运维，以及管理员、超级管理员，支持「一人多角色」），
在桌面端为主、平板/手机为辅的环境下，围绕某个「投产窗口」协作推进研发流程。

---

## 目录

- [核心理念](#核心理念)
- [功能模块](#功能模块)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [目录结构](#目录结构)
- [数据模型](#数据模型)
- [权限模型（RBAC）](#权限模型rbac)
- [本地开发](#本地开发)
- [演示数据](#演示数据)
- [环境变量](#环境变量)
- [生产部署（Docker）](#生产部署docker)
- [开发约定](#开发约定)
- [设计系统](#设计系统)

---

## 核心理念

> 成功的样子：任何人打开「版本概览」就能在一屏内看清当前窗口所有需求走到了哪一步；填报者在弹窗内一次完成本阶段所有字段且留痕；管理者用仪表盘按任意维度演算交付效能。

平台贯彻 5 条设计原则（详见 [PRODUCT.md](PRODUCT.md) / [DESIGN.md](DESIGN.md)）：

1. **状态先行** —— 任何列表/卡片/弹窗最先传达「它在流程中处于什么状态」。
2. **密度即效率** —— 为重度日常使用者优化信息密度与操作路径，详情与填报在原位弹窗一次完成。
3. **一致胜于惊喜** —— 列表、弹窗、选择器、状态展示走统一封装组件，杜绝风格漂移。
4. **克制的精致** —— 质感来自精准的间距、对齐、层级与微反馈，而非装饰堆叠或重动效。
5. **可追溯即可信** —— 过程留痕、评审会签、附件、排期偏差率等「可证明」能力是产品信任的核心。

视觉：翡翠绿主色 `#0E9F6E`（非蓝）、明暗双主题对等、全中文、WCAG AA、PC/PAD/手机三档响应式。

---

## 功能模块

| 模块 | 路径 | 说明 |
| --- | --- | --- |
| **效能仪表盘** | `/dashboard` | 6 板块概览 + 用户自定义图表（柱/面积/饼/透视表），可按任意维度下钻演算交付效能（排期偏差率等） |
| **版本概览** | `/overview` | 以投产窗口为单位，一屏看清当前窗口所有需求在全链路中的位置；概览问题卡片；可发起投产申请 |
| **需求分析** | `/requirements` | 需求录入/维护，按系统拆分主责/协同改造/协同测试系统，关联投产点，导入/导出 |
| **开发管理** | `/dev` | 按系统承接开发任务，逐字段填报状态、计划/实际起止、附件；自动演算排期偏差率 |
| **测试管理** | `/test/{sit,uat,nft,sec}` | 应用组装测试 / 用户测试 / 非功能测试 / 安全测试，共用一张表按类型区分 |
| **问题管理** | `/issues` | 问题清单/明细，支持从外部 PAMS 问题管理系统同步 |
| **投产管理** | `/release/apply`、`/release` | 投产申请（多组交付制品）+ 投产审批（评审会签 + 投产登记） |
| **人员管理** | `/users` | 用户、角色、一人多角色维护 |
| **系统设置** | `/settings` | 字典、机构系统、投产点、角色与权限矩阵、平台配置、安全策略、外观主题 |

### 投产主线（核心链路）

```
需求登记 → 需求分析 → 需求完成
              │
              ├─► 开发承接 → 开发设计 → 开发完成        （开发任务，按系统拆分）
              │
              ├─► 测试承接 → 测试执行 → 测试完成        （SIT/UAT/NFT/SEC）
              │
              └─► 投产申请 → 评审会签（6 角色）→ 投产登记 → 已投产
```

- **评审会签**：由 6 个会签角色完成 —— 安全负责人 / 架构负责人 / 机构负责人 / 项目负责人 / 测试负责人 / 配置负责人；
  支持**电子手写签名**（含笔锋笔触、移动端落笔校正）。
- **排期偏差率**：`round((实际结束 - 计划结束) / max(计划结束 - 计划开始, 1天) × 100)`，正值延期、负值提前，信息不全返回 `null`（见 [`lib/deviation.js`](server/src/lib/deviation.js)）。
- **终态校验**：状态进入「终态」（字典 `process_status` 的 `extra.isTerminal`）时触发必填/附件等业务校验（见 [`lib/status.js`](server/src/lib/status.js)）。
- **过程留痕**：所有业务写操作经 [`lib/audit.js`](server/src/lib/audit.js) 记录字段级变更（修改人/栏位/前后值），详情页可查历史。
- **编号生成**：需求 `RC_窗口_序号`、开发 `RW_需求_序号`、测试 `类型_需求_序号` 等，由 [`lib/code-gen.js`](server/src/lib/code-gen.js) 统一生成。

---

## 技术栈

**后端**
- Node.js **≥ 22.5**（推荐 25）+ ESM
- [Fastify 5](https://fastify.dev/) —— 同时提供 `/api` 与前端静态资源
- 原生 [`node:sqlite`](https://nodejs.org/api/sqlite.html) —— 同步 API、WAL、预编译参数化查询，**零外部数据库依赖**
- `@fastify/jwt` 鉴权 + 自研 RBAC 权限矩阵
- 安全套件：`helmet` / `cors` / `rate-limit`（600 req/min/IP）/ `multipart` / `compress`
- `exceljs` 导入导出

**前端**
- React 18 + Vite 5
- Ant Design 5（翡翠绿主题、明暗双主题）
- ECharts（`echarts-for-react`）仪表盘
- zustand 状态管理、react-router-dom 6、axios、dayjs

**部署**
- Docker 多阶段构建（前端构建 + 后端运行），单容器、ARM/AMD 友好
- `data/`（SQLite）与 `attachments/`（附件）挂载持久化

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│  浏览器（PC / PAD / 手机）                                     │
│  React 18 + AntD 5 SPA                                        │
└───────────────┬─────────────────────────────────────────────┘
                │ HTTP（统一响应 {code,data,message}，JWT Bearer）
┌───────────────▼─────────────────────────────────────────────┐
│  Fastify（单进程，同时供 API 与静态资源）                       │
│                                                              │
│  app.js  装配：compress / helmet / cors / rate-limit /        │
│                multipart → auth 插件(JWT+RBAC) → 错误处理       │
│                                                              │
│  routes（/api/*）→ service / lib → DAO（db/index.js）          │
│   ├─ lib/crud.js        简单配置表 CRUD 注册器                 │
│   ├─ lib/query.js       列白名单分页查询（防注入）              │
│   ├─ lib/audit.js       字段级过程留痕                         │
│   ├─ lib/code-gen.js    业务编号生成                           │
│   ├─ lib/deviation.js   排期偏差率                            │
│   ├─ lib/status.js      终态判定                              │
│   ├─ lib/attachment.js  附件（上传文件 / 填写路径）            │
│   ├─ lib/excel.js       导入导出                              │
│   ├─ lib/signature.js   电子签名                              │
│   └─ lib/pams.js        外部 PAMS 问题同步                     │
└───────────────┬─────────────────────────────────────────────┘
                │ node:sqlite（WAL、同步、预编译）
        ┌───────▼────────┐   ┌──────────────────┐
        │ data/radar.db  │   │ attachments/     │
        └────────────────┘   └──────────────────┘
```

启动时（[`server.js`](server/src/server.js)）依次执行 **迁移 → 种子 → 启动**，全部幂等可重复执行。

---

## 目录结构

```
RADAR/
├─ server/                         # Fastify 后端（API + 静态资源）
│  └─ src/
│     ├─ server.js                 # 入口：迁移→种子→启动→优雅退出
│     ├─ app.js                    # 装配 Fastify（插件/错误处理/路由）
│     ├─ config.js                 # 环境变量集中配置
│     ├─ db/
│     │  ├─ index.js               # node:sqlite 连接与 get/all/run/tx 封装
│     │  ├─ migrate.js             # 迁移执行器（_migrations 表记录）
│     │  ├─ migrations/*.sql       # 0001_init ~ 0013_signature
│     │  ├─ seed.js                # 幂等种子（管理员/角色/权限/字典/系统）
│     │  └─ mock.js                # 演示数据生成（确定性随机，可复现）
│     ├─ lib/                      # 通用库（crud/query/audit/code-gen/...）
│     ├─ plugins/auth.js           # JWT + RBAC（requirePerm，超管放行）
│     └─ modules/                  # 按业务域分包，每个含 routes.js
│        ├─ auth dict systems release-points roles users settings
│        ├─ requirements issues dev-tasks test-tasks
│        ├─ release release-apply signatures
│        └─ attachments audit overview dashboard
│
├─ web/                            # React 前端
│  └─ src/
│     ├─ main.jsx app.jsx          # 入口与根组件
│     ├─ api/client.js             # axios 封装（解包/注入 JWT/401 跳登录）
│     ├─ stores/app.js             # zustand 全局状态
│     ├─ layout/MainLayout.jsx     # 响应式框架（侧栏/抽屉）
│     ├─ router/{menu,detailLinks} # 菜单与路由配置、详情联动
│     ├─ components/               # DataTable/DictSelect/StatusBadge/
│     │   ├─ Can ChainBar PersonPicker AttachmentField HistoryDrawer
│     │   ├─ SignaturePad PermissionMatrix CrudManager ...
│     │   ├─ dashboard/            # 图表编辑器/透视表/ECharts 选项
│     │   └─ editors/              # 需求/任务/投产/问题 详情编辑器
│     ├─ pages/                    # 各模块页面
│     ├─ hooks/useResponsive.js    # 断点钩子
│     └─ theme/presets.js          # 明暗主题预设
│
├─ data/                           # 【挂载】SQLite 数据库（radar.db）
├─ attachments/                    # 【挂载】上传附件
├─ Dockerfile                      # 多阶段构建
├─ docker-compose.yml              # 单服务编排（端口 3510→3000）
├─ .env.example                    # 环境变量示例
├─ CLAUDE.md / PRODUCT.md / DESIGN.md   # 产品与设计上下文
└─ README.md
```

---

## 数据模型

核心表（见 [`migrations/0001_init.sql`](server/src/db/migrations/0001_init.sql)）：

| 表 | 用途 |
| --- | --- |
| `app_config` | 平台配置键值（平台信息/编号规则/主题/安全策略） |
| `dict_item` | 通用字典（流程状态/版本类型/投产状态/需求类型/机构/板块…），流程状态在 `extra` 存 `{stage, isTerminal}` |
| `system` | 所属系统清单（系统编号/名称/机构/板块） |
| `role` / `permission` / `user` / `user_role` | RBAC：角色 × 模块 × 操作的权限矩阵，用户多对多角色 |
| `release_point` | 投产点（投产窗口），支持默认窗口与归档 |
| `requirement` | 需求（主责/协同改造/协同测试系统以 JSON 数组存储） |
| `dev_task` | 开发任务（按系统拆分，含偏差率） |
| `test_task` | 测试任务（SIT/UAT/NFT/SEC 共用，按 `test_type` 区分） |
| `release_task` / `release_system` / `release_signoff` | 投产任务、投产系统明细、评审会签 |
| `attachment` | 多态附件（`kind=file` 上传 / `kind=path` 填写路径） |
| `audit_log` | 字段级过程留痕（前/后值） |
| `saved_filter` | 用户保存的组合筛选条件 |
| `dashboard_chart` | 仪表盘自定义图表配置 |

> 迁移演进（0002~0013）：会签角色、仪表盘图表 v2、性能索引、安全加固、角色默认主题、问题管理、投产评审状态、投产申请与多组交付制品、电子签名等。

---

## 权限模型（RBAC）

- **后端**：`fastify.requirePerm(module, action)` 守卫（见 [`plugins/auth.js`](server/src/plugins/auth.js)），**超级管理员放行全部**。
- **前端**：`<Can>` 组件 + 路由守卫 + 菜单过滤三处协同，按钮级控制。
- 权限目录见 [`lib/perm-catalog.js`](server/src/lib/perm-catalog.js)：模块 × 操作（`view/create/edit/delete/import/export` 及功能级 `dev.intake`/`test.intake`/`release.signoff`/`release.register`/`issue.sync`/`settings.permission.edit` 等）。

**内置角色**（16 个，支持一人多角色）：
金科业务 / 农信业务 / 金科开发 / 农信开发 / 金科测试 / 农信测试 / 金科运维 / 农信运维 / **安全·架构·机构·项目·测试·配置负责人（6 个会签角色）** / 管理员 / 超级管理员（内置）。

**安全加固**：scrypt 加盐密码、登录失败锁定、密码复杂度与有效期校验、限流、统一错误结构（不泄露堆栈）。

---

## 本地开发

环境要求：**Node.js ≥ 22.5**（原生 `node:sqlite` 依赖），推荐 25。

```bash
# 1. 安装依赖
cd server && npm install
cd ../web && npm install

# 2. 启动后端（默认 http://localhost:3000，--watch 热重载）
cd server && npm run dev

# 3. 启动前端（默认 http://localhost:5173，已代理 /api 到后端）
cd web && npm run dev
```

或在仓库根目录一键并行启动前后端：

```bash
npm run dev          # concurrently 同时启动 server 与 web
```

首次启动后端会**自动迁移并写入种子数据**。

### 初始账号

首次初始化数据库前必须在 `.env` 中显式配置 `ADMIN_PASSWORD`。系统不会再提供代码内默认管理员密码。

| 登录名 | 密码来源 | 角色 |
| --- | --- | --- |
| `ADMIN_PHONE`（默认 `admin`） | `.env` 中的 `ADMIN_PASSWORD` | 超级管理员 |

### 构建生产产物

```bash
cd web && npm run build      # 产出 web/dist
cd ../server && npm start    # Fastify 同时提供 API 与 web/dist 静态资源
```

---

## 演示数据

需要一套可演示/可验证的全链路数据时，运行：

```bash
cd server && node src/db/mock.js
```

⚠️ **该脚本会清空除超级管理员外的全部业务与人员数据**，请谨慎执行。

生成内容（确定性随机，可复现对照）：20+ 用户、12 个投产点、120 个需求、200+ 开发任务、
SIT/UAT/NFT/SEC 测试任务、投产审批（覆盖全部评审状态）、投产申请、问题清单及关联关系与过程留痕；
编号、偏差率、终态附件均按平台规则生成，便于逐项验证。

---

## 环境变量

复制 [`.env.example`](.env.example) 为 `.env` 并按需修改：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `NODE_ENV` | — | `production` 时启用静态资源服务与 info 日志 |
| `JWT_SECRET` | — | **生产必须配置随机长字符串** |
| `JWT_EXPIRES_IN` | `12h` | JWT 有效期 |
| `DB_FILE` | `./data/radar.db` | SQLite 数据库路径 |
| `ATTACHMENT_DIR` | `./attachments` | 附件存储目录 |
| `WEB_DIST` | `./web/dist` | 前端构建产物目录 |
| `MAX_FILE_SIZE` | `52428800`（50MB） | 单附件最大字节数 |
| `UPLOAD_ALLOWED_EXTENSIONS` | 见 `.env.example` | 附件扩展名白名单 |
| `ADMIN_PHONE` / `ADMIN_PASSWORD` | `admin` / — | 初始超级管理员，密码必须显式配置 |
| `PAMS_BASE_URL` / `PAMS_API_KEY` / `PAMS_TIMEOUT` | — | 外部 PAMS 问题管理系统同步源 |

---

## 生产部署（Docker）

单容器同时提供 API 与前端静态页面，ARM/AMD 友好。

```bash
docker compose up -d --build
# 访问 http://<服务器IP>:3510
```

- [`docker-compose.yml`](docker-compose.yml) 将宿主机 **3510** 映射到容器 **3000**。
- `./data` 与 `./attachments` 挂载到宿主机，**容器删除后数据与附件不丢失**。
- 生产环境务必修改 compose 中的 `JWT_SECRET` 与 `ADMIN_PASSWORD`。
- 容器启动自动执行迁移 + 种子。

---

## 开发约定（迭代请遵循）

- 文件头写中文注释块（用途/作者 `hengguan`），函数级中文注释；分层 `routes → service/lib → DAO`。
- 简单配置表用 [`lib/crud.js`](server/src/lib/crud.js)`#registerCrud`；列表查询走 [`lib/query.js`](server/src/lib/query.js)`#listQuery`（列白名单防注入）。
- 业务写操作经 [`lib/audit.js`](server/src/lib/audit.js) 留痕；编号 [`lib/code-gen.js`](server/src/lib/code-gen.js)；偏差率 [`lib/deviation.js`](server/src/lib/deviation.js)；终态判定 [`lib/status.js`](server/src/lib/status.js)。
- 权限：后端 `requirePerm(module, action)`（超管放行）；前端 `<Can>` + 路由守卫 + 菜单过滤。
- 统一响应 `{code, data, message}`；前端 [`api/client.js`](web/src/api/client.js) 自动解包、注入 JWT、401 跳登录。
- 复用统一封装组件（DataTable / DictSelect / SystemSelect / PersonPicker / AttachmentField / HistoryDrawer / StatusBadge / ChainBar / CrudManager / Can），杜绝风格漂移。

---

## 设计系统

- **[PRODUCT.md](PRODUCT.md)** —— 战略、用户角色、品牌人格（精密·沉稳·数据导向）、5 条设计原则、无障碍（WCAG AA + 明暗对等 + 大小屏一致）。
- **[DESIGN.md](DESIGN.md)** —— 视觉系统：主色翡翠绿 `#0E9F6E`、语义状态色、系统字体栈、圆角 8px、偏平分层阴影、组件清单、Do's & Don'ts。
- **[CLAUDE.md](CLAUDE.md)** —— 给协作 AI 的项目约定速览。

---

## 作者

**hengguan**

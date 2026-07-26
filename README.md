# RADAR

RADAR（Requirement Agile Delivery & Acceleration Resource）是面向日常需求、工单、开发、测试和投产协同的流程管理平台。

项目采用 Node.js + Fastify + React 的模块化单体架构：保持一个可独立部署的应用，同时以模块边界、公开契约、任务范围和 CI 门禁支持多人持续共创。SQLite 与 TDSQL/MySQL 8 都是正式支持的数据库目标。

## 文档导航

| 需要了解什么 | 权威文档 |
| --- | --- |
| 产品边界、流程和验收口径 | [PRODUCT.md](PRODUCT.md) |
| 当前设计系统和界面约束 | [DESIGN.md](DESIGN.md) |
| 开发、AI 与数据边界规约 | [docs/governance/README.md](docs/governance/README.md) |
| 模块职责、Owner 和依赖边界 | [governance/modules.yaml](governance/modules.yaml) 与 [模块说明](docs/architecture/MODULES.md) |
| 架构决策 | [docs/architecture/decisions](docs/architecture/decisions) |
| 整体建设方案 | [RADAR 2.0 方案](docs/planning/RADAR-2.0-SOLUTION.md) |
| 需求、任务范围和 AI 协作入口 | [docs/requirements](docs/requirements) |
| 数据库迁移、备份与恢复 | [MIGRATION.md](MIGRATION.md) |
| 用户和业务操作手册 | [docs/manuals](docs/manuals) |

贡献前请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md) 和根目录 [AGENTS.md](AGENTS.md)。

## 核心能力

- 需求与工单分别管理，保留独立编号、字段、写入边界和可配置编号模板。
- 覆盖需求/工单分析、开发、SIT/UAT/NFT/SEC 测试、投产申请、投产审批与会签。
- 支持投产窗口、版本概览、效能仪表盘、图表钻取、过程审计、附件与电子签名。
- 支持 PAMS 问题快照及受控同步；外网辅助入口当前不实施。
- 支持角色权限、数据范围、实体级授权和操作审计。

## 架构概览

```text
浏览器
  React + Vite + Ant Design
        │ HTTPS / HTTP，JWT，统一响应 { code, data, message }
        ▼
RADAR 单体服务（Fastify）
  platform/ 认证、持久化、附件、审计、导入导出、运行时、通知
  shared/   稳定 DTO 与无业务语义工具
  modules/  按领域拆分的业务模块及公开契约
        │
        ├── SQLite（文件库，WAL）
        └── TDSQL / MySQL 8（连接池）
```

生产环境中，Fastify 同时提供 `/api` 和已构建的前端静态资源；也可在前置 Nginx 中终止 TLS 并直接缓存静态资源。

### 模块分层

模块边界以 [`governance/modules.yaml`](governance/modules.yaml) 为唯一机器可读事实源。核心分层如下：

| 层级 | 职责 |
| --- | --- |
| `server/src/platform/` | 认证、持久化、附件、审计、导入导出、运行时和通知等横切能力 |
| `server/src/shared/` | 稳定 DTO、契约和无业务语义的纯工具 |
| `server/src/modules/` | 领域业务模块；公开入口为模块 `index.js` 和 `contracts/` |
| `web/src/modules/` | 前端领域页面与 API 适配层 |
| `web/src/pages/` | 路由页面与兼容入口 |

业务模块包括：身份与权限、参考数据、流程配置、需求、工单、交付、投产申请、投产审批、问题和报表。模块之间只能通过已登记的公开契约协作，不能直接依赖其他模块内部实现或写入其表。

### 数据库兼容

SQLite 与 TDSQL/MySQL 8 都是正式兼容目标：

- 业务层通过 `platform/persistence` 使用统一的 `get`、`all`、`run`、`tx` 接口。
- 每项 schema 变更必须追加 SQLite 与 TDSQL 两份等价迁移，历史迁移不得改写。
- `release_apply.ref_codes` 保留 JSON 兼容字段，同时维护 `release_apply_reference` 索引关联表，供投产审批和跨模块读取使用。
- `code_sequence` 按“编号规则键 + 固定前缀”保存下一可用序号。首次使用新序列时从历史业务编号最大值接续；SQLite 对领号临界区串行，TDSQL/MySQL 8 使用数据库事务保障唯一递增。
- SQLite 使用 WAL、语句缓存、忙等待和安全的同步配置；高并发写入或大数据量生产环境建议使用 TDSQL。

迁移、数据搬迁、备份与恢复请参阅 [MIGRATION.md](MIGRATION.md)。

### 编号规则设置

系统设置 → 编号规则可分别维护需求、工单、开发任务、SIT/UAT/NFT/SEC 测试任务和投产申请的模板。保存后，下一次生成会即时读取新模板，不需要重启服务。

| 业务对象 | 配置键 | 默认模板 | 可用占位符 |
| --- | --- | --- | --- |
| 需求 | `code.requirement` | `RC_{投产窗口}_{序号}` | `{投产窗口}`、`{序号}` |
| 工单 | `code.ticket` | `TK_{投产窗口}_{序号}` | `{投产窗口}`、`{序号}` |
| 开发任务 | `code.dev` | `RW_{需求编号}_{序号}` | `{需求编号}`、`{序号}` |
| 测试任务 | `code.test.SIT/UAT/NFT/SEC` | `SIT_{需求编号}_{序号}` 等 | `{需求编号}`、`{序号}` |
| 投产申请 | `code.release_apply` | `{版本年月}-10bg{序号}` | `{版本年月}`、`{序号}` |

`{序号}` 保持至少三位补零。修改模板导致固定前缀变化时，会为新前缀建立独立序列并从同前缀历史编号接续；恢复旧模板时会继续旧前缀已有序列。编号序列只增不回收，因此创建失败或撤销可能留下编号空档，这是并发场景下避免重复编号的预期行为。

## 目录结构

```text
RADAR/
├── AGENTS.md                       # AI 与开发人员的项目级入口规则
├── CONTRIBUTING.md                 # 开发、提交、PR 与验收入口
├── README.md                       # 本文件：工程入口与运行说明
├── PRODUCT.md                      # 产品边界、流程与验收口径
├── DESIGN.md                       # 主题、组件、响应式与无障碍约束
├── COLLABORATION.md                # 多人协作补充说明
├── AI-GUIDE.md                     # 开发助手项目上下文
├── MIGRATION.md                    # SQLite/TDSQL 数据迁移与恢复手册
├── package.json                    # 根目录并行开发启动脚本
├── Dockerfile                      # 多阶段构建：Vite 构建 + Fastify 运行镜像
├── docker-compose.yml              # 单服务部署、端口和卷挂载编排
├── docker-entrypoint.sh            # 持久卷属主初始化并以 radar 用户启动
├── .env.example                    # 全部运行、数据库、部署环境变量模板
├── governance/
│   ├── modules.yaml                # 模块、目录、Owner、表和公开契约唯一事实源
│   ├── migration-parity-exceptions.json # 双数据库迁移历史例外清单
│   └── *-baseline.json             # 依赖、许可证、边界等 CI 基线
├── docs/
│   ├── governance/                 # 项目研发、AI Coding、GitHub 协作规约
│   ├── architecture/
│   │   ├── MODULES.md              # 面向读者的模块职责说明
│   │   └── decisions/              # ADR 架构决策记录
│   ├── planning/                   # RADAR 2.0 整体建设方案
│   ├── requirements/
│   │   ├── TEMPLATE.md             # 需求与 AI 任务范围模板
│   │   └── REQ-*/                  # 已受理需求及其 ai-task-scope.yaml
│   └── manuals/                    # 用户、投产申请、投产审批、部署等操作手册
├── scripts/                        # CI 可复用的治理、边界、迁移、依赖检查
├── server/
│   ├── AGENTS.md                   # 后端通用规则
│   ├── package.json                # 后端启动、测试、数据迁移脚本
│   ├── scripts/
│   │   ├── sqlite-to-tdsql.js      # SQLite ↔ TDSQL 数据搬迁
│   │   ├── tdsql-dump.js           # TDSQL 原生逻辑备份
│   │   └── tdsql-restore.js        # TDSQL 原生恢复
│   ├── templates/                  # 投产、开发等文档模板资产
│   ├── test/                       # node:test 单元、API 与权限回归
│   └── src/
│       ├── server.js                # 启动入口：迁移、种子、Fastify 监听、优雅退出
│       ├── app.js                   # Fastify 插件、鉴权、错误处理、静态资源装配
│       ├── config.js                # 运行期环境变量归一化
│       ├── db/
│       │   ├── index.js             # SQLite/TDSQL 统一数据库访问接口
│       │   ├── migrate.js           # 按版本执行数据库迁移
│       │   ├── seed.js              # 内置默认数据及种子版本控制
│       │   ├── providers/           # sqlite.js、tdsql.js Provider
│       │   ├── dialects/            # SQLite 与 MySQL 方言差异封装
│       │   └── migrations/          # SQLite 迁移及 tdsql/ 等价迁移（含编号序列表）
│       ├── platform/
│       │   ├── auth/                # index.js 公开认证、密码和验证码能力
│       │   ├── persistence/         # index.js、list-query.js、code-sequence.js
│       │   ├── attachments/         # 附件、签名与存储访问控制
│       │   ├── audit/               # 统一操作审计能力
│       │   ├── import-export/       # Excel、导入导出和简单配置 CRUD
│       │   ├── runtime/             # HTTP 响应、JSON、日志、环境变量和清洗工具
│       │   └── notifications/       # 通知能力预留入口
│       ├── shared/
│       │   ├── contracts/           # 跨模块稳定 DTO 与契约
│       │   ├── utils/               # 无业务归属的纯函数工具（如编号模板）
│       │   ├── application/         # 跨领域但不归属具体模块的业务编排辅助
│       │   ├── authorization/       # 实体级授权工具
│       │   ├── evidence/            # 证据与审计辅助能力
│       │   └── workflow/            # 无业务归属的流程辅助能力
│       ├── modules/
│       │   ├── AGENTS.md             # 后端模块目录通用约束
│       │   ├── requirements/        # application/numbering.js、公开契约和 HTTP 入口
│       │   ├── tickets/             # application/numbering.js、公开契约和 HTTP 入口
│       │   ├── delivery/            # application/numbering.js、偏差、影响与覆盖分析
│       │   ├── dev-tasks/           # 开发任务 HTTP 兼容入口
│       │   ├── test-tasks/          # SIT/UAT/NFT/SEC 任务 HTTP 兼容入口
│       │   ├── analysis/            # 影响与覆盖分析 HTTP 兼容入口
│       │   ├── release-apply/       # 投产申请及关联制品
│       │   ├── release/             # 投产审批、会签与投产材料
│       │   ├── issues/              # PAMS 问题快照与同步
│       │   ├── evidence/            # 证据与相关业务编排兼容入口
│       │   ├── reporting/           # 跨模块只读投影、仪表盘与概览编排
│       │   ├── dashboard/           # 仪表盘 HTTP 兼容入口
│       │   ├── overview/            # 版本概览 HTTP 兼容入口
│       │   ├── reference-data/      # 字典、系统、投产点和平台配置编排
│       │   ├── dict/                # 字典 HTTP 兼容入口
│       │   ├── systems/             # 系统 HTTP 兼容入口
│       │   ├── settings/            # 平台配置 HTTP 兼容入口
│       │   ├── release-points/      # 投产点 HTTP 兼容入口
│       │   ├── identity-access/     # 用户、角色、权限编排与公开契约
│       │   ├── users/               # 用户 HTTP 兼容入口
│       │   ├── roles/               # 角色与权限 HTTP 兼容入口
│       │   ├── process-configuration/ # 状态、动态字段、交付物与扩展筛选契约
│       │   ├── stage-content/       # 流程配置 HTTP 兼容入口
│       │   ├── auth/                # 登录与会话 HTTP 适配入口
│       │   ├── attachments/         # 附件 HTTP 适配入口
│       │   ├── audit/               # 审计查询 HTTP 适配入口
│       │   └── signatures/          # 电子签名 HTTP 适配入口
│       └── plugins/                 # Fastify 插件（鉴权等）
└── web/
    ├── AGENTS.md                   # 前端通用规则
    ├── package.json                # Vite 开发、构建与预览脚本
    ├── vite.config.js              # 开发代理、构建输出和 chunk 策略
    ├── index.html                  # Vite HTML 入口
    ├── public/
    │   ├── logo/                   # RADAR Logo
    │   └── fonts/                  # 本地字体资源
    └── src/
        ├── main.jsx / app.jsx       # React 入口与应用装配
        ├── api/ / platform/         # Axios 客户端与平台 API 适配
        ├── router/                  # 菜单、路由、首页和详情链接映射
        ├── stores/                  # 全局状态（用户、权限、投产窗口、主题）
        ├── layout/                  # 主布局与导航框架
        ├── pages/                   # 路由页面及兼容页面入口
        ├── modules/
        │   ├── requirements/       # 需求页面与 API 适配
        │   ├── tickets/            # 工单页面与 API 适配
        │   ├── delivery/           # 开发、测试页面与 API 适配
        │   ├── release/            # 投产申请、审批页面与 API 适配
        │   ├── reporting/          # 仪表盘、概览 API 适配
        │   ├── issues/             # 问题页面与 API 适配
        │   ├── settings/           # 系统设置页面与 API 适配
        │   └── identity-access/    # 用户与权限页面
        ├── components/
        │   ├── dashboard/          # 图表编辑、渲染和透视表
        │   ├── editors/            # 需求、工单、任务、投产编辑器
        │   └── *.jsx               # 通用表格、筛选、附件、状态、权限组件
        ├── hooks/                  # 动态字段、默认状态、响应式等 Hook
        ├── config/ / theme/        # 页面配置和主题预设
        ├── shared/                 # 前端共享 API 与工具
        ├── utils/                  # 下载、上传、时间等工具
        └── styles.css              # 全局样式
```

运行时生成的数据默认不进入 Git：`data/`、`attachments/` 和 `RADARdata/`。

## 快速开始

### 环境要求

- Node.js 22.5 或更高版本
- npm（前后端依赖各自管理）
- 可选：Docker Compose
- 可选：可访问的 TDSQL/MySQL 8 实例

### 安装依赖

```bash
npm ci --prefix server
npm ci --prefix web
```

### 配置环境变量

```bash
cp .env.example .env
```

本地开发至少应配置：

```env
NODE_ENV=development
DB_CLIENT=sqlite
DB_FILE=./data/radar.db
JWT_SECRET=replace-with-a-random-secret
ADMIN_PASSWORD=replace-with-a-strong-password
```

生产环境必须显式设置 `JWT_SECRET` 和 `ADMIN_PASSWORD`，不得使用示例值。

### 启动开发环境

分别启动：

```bash
npm run dev --prefix server
npm run dev --prefix web
```

或者从根目录一次启动：

```bash
npm run dev
```

默认地址：

| 服务 | 地址 |
| --- | --- |
| 后端 API / 健康检查 | `http://localhost:3000/api/health` |
| 前端开发服务 | `http://localhost:5173` |

后端启动时会执行未应用的迁移，并在首次初始化或种子版本升级时写入内置默认配置。常规重启会跳过重复种子校准。

## 测试与质量检查

常用本地检查：

```bash
# 后端单元测试；默认不启动 API 集成测试
npm test --prefix server

# SQLite 临时库上的 API、权限和静态资源回归
npm run test:api --prefix server
npm run test:rbac --prefix server

# 前端生产构建
npm run build --prefix web

# SQLite/TDSQL 迁移配对与 MySQL 8 静态兼容检查
node scripts/check-migration-parity.mjs
node scripts/check-mysql8-migrations.mjs

# 治理、模块边界、依赖和许可证检查
node scripts/check-governance.mjs
node scripts/check-module-boundaries.mjs
node scripts/check-dependency-audit.mjs
node scripts/check-licenses.mjs
```

CI 会结合任务范围、模块边界、迁移配对、构建、测试和安全基线执行门禁。具体规则以 [正式研发规约](docs/governance/README.md) 为准。

## Docker 部署

### 使用 Compose

```bash
cp .env.example .env
# 编辑 .env，至少替换 JWT_SECRET 与 ADMIN_PASSWORD
docker compose up -d --build
docker compose logs -f radar
```

默认将宿主机 `${RADAR_HTTP_PORT:-3510}` 映射到容器内 `${PORT:-3000}`。数据库和附件目录通过以下变量持久化：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `RADAR_DATA_DIR` | `./RADARdata/data` | SQLite 数据目录 |
| `RADAR_ATTACHMENTS_DIR` | `./RADARdata/attachments` | 附件目录 |
| `RADAR_IMAGE` | `radar:latest` | Compose 使用的镜像名 |
| `RADAR_CONTAINER_NAME` | `radar` | 容器名称 |

容器入口会以 root 仅修复必要的目录和 SQLite 运行文件属主，然后立即降权为 `radar` 用户运行。只有历史卷确实由 root 递归创建且无法写入时，才临时设置：

```env
RADAR_REPAIR_VOLUME_OWNERSHIP=1
```

成功启动后必须改回 `0`；常规启动不会递归扫描附件目录。

### 反向代理与缓存

公网部署建议由 Nginx 或等价代理负责 TLS。前端构建产物中的带 hash 文件可长期缓存，`index.html` 必须保持回源校验。若使用 Nginx，建议直接服务 `/assets/`，开启 gzip 或 Brotli、HTTP/2、TLS 会话复用和到应用容器的 keepalive，以降低首屏握手及静态文件等待时间。

## 环境变量

完整清单和中文说明见 [.env.example](.env.example)。常用配置如下：

### 基础与安全

| 变量 | 说明 |
| --- | --- |
| `NODE_ENV` | `development` 或 `production` |
| `HOST` / `PORT` | 后端监听地址与端口 |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | JWT 签名密钥和有效期 |
| `ADMIN_PHONE` / `ADMIN_NAME` / `ADMIN_PASSWORD` | 首次初始化超级管理员 |
| `CSRF_HEADER_VALUE` | 写操作自定义请求头约定 |
| `CORS_ORIGINS` | 允许的前端来源，逗号分隔 |

### 数据库与存储

| 变量 | 说明 |
| --- | --- |
| `DB_CLIENT` | `sqlite`、`tdsql` 或兼容别名 `mysql` |
| `DB_FILE` | SQLite 文件路径 |
| `TDSQL_HOST`、`TDSQL_PORT`、`TDSQL_DATABASE` | TDSQL/MySQL 8 目标库地址与名称 |
| `TDSQL_USER`、`TDSQL_PASSWORD`、`TDSQL_SSL` | 数据库连接认证与 TLS |
| `TDSQL_CONNECTION_LIMIT` | TDSQL 连接池上限 |
| `ATTACHMENT_DIR` | 附件存储目录 |
| `WEB_DIST` | 前端生产构建产物目录 |

### 性能与观测

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SLOW_REQUEST_MS` | `1000` | 慢请求日志阈值（毫秒） |
| `SLOW_QUERY_MS` | `500` | 慢 SQL 日志阈值（毫秒） |
| `REQUEST_LOGGING` | `false` | 是否输出每个 HTTP 请求日志 |
| `COMPRESSION_THRESHOLD` | `1024` | 响应压缩最小字节数 |
| `VITE_CHUNK_SIZE_WARNING_LIMIT` | `1500` | 前端构建 chunk 告警阈值（KB） |

慢请求和慢 SQL 日志只记录路径、操作和耗时，不记录请求参数、Token 或绑定参数。

## SQLite 与 TDSQL 使用建议

### SQLite

SQLite 完整支持本地、测试和正式单机部署。适合数据量可控、写入并发较低的场景。请持久化数据库目录，并将数据库文件及其 `-wal`、`-shm` 文件置于同一可写目录。

### TDSQL/MySQL 8

多人并发写入、持续增长的数据量或需要高可用时，建议使用 TDSQL/MySQL 8：

```env
DB_CLIENT=tdsql
TDSQL_HOST=your-host
TDSQL_PORT=3306
TDSQL_DATABASE=radar
TDSQL_USER=radar_app
TDSQL_PASSWORD=replace-with-a-secret
```

切换或搬迁前，先备份数据库和附件；按 [MIGRATION.md](MIGRATION.md) 执行 SQLite ↔ TDSQL 数据迁移，并在目标环境验证 `_migrations`、健康检查、登录、创建/更新和附件访问。

## 性能运行要点

- 仪表盘图表、编辑器和 ECharts 采用按需加载；版本概览默认分页加载卡片。
- 投产申请关联编号使用索引读模型，投产审批列表批量读取关联数据，避免逐行 N+1 查询。
- 观察 `SLOW_REQUEST_MS` 与 `SLOW_QUERY_MS` 日志，优先优化有证据的热点。
- 数据规模和并发增长后，应建立包含 P95 接口耗时、导出耗时、数据库锁等待和内存占用的基准测试。
- 公网首屏慢时先检查 TLS 握手、代理缓存、静态资源压缩和网络带宽，不要仅从数据库角度判断。

## 多人协作

1. 从 [需求模板](docs/requirements/TEMPLATE.md) 创建需求目录与 `ai-task-scope.yaml`。
2. 阅读根目录及目标模块的 `AGENTS.md`，并查看 [`governance/modules.yaml`](governance/modules.yaml)。
3. 在独立工作区和短生命周期分支完成一个细粒度需求；当前单维护人例外以对应任务范围为准。
4. 跨模块仅依赖公开契约；修改 platform、shared/contracts、迁移、权限、审计或附件能力时，必须完成额外审批与回归。
5. PR 中说明需求编号、模块、契约、数据库、权限、审计、验证和回退方式。

完整要求见 [CONTRIBUTING.md](CONTRIBUTING.md) 和 [GitHub 协作规约](docs/governance/GITHUB-RULES.md)。

## 许可证与安全

请勿提交 `.env`、密码、Token、生产数据库、真实附件或未脱敏日志。依赖、许可证和安全基线由仓库脚本与 CI 检查；发现问题请按项目规约处理，不要通过关闭检查绕过风险。

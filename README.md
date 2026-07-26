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

- 需求与工单分别管理，保留独立编号、字段和写入边界。
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
  platform/ 认证、持久化、附件、审计、运行时、通知
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
| `server/src/platform/` | 认证、持久化、附件、审计、运行时和通知等横切能力 |
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
- SQLite 使用 WAL、语句缓存、忙等待和安全的同步配置；高并发写入或大数据量生产环境建议使用 TDSQL。

迁移、数据搬迁、备份与恢复请参阅 [MIGRATION.md](MIGRATION.md)。

## 目录结构

```text
RADAR/
├── AGENTS.md                       # AI 与开发入口规则
├── CONTRIBUTING.md                 # 贡献与提交流程
├── README.md                       # 本文件：项目工程入口
├── PRODUCT.md / DESIGN.md          # 产品与设计说明
├── docker-compose.yml              # 单服务 Docker 部署
├── Dockerfile                      # 多阶段构建镜像
├── docker-entrypoint.sh            # 卷权限初始化并降权启动
├── .env.example                    # 环境变量模板
├── governance/                     # 模块边界、Owner 和治理基线
├── docs/
│   ├── governance/                 # 正式研发、AI、GitHub 规约
│   ├── architecture/               # 模块说明与 ADR
│   ├── planning/                   # 整体建设方案
│   ├── requirements/               # 需求模板与任务范围
│   └── manuals/                    # 用户和部署操作手册
├── scripts/                        # CI 本地复用的治理检查
├── server/
│   ├── scripts/                    # SQLite/TDSQL 搬迁、备份和恢复工具
│   ├── test/                       # node:test 自动化回归
│   └── src/
│       ├── app.js / server.js       # 应用装配与启动入口
│       ├── config.js                # 运行配置
│       ├── db/                      # Provider、方言、迁移和种子
│       ├── platform/                # 横切平台能力
│       ├── shared/                  # 公共契约与工具
│       └── modules/                 # 领域模块
└── web/
    ├── public/                     # Logo、字体等静态资源
    └── src/                        # React 页面、模块、组件、路由与状态
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

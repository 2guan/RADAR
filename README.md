# RADAR

RADAR（Requirement Agile Delivery & Acceleration Resource）是面向日常需求、工单、开发、测试和投产协同的流程管理平台。

项目采用 Node.js、Fastify、React 的模块化单体架构：以一个可独立部署的应用交付，同时以明确的模块边界、公开契约、任务范围和 CI 门禁支持多人持续维护。SQLite 与 TDSQL/MySQL 8 均为支持的数据库目标。

## 文档导航

| 需要了解什么 | 唯一来源 |
| --- | --- |
| 产品边界、流程和验收口径 | [PRODUCT.md](PRODUCT.md) |
| 设计系统和界面约束 | [DESIGN.md](DESIGN.md) |
| 架构、数据、接口与质量规约 | [项目研发规约](docs/governance/PROJECT-RULES.md) |
| AI 任务、数据与范围边界 | [AI Coding 规约](docs/governance/AI-CODING-RULES.md) |
| 分支、PR、审批和 CI | [GitHub 协作规约](docs/governance/GITHUB-RULES.md) |
| 模块职责、Owner、依赖和公开契约 | [governance/modules.yaml](governance/modules.yaml) 与 [模块说明](docs/architecture/MODULES.md) |
| 架构决策 | [ADR](docs/architecture/decisions) |
| 需求与任务范围 | [docs/requirements](docs/requirements) |
| 数据迁移、备份和恢复 | [MIGRATION.md](MIGRATION.md) |
| 用户与业务操作 | [docs/manuals](docs/manuals) |

AI 或自动化工具修改代码前，先读取 [AGENTS.md](AGENTS.md)。它提供从需求、模块到适用规约和目录级指令的定位顺序；具体规则只在上表的权威文档中定义。

## 核心能力

- 需求与工单分别管理，保留独立编号、字段和写入边界。
- 覆盖需求/工单分析、开发、SIT/UAT/NFT/SEC 测试、投产申请、投产审批与会签。
- 支持投产窗口、版本概览、效能仪表盘、图表钻取、过程审计、附件与电子签名。
- 支持 PAMS 问题快照及受控同步；当前不提供外网辅助入口。
- 支持角色权限、数据范围、实体级授权和操作审计。

## 架构概览

```text
浏览器
  React + Vite + Ant Design
        │ HTTPS / HTTP，JWT，统一响应 { code, data, message }
        ▼
RADAR 单体服务（Fastify）
  platform/ 认证、持久化、附件、审计、导入导出、运行时、通知
  shared/   稳定 DTO、共享 UI 与无数据所有权的协作能力
  modules/  按领域拆分的业务模块及公开契约
        │
        ├── SQLite（文件库，WAL）
        └── TDSQL / MySQL 8（连接池）
```

生产环境中，Fastify 同时提供 `/api` 和已构建的前端静态资源；也可在前置 Nginx 中终止 TLS 并直接缓存静态资源。

前后端的十个一级业务模块为 `requirements`、`tickets`、`development`、`testing`、`release`、`overview`、`dashboard`、`issues`、`settings`、`identity-access`。模块归属和可调用的公开契约以 [governance/modules.yaml](governance/modules.yaml) 为准；面向人的职责说明见 [模块说明](docs/architecture/MODULES.md)。

## 目录结构

以下区块由 `node scripts/check-readme-tree.mjs --write` 生成；CI 会验证其与当前目录和模块清单一致。

<!-- repository-tree:start -->
```text
RADAR/
├── .github/                         # CI、CODEOWNERS、Issue 与 PR 模板
├── AGENTS.md                        # AI 开发入口：资料定位与读取顺序
├── DESIGN.md                        # 设计系统与交互约束
├── Dockerfile                       # 生产镜像构建
├── MIGRATION.md                     # 数据迁移、备份与恢复操作手册
├── PRODUCT.md                       # 产品边界、流程与验收口径
├── README.md                        # 本文件：工程入口与运行说明
├── docker-compose.yml               # 单服务部署、端口和卷挂载编排
├── docs/
│   ├── architecture/                # 模块说明、契约说明与 ADR
│   ├── governance/                  # 项目、AI、GitHub 三类正式规约
│   ├── manuals/                     # 用户、部署与业务操作手册
│   ├── planning/                    # 建设方案
│   └── requirements/                # 需求、任务范围模板与已受理需求
├── governance/
│   └── modules.yaml                 # 模块、Owner、依赖与公开契约机器事实源
├── scripts/                         # CI 可复用的治理、边界、迁移与文档检查
├── server/
│   ├── AGENTS.md                    # 后端目录级实现约定
│   ├── scripts/                     # 数据搬迁、备份与恢复工具
│   ├── templates/                   # 文档模板资产
│   ├── test/                        # 单元、API 与权限回归测试
│   └── src/
│       ├── bootstrap/               # 默认种子数据与装配
│       ├── platform/                # 认证、持久化、附件、审计、运行时等基础设施
│       ├── shared/                  # DTO、纯工具与流程协作能力
│       └── modules/                 # requirements、tickets、development、testing、release、overview、dashboard、issues、settings、identity-access
└── web/
    ├── AGENTS.md                    # 前端目录级实现约定
    ├── public/                      # Logo、字体等静态资源
    └── src/
        ├── platform/                # HTTP、路由、布局、状态、主题、附件与审计
        ├── shared/                  # 共享 UI、流程展示与工具
        └── modules/                 # requirements、tickets、development、testing、release、overview、dashboard、issues、settings、identity-access
```
<!-- repository-tree:end -->

运行时生成的数据默认不进入 Git：`data/`、`attachments/` 和 `RADARdata/`。

## 快速开始

### 环境要求

- Node.js 22.5 或更高版本
- npm（前后端依赖分别管理）
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

生产环境须显式配置安全凭据，不得使用示例值。完整变量说明见 [.env.example](.env.example)。

### 启动开发环境

分别启动：

```bash
npm run dev --prefix server
npm run dev --prefix web
```

或从根目录一次启动：

```bash
npm run dev
```

| 服务 | 地址 |
| --- | --- |
| 后端 API / 健康检查 | `http://localhost:3000/api/health` |
| 前端开发服务 | `http://localhost:5173` |

后端启动时会执行未应用迁移，并在首次初始化或种子版本升级时写入内置默认配置。

## 测试与质量检查

```bash
# 后端单元测试；默认不启动 API 集成测试
npm test --prefix server

# SQLite 临时库上的 API、权限和静态资源回归
npm run test:api --prefix server
npm run test:rbac --prefix server

# 前端生产构建
npm run build --prefix web

# 迁移、模块边界、文档树与治理检查
node scripts/check-migration-parity.mjs
node scripts/check-mysql8-migrations.mjs
node scripts/check-module-boundaries.mjs
node scripts/check-readme-tree.mjs
node scripts/check-governance.mjs
```

CI 同时执行依赖、许可证、密钥和容器配置扫描。完整门禁以 [GitHub 协作规约](docs/governance/GITHUB-RULES.md) 为准。

## 数据库与迁移

SQLite 适合本地、测试和低并发单机部署；多人并发写入、持续增长的数据量或高可用场景建议使用 TDSQL/MySQL 8。应用在两种数据库之间保持兼容，迁移、备份、恢复以及目标环境验证请按照 [MIGRATION.md](MIGRATION.md) 执行。

## Docker 部署

```bash
cp .env.example .env
# 编辑 .env，配置生产环境所需的安全凭据
docker compose up -d --build
docker compose logs -f radar
```

默认将宿主机 `${RADAR_HTTP_PORT:-3510}` 映射到容器内 `${PORT:-3000}`。持久化目录、镜像名称和容器名称均可在 `docker-compose.yml` 中配置。反向代理可负责 TLS 终止和静态资源缓存。

## AI 与多人开发

AI 工具以根目录 [AGENTS.md](AGENTS.md) 为自动发现入口：先定位需求和任务范围，再从模块清单判断边界，随后读取适用的正式规约与最近目录的补充指令。开发、分支与 PR 流程以 [GitHub 协作规约](docs/governance/GITHUB-RULES.md) 为准。

## 许可证与安全

请勿提交环境文件、密码、Token、生产数据库、真实附件或未脱敏日志。依赖、许可证和安全基线由仓库脚本与 CI 检查。

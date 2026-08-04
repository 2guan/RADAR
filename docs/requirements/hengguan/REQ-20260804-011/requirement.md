---
document_type: ai_coding_requirement
template_version: "1.0"
requirement_id: "REQ-20260804-011"
requirement_ref: "hengguan/REQ-20260804-011"
title: "离线单端口部署网页手册"
status: "ready"
priority: "P1"
requester: "hengguan"
developer: "hengguan"
module: "governance"
module_owner: "hengguan"
contains_confidential_information: false
external_access_required: false
internet_ai_coding_allowed: true
last_updated: "2026-08-04"
---

# [hengguan/REQ-20260804-011] 离线单端口部署网页手册

## 0. AI 执行约束

- 本次仅交付可离线打开的部署网页手册，不连接、修改或启动任何远端服务器、容器、数据库或网络设备。
- 示例一律使用 `SERVER_IP`、镜像占位名和演示路径，不写入真实 IP、域名、账户、口令、密钥或生产日志。
- 手册以“仅 TCP 3510 对外开放”为唯一部署拓扑，RADAR 使用 Docker Compose；不扩展为 HTTPS、双端口或外网反向代理方案。

## 1. 目标与业务价值

- 要解决的问题：离线环境中同时部署 RADAR、kkFileView 和 NginxWebUI 时，缺少一份将端口隔离、镜像导入、Docker Compose、反向代理和预览回源完整串联的操作手册。
- 预期结果：运维人员打开一个 HTML 文件即可按顺序完成部署，并能定位常见的预览及反向代理问题。
- 业务价值：仅开放 3510 仍可访问 RADAR 和文件预览，避免暴露 kkFileView、RADAR 容器端口及 NginxWebUI 管理端口。

## 2. 使用者与场景

| 使用者 | 触发条件 | 前置条件 | 操作场景 | 完成结果 |
| --- | --- | --- | --- | --- |
| 内网运维人员 | 获得三个离线镜像包并仅开放 3510 | 已安装 Docker Compose v2，拥有服务器终端和 NginxWebUI 管理权限 | 按网页手册导入镜像、配置 Compose 和反向代理 | 通过 `http://SERVER_IP:3510` 访问 RADAR，并在同源 `/preview/` 路径预览文件 |

## 3. 范围

### 本次要做

1. 提供一份自包含、可离线打开的 HTML 部署手册，列明离线镜像包、目录、端口、安全边界和部署顺序。
2. 给出 RADAR 的 `.env` 与 `compose.yaml` 完整示例、kkFileView `docker run` 完整命令，以及 NginxWebUI 中使用的反向代理配置。
3. 给出启动验证、预览链路验证、故障排查、升级和回退说明，明确所有示例的占位值替换规则；三个已确认离线包固定使用 `ghcr.io/2guan/radar:latest`、`keking/kkfileview:4.1.0` 和 `cym1102/nginxwebui:latest` 标签。
4. 说明未来由外层 Nginx 提供 HTTPS 域名时的自适应代理配置，使 IP/HTTP 与域名/HTTPS 共存而无需维护 RADAR/kkFileView 双套地址。

### 明确不做

1. 不修改应用代码、镜像、Docker 守护进程、NginxWebUI 或任何运行中部署。
2. 不提供 HTTPS、域名、第二个对外端口或互联网镜像拉取方案。
3. 不保存真实服务器地址、账户、密码、证书、密钥或生产数据。

- [x] 可独立实现
- [x] 可独立测试
- [x] 可独立验收

## 4. 行为与业务规则

| 规则编号 | 触发条件 | 业务规则 | 不满足时处理 |
| --- | --- | --- | --- |
| BR-001 | 按手册部署 | 只有 Nginx 监听所有网卡的 3510；RADAR:3000、kkFileView:8012 和 WebUI:8080 只能在本机/内部网络访问 | 不继续对外暴露容器端口，先检查端口绑定和防火墙 |
| BR-002 | 文件预览 | 浏览器访问相对路径 `/preview/`；kkFileView 通过 Docker 网络中的 `radar:3000` 拉取签名附件 | 浏览器出现 `:8012` 或外部地址时，按手册校验 RADAR 环境变量和 Nginx 路由 |
| BR-003 | 离线导入 | 三个镜像均由 `docker load -i` 导入，且离线包必须分别提供 `ghcr.io/2guan/radar:latest`、`keking/kkfileview:4.1.0`、`cym1102/nginxwebui:latest` 标签 | 不使用需要联网的 `docker pull`；标签缺失时停止部署并确认离线包来源 |
| BR-004 | 外层 HTTPS 网关接入 | 预览页始终使用相对 `/preview/` 路径；内层 Nginx 依据当前请求或可信网关的 `X-Forwarded-Proto` 生成 kkFileView 基础地址 | 不新增 RADAR/kkFileView 双套地址；未经信任的来源不应决定 HTTPS 协议 |

## 5A. 配置与交付影响分析

| 项目 | 适用？ | 结论、标识与验证证据 |
| --- | --- | --- |
| 输入项配置注册 | 不适用 | 仅文档，不调整业务字段或表单。 |
| 字段四位置生效 | 不适用 | 仅文档，不涉及页面字段。 |
| 交付件配置注册 | 不适用 | 不变更交付件定义；手册只说明既有预览开关的部署环境配置。 |
| 种子与 mock 数据 | 不适用 | 不修改运行数据、种子或 mock。 |
| 服务端字段校验与导入导出 | 不适用 | 不修改 API、导入或导出。 |
| 公共能力或跨模块契约 | 适用 | 新增 governance 模块的离线部署手册公共文档交付物；不修改应用运行时/API 契约，复用既有同源预览契约。Owner 为 hengguan，兼容方式为不改变既有部署配置语义。 |
| 数据库与历史数据 | 不适用 | 仅说明持久化目录备份，不改表、不迁移数据。 |
| 权限、审计、附件、外网 | 适用 | 说明预览回源仅走 Docker 内部网络、外部仅经 3510；不新增权限或外网开放。 |

## 6. 权限、审计与外网

| 角色 | 查看/新增/修改/动作 | 数据范围 | 内网/外网 |
| --- | --- | --- | --- |
| 服务器运维人员 | 阅读手册、执行部署命令 | 仅其获授权服务器 | 内网 |

- 无权限处理：应用权限和附件签名校验沿用 RADAR 现有实现；手册不提供绕过方法。
- 审计要求：容器生命周期和 Nginx 配置变更由目标环境既有运维流程记录。
- 外网开放场景、字段、动作、附件限制与禁止项：本次不实际开放外网；手册仅记录未来由独立外层网关终止 TLS 的条件式配置。外层网关只转发既有 3510 服务，不新增 RADAR API、字段或附件权限。

## 7. 验收与脱敏示例

| 编号 | 类型 | Given | When | Then |
| --- | --- | --- | --- |
| AC-001 | 正常 | 仅开放 `3510`、三个离线 tar 包和 Docker Compose v2 已就绪 | 依序完成手册中的导入、Compose、kkFileView 和 Nginx 配置 | 可通过 `http://SERVER_IP:3510` 访问 RADAR |
| AC-002 | 正常 | RADAR 与 kkFileView 已加入 `radar-internal` | 上传可预览附件并点击预览 | 浏览器地址经 `/preview/onlinePreview`，不暴露 `:8012` |
| AC-003 | 边界 | 服务器没有互联网出口 | 导入镜像并启动服务 | 全流程仅使用本地 tar 包，无 `docker pull` 步骤 |
| AC-004 | 安全 | 仅 3510 对外开放 | 检查监听端口 | 3000、8012、8080 只绑定 `127.0.0.1` 或 Docker 内部网络 |
| AC-005 | 异常 | 预览链路失败 | 阅读排障表并执行对应检查 | 可区分 Nginx 502、信任主机、错误环境变量和容器网络问题 |
| AC-006 | 兼容 | 已按手册部署 HTTP/IP 单入口，未来新增 HTTPS 外层网关 | 外层网关传递 Host 和 `X-Forwarded-Proto=https` | 预览仍走相对 `/preview/`；HTTP/IP 与 HTTPS/域名均可预览，无需修改 RADAR/kkFileView 配置 |

```text
访问入口：http://SERVER_IP:3510
预览入口：http://SERVER_IP:3510/preview/onlinePreview?...
```

## 8. 研发上下文

- 目标模块 / Owner / 基准分支：`governance` / `hengguan` / `origin/main`；分支为 `hengguan/REQ-20260804-011-offline-single-port-manual`。
- 允许与禁止修改路径：见 `ai-task-scope.yaml`。
- 必须复用的能力与公开契约：既有同源相对预览路径，以及 `KKFILEVIEW_BASE_URL`、`KKFILEVIEW_ALLOWED_ORIGINS` 与 `ATTACHMENT_PREVIEW_SOURCE_BASE_URL`；本次不改变其实现，仅记录内层 Nginx 按转发协议自适应生成 kkFileView 子资源地址的部署配置。
- 接口契约：不涉及。
- 数据库迁移、历史数据、SQLite/TDSQL/MySQL 8 兼容及回退：不涉及；手册只说明备份 Docker 挂载的数据目录。
- 必须执行的测试：HTML 结构检查、`npm run test:api --prefix server`、`npm run test:rbac --prefix server`、`git diff --check`、文档内命令和变量一致性人工核对；不启动任何远端或生产服务。
- 风险、审批与未决问题：风险为 normal。离线包标签已由需求方确认；手册仍要求在导入后通过 `docker image ls` 验证三个指定标签均存在，标签缺失时停止部署。

## 9. 完成记录

- 修改文件与范围一致性：仅新增本需求目录及 `docs/deployment/offline-single-port-deployment.html`；未纳入既有未跟踪的 `docs/reports/`，也未修改应用、配置、镜像或数据文件。
- 配置与交付影响落实：输入项、字段四位置、交付件定义、种子/mock、服务端校验、数据库均不适用，原因见第 5A 节；治理模块部署文档作为公共交付物适用，但不改变应用运行时/API 契约；附件/外网边界适用，手册固定为单一 3510 入口、同源 `/preview/` 和 Docker 内部回源，并补充未来外层 HTTPS 网关传递协议头时的自适应配置。
- 测试证据：新建文件的 `git diff --no-index --check` 与仓库 `git diff --check` 均通过；Node.js 静态检查确认 HTML 标题、18 个可复制命令/配置块、内联复制脚本可编译、三个固定离线镜像标签、Compose 启动命令、同源预览变量、Docker 服务名、Nginx `/preview/` 路由、3000/8012/8080 本机绑定，以及 HTTP/HTTPS 协议推导、外层代理和可信网关增强配置均存在；`node scripts/check-governance.mjs`（18 个模块）和 `node scripts/check-module-boundaries.mjs`（247 个源文件）均通过；`npm test --prefix server` 为 38 通过、1 个非 CI API/RBAC 集成套件按预期跳过；`npm run test:api --prefix server` 与 `npm run test:rbac --prefix server` 均为 30 通过、5 跳过；`npm run build --prefix web` 通过；`node scripts/verify-app-runtime.mjs` 通过健康检查、SPA 入口、4 个入口资源和客户端路由回退。浏览器对本地 `file://` 文档的渲染验收受浏览器 URL 安全策略阻止，未绕过该限制。
- 已知风险：NginxWebUI 的少数版本可能不支持 `--server.address`，此时需以防火墙/受控管理网络确保 8080 不对客户端开放；若启用固定网关增强配置，必须将 `EDGE_NGINX_IP` 替换为真实外层网关源 IP；GitHub 依赖审计当前报告服务端高危漏洞数为 2、高于基线 1。该需求未修改任何依赖清单，审计基线/依赖升级不在本任务范围内，需另行治理。
- 发布验证与回退：手册本身为静态 HTML，可直接从仓库打开；部署前先在预发布/测试服务器执行第 10 节验证。应用回退遵循第 12 节：使用前一已验证镜像标签及升级前数据、附件、配置备份；不手工修改数据库。

## 10. 需求准入

- [x] 核心规则与验收标准无未决项
- [x] 涉密和外网边界明确
- [x] 配置与交付影响已逐项分析，并已记录适用范围或不适用原因
- [x] `requirement_ref`、标题、目录、任务范围、开发者和分支一致
- [x] 主模块为 `modules.yaml` 的单个键；多模块改动与 Owner 审批已记录
- [x] 当前分支、需求编号与任务范围一致
- [x] 所有示例已脱敏
- [x] 互联网 AI 使用许可已明确

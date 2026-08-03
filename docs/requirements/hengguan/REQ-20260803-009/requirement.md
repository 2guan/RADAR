---
document_type: ai_coding_requirement
template_version: "1.0"
requirement_id: "REQ-20260803-009"
requirement_ref: "hengguan/REQ-20260803-009"
title: "交付件预览同源代理路径"
status: "ready"
priority: "P1"
requester: "hengguan"
developer: "hengguan"
module: "governance"
module_owner: "hengguan"
contains_confidential_information: false
external_access_required: false
internet_ai_coding_allowed: true
last_updated: "2026-08-03"
---

# [hengguan/REQ-20260803-009] 交付件预览同源代理路径

## 1. 目标与业务价值

- 内网用户只能通过允许的自定义 HTTP 端口以 IP 访问，外网用户通过 HTTPS 域名访问时，二者都能预览同一交付件，无 Mixed Content。
- RADAR 预览会话返回同源相对路径（例如 `/preview/onlinePreview?...`），由部署侧 Nginx 将该路径代理到 kkFileView；不再将固定 IP 或域名写入浏览器 iframe。

## 2. 范围与规则

### 本次要做

1. 保留系统设置与环境中的 kkFileView 规范服务根地址（允许含反向代理路径，例如 `https://radar.example.com/preview`）作为服务启用、允许 Origin 校验和路径基线。
2. 已授权用户创建当前或历史文件版本的预览会话时，服务端仅返回以该规范地址路径部分构成的绝对路径；示例为 `/preview/onlinePreview?url=...`，不得包含 scheme、host、port 或任何由请求头直接派生的地址。
3. 附件前端继续直接把服务端返回值作为 iframe `src`，使浏览器按当前 RADAR 访问入口解析该相对路径；不新增前端配置项或用户输入。
4. `.env.example` 说明规范地址应指向同源 `/preview` 代理路径，且 kkFileView 容器的 `KK_BASE_URL` 应保持 `default`，由受控反向代理覆写 `X-Base-Url`。
5. Nginx 由部署人员配置，不提交真实 IP、域名、证书、Nginx 配置或任何生产环境文件；部署说明仅给出脱敏的通用验证步骤。

### 明确不做

1. 不修改数据库、迁移、附件存储、文件类型白名单、上传/下载、版本链、权限、审计、短签名算法或 kkFileView 容器镜像。
2. 不根据未验证的 `Host`、`Origin`、`Referer` 或前端参数选择预览地址，不实现多地址动态映射。
3. 不开放 kkFileView 的 `8012`、RADAR 容器直连端口或 Nginx `80/443` 给内网用户；端口和网络策略完全由部署侧决定。

## 3. 可验收行为

| 编号 | Given | When | Then |
| --- | --- | --- | --- |
| AC-001 | 预览已启用，规范服务地址为 `https://radar.example.com/preview` | 已授权用户创建 Word、Excel、PDF 或允许格式的预览会话 | `previewUrl` 以 `/preview/onlinePreview?url=` 开头，不包含 `https://radar.example.com`。 |
| AC-002 | 内网用户通过 `http://内网IP:允许端口` 打开 RADAR，Nginx 已代理 `/preview/` | 点击当前或历史版本预览 | iframe 请求同源的 `http://内网IP:允许端口/preview/...`，不请求 HTTPS 域名。 |
| AC-003 | 外网用户通过 HTTPS 域名打开 RADAR，Nginx 已代理 `/preview/` | 点击当前或历史版本预览 | iframe 请求同源 HTTPS `/preview/...`，浏览器不报 Mixed Content。 |
| AC-004 | 配置地址不合法、预览开关关闭、用户无实体查看权、附件已删除或类型不支持 | 请求预览会话 | 保持既有失败语义；不返回预览路径或物理存储地址。 |
| AC-005 | 规范服务地址不带代理路径，例如 `https://radar.example.com` | 创建预览会话 | 返回 `/onlinePreview?...`，保持既有直连部署兼容。 |

## 4. 影响分析

| 项目 | 适用？ | 结论 |
| --- | --- | --- |
| 输入项与交付件配置 | 不适用 | 不新增字段、交付件定义、布局或状态规则；复用既有系统预览开关和地址配置。 |
| 公共能力 | 适用 | 调整附件平台预览会话响应中 `previewUrl` 的表示形式：由已校验的绝对 kkFileView URL 变为其同源绝对路径；调用方式与响应字段名保持兼容。 |
| 数据库与历史数据 | 不适用 | 无 schema、迁移或存量附件变更。 |
| 权限与审计 | 适用 | 继续由服务端校验实体查看权、附件状态和签名；本次不新增写操作或审计事件。 |
| 附件与外网 | 适用 | 浏览器不再直连固定插件 Origin，而是同源访问部署方代理路径；短签名文件源仍仅供 kkFileView 内部读取。 |

## 5. 配置、发布与回退

- RADAR `.env`：`KKFILEVIEW_BASE_URL` 填部署规范入口加 `/preview` 路径；`KKFILEVIEW_ALLOWED_ORIGINS` 仅填写该规范入口的 Origin，不含路径。系统设置地址同样填规范入口加 `/preview`。
- kkFileView：保留 `KK_OFFICE_PREVIEW_TYPE=pdf`、`KK_OFFICE_PREVIEW_SWITCH_DISABLED=true`、精确 `KK_TRUST_HOST`；`KK_BASE_URL=default` 或不设置，以便 Nginx 写入受控 `X-Base-Url`。
- Nginx：内网允许端口和外网 HTTPS 入口均将 `/preview/` 代理到本机 kkFileView，且由 Nginx 覆写而不是透传客户端的 `X-Base-Url`。RADAR 与 kkFileView 容器端口只对本机或受限网络开放。
- 回退：回退本需求提交即可恢复绝对预览 URL；无需数据补偿。回退前将 Nginx `/preview/` 路由与旧 kkFileView 根地址保持可用。

## 6. 验证与完成记录

- 修改文件：`server/src/platform/attachments/preview.js` 将受控预览 URL 构造为已校验规范地址的路径加查询参数；`server/test/api-rbac.test.js` 覆盖代理路径、Origin 不泄露、签名来源和无路径兼容；`.env.example` 说明同源代理和 kkFileView `KK_BASE_URL=default`。未修改前端组件，因为 iframe 已支持相对 `src`。
- 自动化：`npm test --prefix server` 通过（36 passed、1 skipped）；`npm run test:api --prefix server` 与 `npm run test:rbac --prefix server` 均通过（各 26 passed、5 skipped），预览会话用例实际断言 `/preview/onlinePreview`、不返回 `127.0.0.1`、签名文件读取与 `/onlinePreview` 直连兼容。`node scripts/check-code-comments.mjs`、`node scripts/check-ui-data-sources.mjs`、`node scripts/check-module-boundaries.mjs`、`node scripts/check-governance.mjs`、`npm run build --prefix web`、`node scripts/verify-app-runtime.mjs` 和 `git diff --check` 均通过。
- 浏览器验收：未执行。待部署人员配置脱敏 Nginx 后，分别从内网 IP 自定义端口与外网 HTTPS 域名打开同一授权交付件，验证当前/历史预览、控制台、刷新和下载。
- 已知风险与回退：本地自动化无法验证用户自建 Nginx、证书、DNS、ACL 或容器网络；这些由部署验证覆盖。若 Nginx 未覆写 `X-Base-Url`，kkFileView 生成的静态资源地址可能指向错误入口。回退本需求提交即可恢复绝对预览 URL，无数据补偿。

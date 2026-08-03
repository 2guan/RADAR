---
document_type: ai_coding_requirement
template_version: "1.0"
requirement_id: "REQ-20260803-006"
requirement_ref: "hengguan/REQ-20260803-006"
title: "交付件上传、预览文件类型及 kkFileView 部署配置"
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

# [hengguan/REQ-20260803-006] 交付件上传、预览文件类型及 kkFileView 部署配置

## 1. 目标与业务价值

- 交付件仅允许上传并在线预览用户确认、且 kkFileView 4.1.0 支持的文件类型。本需求以 `governance` 登记为主模块，用于统筹附件平台、运行时环境模板与需求范围文档三个受影响模块；各模块 Owner 均为 `hengguan`。
- 上传选择、服务端校验和预览按钮使用同一清单，避免“界面可选但服务端拒绝”或“可上传但没有预览入口”。

## 2. 范围与规则

### 本次要做

1. `UPLOAD_ALLOWED_EXTENSIONS` 为交付件上传与预览的唯一扩展名配置，默认值为 `doc`、`docx`、`xls`、`xlsx`、`ppt`、`pptx`、`jpg`、`jpeg`、`png`、`gif`、`tif`、`tiff`、`pdf`、`ofd`、`txt`、`html`、`htm`、`xml`、`json`、`properties`、`md`、`log`、`py`、`sql`、`zip`、`rar`；配置以逗号分隔且不区分大小写。
2. 服务端对新上传及上传新版本执行同一白名单校验；不在清单内的扩展名返回明确错误，不能写入附件存储。
3. 前端上传控件从服务端有效配置获取后缀；启用系统交付件预览时，清单内文件显示预览按钮，历史版本保持相同行为。
4. 预览开关、文件下载、附件授权、上传人/版本记录和审计不改变。
5. `.env` 与 `.env.example` 补齐 RADAR 预览服务回退配置（开关、kkFileView 地址、允许 Origin、签名文件内部来源）以及 kkFileView 容器配置（公开基址、可信来源、Office 预览模式和模式切换开关）。Office 默认使用 PDF 模式，并隐藏图片/PDF 切换按钮。

### 明确不做

1. 除 `zip`、`rar` 外，不开放其他压缩包、音视频、CAD、可执行文件或其他现有历史扩展名。
2. 不改变文件大小限制、存储路径、数据库结构、权限、审计、系统设置中的 kkFileView 地址配置或外网能力。
3. 不修改既有历史附件；不在本次迁移或删除旧文件。

## 3. 验收标准

| 编号 | Given | When | Then |
| --- | --- | --- | --- |
| AC-001 | 任一允许后缀文件 | 上传或更新交付件版本 | 前端可选择，服务端成功保存并保留既有版本/上传人记录。 |
| AC-002 | `7z`、`csv`、`bmp`、`svg` 或无扩展名文件 | 上传或更新交付件版本 | 服务端拒绝且不创建附件记录。 |
| AC-003 | 系统预览已启用、允许后缀的当前或历史文件 | 查看交付件 | 显示预览按钮并由既有受控预览会话打开 kkFileView。 |
| AC-004 | 系统预览未启用 | 查看当前或历史文件 | 不显示预览按钮，下载行为不变。 |
| AC-005 | `.env` 配置不同大小写或无点号的允许后缀 | 重启服务并上传 | 服务端规范化后生效，上传选择与预览按钮同步使用该集合。 |
| AC-006 | 部署人员使用仓库 `.env` 或 `.env.example` | 配置 RADAR 与 kkFileView 容器并重建容器 | Word、Excel、PPT 默认使用 PDF 预览，图片/PDF 模式切换按钮不显示；RADAR 仍只接受允许 Origin 中的 kkFileView 服务地址。 |

## 4. 影响分析

| 项目 | 适用？ | 结论 |
| --- | --- | --- |
| 交付件配置、字段和种子 | 不适用 | 仅调整所有通用附件的文件类型白名单，不新增交付件定义或输入项。 |
| 公共能力 | 适用 | 修改附件平台上传/预览可用类型行为及公共 `AttachmentField` 展示；预览可用性响应增补有效扩展名字段，旧的授权、下载与版本接口语义保持不变。 |
| 数据库与历史数据 | 不适用 | 无迁移；历史不在新清单内附件仍可下载，预览按钮按新白名单隐藏。 |
| 权限与审计 | 适用 | 保持服务端实体授权、RBAC 和既有上传/版本审计，类型校验不能由前端替代。 |
| 附件与外网 | 适用 / 不适用 | 附件类型边界调整；补齐 kkFileView 内网部署参数。kkFileView 仍仅通过既有受控短签名会话访问，无新增外网或前端地址下发。 |

## 5. 验证、发布与回退

- 自动化：扩展名白名单、大小写、拒绝类型和预览类型单元测试；附件 API/RBAC 回归；前端构建、模块边界、UI 数据源、运行时与空白检查。
- 浏览器：本地脱敏管理员在交付件中选择允许/拒绝文件，验证错误反馈、预览开关和历史版本按钮。
- 发布：无需迁移；在 `.env` 设置 `UPLOAD_ALLOWED_EXTENSIONS=.doc,.docx,...,.zip,.rar` 后重启服务。按 `.env` 中的 kkFileView 参数重建预览容器；仅重启 RADAR 不会让独立 kkFileView 容器读取新 Office 参数。新增类型前须确认 kkFileView 版本支持该格式。
- 回退：回退本需求的白名单与前端 accept/预览匹配代码即可；不会影响已存附件数据。

## 6. 完成记录

- 修改文件：`server/src/platform/runtime/config.js` 解析交付件扩展名默认值及 `.env` 覆盖；`server/src/platform/attachments/preview.js` 基于有效扩展名生成受控预览类型；`web/src/platform/attachments/AttachmentField.jsx` 从预览可用性接口获得有效集合，用于新上传、更新版本和当前/历史文件预览判断；`server/src/platform/attachments/index.js` 公开既有扩展名校验，供单元测试经平台契约验证；`.env` 和 `.env.example` 补齐 RADAR 预览回退与 kkFileView 容器环境变量，并说明它们的部署边界。
- 安全与兼容：服务端 `checkExt` 仍是上传和版本更新的最终边界；既有实体授权、RBAC、审计、下载、版本链和预览会话接口未改变。旧附件不删除；不在新清单内的历史文件仍可下载，但不显示预览。
- 测试证据：`npm test --prefix server` 通过（34 passed、1 skipped），新增测试覆盖允许后缀、大小写、拒绝 `7z/csv/bmp/svg/exe` 与无后缀、以及预览可用性；`npm run test:api --prefix server`、`npm run test:rbac --prefix server` 均通过（各 26 passed、5 skipped）；`node scripts/check-code-comments.mjs`、`node scripts/check-ui-data-sources.mjs`、`node scripts/check-module-boundaries.mjs`、`npm run build --prefix web`、`node scripts/verify-app-runtime.mjs`、`node scripts/check-governance.mjs` 和 `git diff --check` 均通过。`node --env-file=.env` 已验证九项预览变量可解析，且 Office 默认值为 `pdf` / `true`；环境模板的键名与 kkFileView 4.1.0 的 `application.properties` 逐项核对。
- 浏览器验收：未执行。本地隔离浏览器没有登录态，无法在不使用凭据的情况下访问受保护的交付件页面；发布前应以脱敏管理员上传 `.PDF`、`.zip` 与拒绝 `.7z`，并验证开启/关闭预览时当前和历史版本按钮的可见性。
- 已知风险与回退：管理员若在 `.env` 加入 kkFileView 不支持的扩展名，文件可上传但预览可能失败；部署前需确认插件支持。若需回退，回退本需求的扩展名配置、前端 accept 和预览匹配代码，无数据补偿。

---
document_type: ai_coding_requirement
template_version: "1.0"
requirement_id: "REQ-20260802-003"
requirement_ref: "hengguan/REQ-20260802-003"
title: "历史交付件预览开关一致性修复"
status: "ready"
priority: "P1"
requester: "hengguan"
developer: "hengguan"
module: "governance"
module_owner: "hengguan"
contains_confidential_information: false
external_access_required: false
internet_ai_coding_allowed: true
last_updated: "2026-08-02"
---

# [hengguan/REQ-20260802-003] 历史交付件预览开关一致性修复

## 目标与范围

- 修复统一 `AttachmentField` 中历史版本弹窗未受“系统设置 → 基础配置 → 交付件预览”有效开关控制的问题。
- 当前版本与历史版本共用同一个服务端有效预览状态：未启用或状态尚未加载完成时，二者均不展示预览按钮；启用后，仅未删除且格式为 Word、Excel、PDF 的文件版本展示预览按钮。
- 不改变预览接口、短时签名、下载、版本查询、实体授权、配置键、数据库、迁移、审计或 kkFileView 部署方式。

## 使用场景与规则

| 使用者 | 场景 | 规则 |
| --- | --- | --- |
| 交付件查看人员 | 打开文件交付件的“历史版本”弹窗 | 有效预览开关为 `false` 时，任何历史版本均不显示预览图标；下载保持可用。 |
| 交付件查看人员 | 管理员已启用预览后打开历史版本弹窗 | 未删除且扩展名为 `.doc/.docx/.xls/.xlsx/.pdf` 的版本显示预览和下载图标；路径、已删除版本及其他格式不显示预览。 |
| 管理员 | 在系统设置保存预览开关 | 已打开的统一附件组件接收既有 `radar:deliverable-preview-config-updated` 事件后，当前与历史版本的预览入口同步刷新。 |

## 影响分析

| 项目 | 适用？ | 结论 |
| --- | --- | --- |
| 输入项与交付件配置 | 不适用 | 不新增字段、交付件定义或配置键。 |
| 公共能力 | 适用 | 修改 `platform/attachments` 的统一前端组件显示条件；不变更公开 API 契约。 |
| 数据库与历史数据 | 不适用 | 不新增迁移、不写入或回填数据。 |
| 权限、审计、附件与外网 | 不适用 | 服务端实体授权、预览会话签名、审计、内网 kkFileView 白名单均保持不变。 |
| 页面状态 | 适用 | 首次加载有效预览状态前按关闭处理，避免短暂暴露历史预览入口；加载失败同样保持隐藏。 |

## 验收标准

| 编号 | Given | When | Then |
| --- | --- | --- | --- |
| AC-001 | 预览功能关闭，文件交付件存在未删除历史 PDF | 打开“历史版本”弹窗 | 历史条目不显示预览图标，仍显示下载图标。 |
| AC-002 | 预览功能开启，文件交付件存在未删除历史 PDF | 打开“历史版本”弹窗 | 历史条目显示预览与下载图标。 |
| AC-003 | 预览功能开启，历史条目为路径、已删除文件或非 Word/Excel/PDF 文件 | 打开“历史版本”弹窗 | 条目不显示预览图标；已删除项也不显示下载。 |
| AC-004 | 附件组件已打开，管理员保存预览开关 | 再次打开或查看历史版本 | 当前与历史版本的预览入口同步显示或隐藏，不需要刷新整页。 |

## 研发上下文与回退

- 跨模块变更按仓库约定以 `governance` 作为任务范围登记主模块；实际功能模块为 `platform/attachments`，Owner 均为 `hengguan`。
- 可写路径、分支与测试见 `ai-task-scope.yaml`。复用已有 `previewEnabled` 状态和配置刷新事件，不创建平行状态或请求。
- 上线后如需回退，可回退本次前端组件变更；服务端和历史附件数据无需补偿。

## 完成记录

- 修改范围：`AttachmentField` 将有效预览状态传入历史版本项，并在历史预览回调中再次拒绝关闭状态；未修改 API、服务端、数据库、迁移、权限、审计或部署配置。
- 检查证据：`node scripts/check-ui-data-sources.mjs`、`npm run build --prefix web`、`node scripts/check-module-boundaries.mjs`、`node scripts/verify-app-runtime.mjs` 与 `git diff --check` 均通过。
- 浏览器证据：本地隔离应用中关闭预览后，文件历史弹窗显示 0 个“在线预览”图标、仍显示 2 个“下载此版本”图标；重新加载组件并开启预览后，当前列表显示 1 个预览图标，打开含 V1/V2 的历史弹窗后共显示 3 个预览图标（当前 1 个、历史 2 个），历史下载仍显示 2 个图标。
- 已知风险与回退：该统一组件影响所有交付件页面，但仅收紧了关闭时的 UI 暴露条件；可单独回退本次前端变更，不涉及数据补偿。

## 需求准入

- [x] 规则、范围、权限与回退明确
- [x] 不涉及新增数据、迁移或外网能力
- [x] 任务范围、主模块、Owner 与分支一致

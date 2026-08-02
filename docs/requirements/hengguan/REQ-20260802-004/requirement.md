---
document_type: ai_coding_requirement
template_version: "1.0"
requirement_id: "REQ-20260802-004"
requirement_ref: "hengguan/REQ-20260802-004"
title: "概览详情历史人员对象兼容修复"
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

# [hengguan/REQ-20260802-004] 概览详情历史人员对象兼容修复

## 目标与范围

- 修复概览详情读取历史需求/工单时，`proposer` 内的人员对象被直接作为数据库参数，导致 TDSQL 返回 500 的问题。
- 详情接口继续接受现有姓名字符串；历史对象优先取其中的姓名再查询人员信息。没有可用姓名的对象不参与查询，且不影响其余详情数据返回。
- 本次仅处理服务端只读聚合的兼容性，不回写或迁移历史数据。

## 使用场景与规则

| 使用者 | 场景 | 规则 |
| --- | --- | --- |
| 有概览查看权限的人员 | 在概览点击历史需求或工单卡片 | 接口以 200 返回详情，历史提交人对象显示可识别的姓名及已有机构、手机号信息。 |
| 有概览查看权限的人员 | 历史人员对象缺少可用姓名 | 不向数据库传递对象参数；该无效人员项被忽略，其余详情继续返回。 |

## 影响分析

| 项目 | 适用？ | 结论 |
| --- | --- | --- |
| 输入项配置注册与字段四位置 | 不适用 | 不新增或调整填写、展示配置；仅兼容已有详情响应中的历史存储形态。 |
| 交付件配置注册 | 不适用 | 不涉及交付件定义、模板或附件界面。 |
| 种子与 mock 数据 | 不适用 | 不改变业务默认数据；测试使用临时数据库的脱敏夹具。 |
| 服务端字段校验与导入导出 | 不适用 | 不新增写入入口或枚举；只读接口在查询前规范化历史值。 |
| 公共能力或跨模块契约 | 不适用 | 不新增或修改公开模块入口；概览模块内部详情响应保持兼容。 |
| 数据库与历史数据 | 适用 | 不新增 SQLite/TDSQL/MySQL 迁移、不回填数据；兼容既有 JSON 人员对象，回退代码即可恢复原行为。 |
| 权限、审计、附件、外网 | 不适用 | 沿用既有 `overview:view` 鉴权与组织范围校验；无写操作、审计、附件或外网能力变更。 |

## 验收标准

| 编号 | 类型 | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-001 | 正常 | 历史需求的 `proposer` 为包含 `name` 的对象数组 | 请求 `/api/overview/:reqCode/detail` | 返回 200，`proposerInfo` 返回对应人员信息。 |
| AC-002 | 异常 | 历史人员对象没有可识别姓名 | 请求详情 | 不发生数据库参数错误，接口仍返回 200。 |
| AC-003 | 兼容 | `proposer` 为既有姓名字符串或字符串数组 | 请求详情 | 原有人员解析结果保持不变。 |
| AC-004 | 权限 | 请求没有 `overview:view` 权限 | 请求详情 | 保持既有拒绝行为，不因兼容逻辑放宽访问控制。 |

## 研发上下文与回退

- 跨模块登记主模块为 `governance`，实际功能模块为 `overview`，Owner 均为 `hengguan`；复用既有人员查询、鉴权、组织范围和响应封装，不新增跨模块调用。
- 接口为既有 `GET /api/overview/:reqCode/detail`，响应 envelope 与字段名称不变。人员对象仅作为历史输入形态规范化，不暴露新增字段。
- 验证将执行 API/RBAC 集成测试、模块边界检查、前端生产构建、隔离运行检查与差异空白检查；新增 API 用例直接命中 AC-001/AC-002。
- 上线后若需回退，仅回退本次 `resolvePerson` 兼容逻辑和回归测试；无数据库补偿或缓存清理。

## 完成记录

- 修改文件与范围一致性：仅修改概览模块内部的 `server/src/modules/overview/api/routes.js`、全局 API/RBAC 集成测试 `server/test/api-rbac.test.js` 与本需求目录；未改动页面、配置、附件、数据库、迁移或部署文件。
- 配置与交付影响落实：第 5A 节各项均已完成不适用/适用分析；不涉及配置注册或数据迁移。
- 测试证据：`npm run test:api --prefix server` 与 `npm run test:rbac --prefix server` 均通过（26 passed、5 skipped），新增“概览详情兼容历史提交人对象，且跳过没有姓名的无效对象”用例命中 AC-001/AC-002/AC-003；`npm test --prefix server` 通过（32 passed、1 skipped）；`node scripts/check-module-boundaries.mjs`、`npm run build --prefix web`、`node scripts/verify-app-runtime.mjs` 和 `git diff --check` 均通过。本地概览页面可加载且控制台无 error。
- 已知风险：仅兼容对象的 `name` 字段；缺少该字段的历史人员项将不显示，优先保证详情可用且不向 TDSQL 传递非法参数。当前姓名字符串与已有权限逻辑保持不变。
- 发布验证与回退：发布后用受权限保护的概览详情打开历史记录 `RC_202608_001`，确认 HTTP 200 且提出人区域可见；如需回退，仅回退本次人员解析逻辑和测试，无数据补偿。

## 需求准入

- [x] 核心规则与验收标准无未决项
- [x] 涉密和外网边界明确；示例仅使用脱敏测试数据
- [x] 配置与交付影响已逐项分析
- [x] `requirement_ref`、目录、任务范围、开发者和分支一致
- [x] 登记主模块为 `governance`，实际功能模块为 `overview`，Owner 为 `hengguan`
- [x] 当前分支基于最新 `origin/main`

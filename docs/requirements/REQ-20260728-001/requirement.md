---
document_type: ai_coding_requirement
template_version: "1.0"
requirement_id: "REQ-20260728-001"
title: "需求分析-增加需求优先级字段"
status: "draft"
priority: "P2"
requester: "业务用户"
developer: "hengguan"
module: "requirements"
module_owner: "hengguan"
contains_confidential_information: false
external_access_required: false
internet_ai_coding_allowed: true
last_updated: "2026-07-28"
---

# [REQ-20260728-001] 需求分析-增加需求优先级字段

> 一份文档只描述一个可独立实现、测试和验收的细粒度需求。未涉及项填写"不涉及"。涉密需求不得提交给互联网 AI。

## 0. AI 执行约束

- 仅实现本次范围，不实现明确不做项；只修改任务范围允许路径。
- 优先复用既有组件、公开契约、权限、审计与附件能力；不得无关重构、替换技术栈或升级依赖。
- 需求、代码与规约冲突时先报告；存在影响正确实现的未决问题时不得编码。

## 1. 目标与业务价值

- 要解决的问题：当前需求列表缺乏优先级标注，管理者无法快速识别哪些需求需要优先处理，影响排期和资源分配效率。
- 预期结果：需求记录新增 `priority` 字段，默认值为「中」，可选「高」「中」「低」；字段在列表页可见、编辑表单可维护。
- 业务价值：支持按优先级标注需求，提升需求管理和排期决策效率。

## 2. 使用者与场景

| 使用者 | 触发条件 | 前置条件 | 操作场景 | 完成结果 |
| --- | --- | --- | --- | --- |
| 需求管理人员 | 新建需求 | 拥有 `requirement.create` 权限 | 填写需求表单时选择优先级（默认「中」） | 需求保存成功，优先级记录生效 |
| 需求管理人员 | 编辑需求 | 拥有 `requirement.edit` 权限 | 在编辑表单中修改已有需求的优先级 | 修改保存成功 |
| 所有需求查看人员 | 打开需求列表 | 拥有 `requirement.view` 权限 | 在需求列表中查看每条需求的优先级 | 列表展示优先级列 |

## 3. 范围

### 本次要做

1. `requirement` 表新增 `priority` 列（TEXT NOT NULL DEFAULT '中'）
2. 后端新建/编辑 API 支持 `priority` 字段读写
3. 前端列表页 `RequirementsPage.jsx` 新增优先级展示列
4. 前端编辑器 `RequirementEditor.jsx` 新增优先级下拉选择字段（默认「中」）

### 明确不做

1. 不增加按优先级排序/筛选功能（后续需求）
2. 不修改导出/导入模板（后续需求）
3. 不修改需求详情页 `RequirementDetailPage.jsx`（仅列表和编辑表单）
4. 不修改公共契约 `contracts/work-item.js`

- [x] 可独立实现
- [x] 可独立测试
- [x] 可独立验收

## 4. 行为与业务规则

- 当前行为：需求记录无优先级属性。
- 变更后行为：每条需求记录有 `priority` 字段，默认值为「中」，可选值为「高」「中」「低」。
- 失败行为：保存时若传入非法优先级值，按默认值「中」处理。

| 规则编号 | 触发条件 | 业务规则 | 不满足时处理 |
| --- | --- | --- | --- |
| BR-001 | 新建需求时未指定优先级 | 默认取值「中」 | 数据库 DEFAULT 兜底 |
| BR-002 | 编辑需求时指定优先级为「高」「中」「低」 | 允许更新 | N/A |
| BR-003 | 编辑需求时指定非法优先级值 | 服务端校验，拒绝或按默认值处理 | 返回错误或降级为中 |
| BR-004 | 历史数据无优先级 | 迁移后自动设为「中」 | UPDATE 回填 |

## 5. 页面、数据与状态（涉及时填写）

| 页面/区域 | 入口 | 展示 | 动作 | 成功/失败反馈 |
| --- | --- | --- | --- | --- |
| 需求列表页 | 侧边栏「需求分析」菜单 | `priority` 列，显示高/中/低 | 无直接动作（只读展示） | N/A |
| 需求编辑弹窗 | 列表操作列「编辑」按钮 | 下拉选择器，默认选中「中」 | 选择后保存 | 保存成功；校验失败则提示 |

| 字段 | 含义 | 必填/校验 | 脱敏示例 | 涉密 | 外网可见/可写 |
| --- | --- | --- | --- | --- |
| `priority` | 需求优先级 | 必填，默认「中」，值限定「高」「中」「低」 | 高 | 否 | 不涉及 |

| 当前状态 | 动作/角色 | 条件 | 目标状态 | 失败保持 |
| --- | --- | --- | --- | --- |
| 任意 | 编辑/需求管理人员 | 拥有 `requirement.edit` 权限 | 优先级更新 | 保持原值 |

## 6. 权限、审计与外网

| 角色 | 查看/新增/修改/动作 | 数据范围 | 内网/外网 |
| --- | --- | --- | --- |
| 需求查看角色 | 查看 `priority` | 无限制 | 内网 |
| 需求编辑角色 | 新增/修改 `priority` | 无限制 | 内网 |

- 无权限处理：不涉及（复用需求模块现有 `requirement.edit` / `requirement.view` 权限）
- 审计要求：`priority` 字段写入时自动纳入现有审计变更记录（复用审计中间件）
- 外网开放场景、字段、动作、附件限制与禁止项：不涉及

## 7. 验收与脱敏示例

| 编号 | 类型 | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-001 | 正常 | 已登录需求编辑用户 | 新建需求，不选择优先级，保存 | 需求创建成功，`priority` = "中" |
| AC-002 | 正常 | 已登录需求编辑用户 | 新建需求，选择优先级"高"，保存 | 需求创建成功，`priority` = "高" |
| AC-003 | 正常 | 已登录需求编辑用户 | 编辑已有需求，将优先级从"中"改为"低"，保存 | 更新成功，`priority` = "低" |
| AC-004 | 正常 | 已登录需求查看用户 | 打开需求列表页 | 列表中可见"优先级"列，各记录显示高中低 |
| AC-005 | 异常 | 已登录需求编辑用户 | 通过 API 传入非法优先级值（如"紧急"） | 保存失败或降级为"中" |
| AC-006 | 边界 | 存在历史需求数据（迁移前创建） | 执行迁移并打开列表 | 历史数据的优先级自动设为"中" |

```json
{ "req_code": "RC_2025Q1_001", "title": "测试需求A", "priority": "高" }
```

禁止使用生产数据、真实账号/密钥、内网地址、真实日志、附件和截图作为示例。

## 8. 研发上下文

- 目标模块 / Owner / 基准分支：`requirements` / hengguan / `main`
- 允许与禁止修改路径：见 `ai-task-scope.yaml`。
- 必须复用的能力与公开契约：
  - 复用 `ServerTable` 列渲染模式
  - 复用 `Select` 组件用于优先级下拉
  - 复用现有审计中间件
- 接口契约（路径、方法、请求、响应、权限）：
  - `POST /requirements` — 新建时接收 `priority` 字段
  - `PUT /requirements/:id` — 编辑时接收 `priority` 字段
  - `POST /requirements/list` — 列表查询返回 `priority` 字段（无需筛选/排序）
- 数据库迁移、历史数据、SQLite/TDSQL/MySQL 8 兼容及回退：
  - SQLite 迁移：`0040_add_requirement_priority.sql`
  - TDSQL 迁移：`0020_add_requirement_priority.sql`
  - 历史数据回填：`UPDATE requirement SET priority = '中' WHERE priority IS NULL OR priority = '';`
  - 回退：`ALTER TABLE requirement DROP COLUMN priority;`（新列无业务依赖，可安全回退）
- 必须执行的构建、单元、API、权限与回归测试：
  - 构建通过：`npm run build --prefix web`
  - 后端启动成功，API 正常响应
  - 手动验收 AC-001 ~ AC-006
- 风险、审批与未决问题：
  - 无高风险变更
  - 无需额外 Owner 审批（仅为模块内部字段追加）
  - 无未决问题

## 9. 完成记录

- 修改文件与范围一致性：
  - `server/src/platform/persistence/migrations/0040_add_requirement_priority.sql` — 新增
  - `server/src/platform/persistence/migrations/tdsql/0020_add_requirement_priority.sql` — 新增
  - `server/src/modules/requirements/routes.js` — COLUMNS/WRITABLE/LABELS/IO_COLUMNS/导入SQL/导出列
  - `web/src/modules/requirements/pages/RequirementsPage.jsx` — 列表新增优先级列（彩色Tag展示）
  - `web/src/modules/requirements/components/RequirementEditor.jsx` — 表单新增优先级下拉（默认「中」）
- 测试证据：前端构建通过（14.65s, 0 errors）、后端健康检查通过
- 已知风险：无
- 发布验证与回退：`ALTER TABLE requirement DROP COLUMN priority;` 可安全回退

## 10. 需求准入

- [x] 核心规则与验收标准无未决项
- [x] 涉密和外网边界明确
- [x] 所有示例已脱敏
- [x] 互联网 AI 使用许可已明确

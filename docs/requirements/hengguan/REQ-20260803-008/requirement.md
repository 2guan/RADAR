---
document_type: ai_coding_requirement
template_version: "1.0"
requirement_id: "REQ-20260803-008"
requirement_ref: "hengguan/REQ-20260803-008"
title: "投产点日期固定使用 YYYYMMDD"
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

# [hengguan/REQ-20260803-008] 投产点日期固定使用 YYYYMMDD

## 0. AI 执行约束

- 仅将“投产点”这一参考数据的人可读日期统一为 `YYYYMMDD`；其他业务日期继续遵循 `hengguan/REQ-20260803-007` 的格式规则。
- 复用现有投产点参考数据组件，禁止在每个业务页面分别写格式化逻辑。
- 不改数据库值、表结构、API DTO、日期控件提交格式、权限、审计事件或投产点筛选/排序语义。

## 1. 目标与业务价值

- 要解决的问题：投产点原本以 `YYYYMMDD` 保存和传输，但近期统一日期展示时被转换为 `YYYY-M-D`，与投产窗口的稳定业务标识不一致。
- 预期结果：任意数值投产点在列表、详情、选择项、顶栏和仪表盘均显示为原始八位格式，如 `20260525`；“投产点待定”保持原文。
- 业务价值：用户可用同一稳定投产点标识对照投产计划、审批和跨模块记录，避免日期格式混淆。

## 2. 使用者与场景

| 使用者 | 触发条件 | 前置条件 | 操作场景 | 完成结果 |
| --- | --- | --- | --- | --- |
| 业务人员 | 浏览需求、工单、投产申请或概览 | 有相应查看权限 | 查看关联投产点 | 所有数值投产点均显示八位日期 |
| 配置管理员 | 管理或选择投产点 | 有系统设置权限 | 在投产点列表和选择器中查看 | 录入、回显和候选项格式一致 |

## 3. 范围

### 本次要做

1. 调整 `ReleasePointText` 及其标签/选项适配器：八位数投产点按原值显示，不再调用通用日期展示格式化。
2. 覆盖引用该公开组件的设置、需求、工单、投产、概览、仪表盘和顶栏入口，并增加可自动验证的格式断言。

### 明确不做

1. 不改变非投产点的日期或日期时间展示规则。
2. 不迁移历史投产点数据，仍仅接受既有的 `YYYYMMDD` 或“投产点待定”。
3. 不新增输入项、交付件、权限、审计、外网访问或数据库迁移。

- [x] 可独立实现
- [x] 可独立测试
- [x] 可独立验收

## 4. 行为与业务规则

- 当前行为：`ReleasePointText` 将八位投产点日期交给通用日期工具，显示为 `YYYY-M-D`。
- 变更后行为：八位数字投产点直接显示为 `YYYYMMDD`；非数值的“投产点待定”原样显示；空值继续使用调用方占位符。
- 失败行为：非八位数字且非待定值不做日期解析或时区换算，保留其原始文本，避免误改数据含义。

| 规则编号 | 触发条件 | 业务规则 | 不满足时处理 |
| --- | --- | --- | --- |
| BR-001 | 显示数值投产点 | 严格输出八位 `YYYYMMDD`，如 `20260525` | 不补分隔符、不做时区转换 |
| BR-002 | 显示投产点待定或历史文本 | 保留原始文本 | 不将其解析为日期 |
| BR-003 | 显示其他日期字段 | 继续按既有日期时间统一工具处理 | 本需求不得影响 |

## 5. 页面、数据与状态

| 页面/区域 | 入口 | 展示 | 动作 | 成功/失败反馈 |
| --- | --- | --- | --- | --- |
| 系统设置投产点 | 系统设置 → 投产点管理 | `YYYYMMDD` 或待定原文 | 新增、编辑、选择 | 保持既有校验和提示 |
| 业务列表、详情、概览、顶栏 | 既有模块入口 | `YYYYMMDD` 或待定原文 | 只读查看、选择筛选 | 空值沿用既有占位符 |

| 字段 | 含义 | 必填/合法值/空值处理 | 脱敏示例 | 涉密 | 外网可见/可写 |
| --- | --- | --- | --- | --- |
| `release_date` | 投产点稳定日期标识 | 服务端既有校验 `YYYYMMDD` 或待定；空值按调用方处理 | `20260525` | 否 | 不涉及 |

本需求不变更状态机。

## 5A. 配置与交付影响分析

| 项目 | 适用？ | 结论、标识与验证证据 |
| --- | --- | --- |
| 输入项配置注册 | 不适用 | 不新增或调整投产点字段、范围、布局或状态规则，仅修正已有参考数据文本展示。 |
| 字段四位置生效 | 适用 | 投产点已有列表、筛选、详情/编辑和配置入口；统一由 `ReleasePointText`、标签和选项适配器覆盖并复核所有引用。 |
| 交付件配置注册 | 不适用 | 不涉及交付件。 |
| 种子与 mock 数据 | 不适用 | 不新增业务数据；使用脱敏 `20260525` 和“投产点待定”断言。 |
| 服务端字段校验与导入导出 | 不适用 | 已有服务端校验和机器可读格式保持不变。 |
| 公共能力或跨模块契约 | 适用 | 修改 settings 对外导出的既有投产点展示组件的格式语义，所有消费模块保持 API 兼容；Owner 为 hengguan。 |
| 数据库与历史数据 | 不适用 | 不改 schema、迁移或存量值。 |
| 权限、审计、附件、外网 | 不适用 | 仅改变已授权页面内文本，无新增访问或事件。 |

## 6. 权限、审计与外网

| 角色 | 查看/新增/修改/动作 | 数据范围 | 内网/外网 |
| --- | --- | --- | --- |
| 既有授权用户 | 沿用既有投产点和业务页面权限 | 沿用既有数据范围 | 内网 |

- 无权限处理：沿用既有 `401/403` 和页面无权限状态。
- 审计要求：不新增审计事件。
- 外网开放场景、字段、动作、附件限制与禁止项：不涉及。

## 7. 验收与脱敏示例

| 编号 | 类型 | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-001 | 正常 | 数值投产点 `20260525` | 在任一引用组件的页面或选择项查看 | 显示 `20260525`，不含连字符 |
| AC-002 | 正常 | “投产点待定” | 在列表、详情或顶栏查看 | 原文显示，不尝试日期转换 |
| AC-003 | 回归 | 非投产点业务日期 `2026-05-25` | 在原有日期字段查看 | 继续显示 `2026-5-25` |
| AC-004 | 边界 | 空投产点 | 打开任一引用位置 | 沿用 `—` 或调用方既有占位符 |

```json
{
  "releasePoint": "20260525",
  "releasePointDisplay": "20260525",
  "pendingReleasePointDisplay": "投产点待定",
  "ordinaryDateDisplay": "2026-5-25"
}
```

## 8. 研发上下文

- 目标模块 / Owner / 基准分支：`governance` / `hengguan` / `origin/main`；分支为 `hengguan/REQ-20260803-008-release-point-date-format`。以 governance 登记主模块，用于统筹需求范围文档和 settings 的公开展示能力变更。
- 多模块协作：直接改动归属 `settings/reference-data` 的公开展示组件；`dashboard`、`overview`、`requirements`、`tickets`、`release` 和 `platform/runtime` 前端仅通过 settings 的公开入口消费，不直接写入其内部实现。组件 API、原始值、待定文本和空值兼容；数值投产点的展示文本按用户规则恢复为 `YYYYMMDD`。Owner 均为 hengguan。
- 允许与禁止修改路径：见 `ai-task-scope.yaml`。
- 必须复用的能力与公开契约：`web/src/modules/settings/reference-data/index.js` 的 `ReleasePointText`、`releasePointLabelText` 和选项工厂。
- 接口契约：不新增或修改 API。
- 数据库迁移、历史数据、SQLite/TDSQL/MySQL 8 兼容及回退：无迁移；回退本需求提交即可，无数据补偿。
- 必须执行的构建、单元、API、权限、外网白名单与回归测试：组件格式断言（BR-001 至 BR-003）、服务端 API/RBAC 回归、前端构建、UI 数据源、模块边界、治理、代码注释、运行时和空白检查；以脱敏管理员完成 AC-001 至 AC-004 的桌面/移动验收。
- 风险、审批与未决问题：风险为 normal；唯一展示语义变更已明确，无未决问题。

## 9. 完成记录

- 修改文件与范围一致性：新增 `web/src/modules/settings/reference-data/components/release-point-format.js`，并将 `ReleasePointText.jsx` 改为复用该纯格式工具；新增 `web/test/release-point-format.test.mjs` 与本需求文档。所有变更均位于任务范围允许路径，未修改任何消费模块页面、数据库、接口或数据文件。
- 配置与交付影响落实：输入项、交付件、种子、服务端校验、数据库、权限、审计、附件和外网均不适用；既有投产点列表、筛选、详情/编辑和配置页的展示通过 settings 公开组件/标签/选项工厂统一生效。`release_date` 的 `YYYYMMDD` 存储和传输格式未变。
- 测试证据：`node --test web/test/release-point-format.test.mjs` 通过（2 passed），覆盖数值投产点、待定文本、空值和普通日期文本；`npm test --prefix server` 通过（36 passed、1 skipped），`npm run test:api --prefix server` 与 `npm run test:rbac --prefix server` 均通过（各 26 passed、5 skipped）；`npm run build --prefix web`、`node scripts/check-ai-scope.mjs --scope docs/requirements/hengguan/REQ-20260803-008/ai-task-scope.yaml --base origin/main --head HEAD`、`node scripts/check-ui-data-sources.mjs`、`node scripts/check-module-boundaries.mjs`、`node scripts/check-governance.mjs`、`node scripts/check-code-comments.mjs`、`node scripts/verify-app-runtime.mjs` 和 `git diff --check` 均通过。引用审计列出 settings、requirements、tickets、release、overview、dashboard 与顶栏的统一组件消费点，且未发现 `release_date` 使用通用北京日期格式化。
- 已知风险：仅调整投产点显示语义；非八位历史文本保持原样，避免错误解析，但如历史数据存在非标准投产点文本也不会被自动修正。未使用账号凭据，受保护页面的桌面/移动真实浏览器验收未执行。
- 发布验证与回退：部署后以脱敏管理员检查系统设置投产点、顶栏、需求/工单列表、投产详情和概览中的 `20260525` 均无连字符，并确认普通日期仍为 `2026-5-25`；若有回归，回退本需求提交即可，无数据补偿。

## 10. 需求准入

- [x] 核心规则与验收标准无未决项
- [x] 涉密和外网边界明确
- [x] 配置与交付影响已逐项分析，并已记录适用范围或不适用原因
- [x] `requirement_ref`、标题、目录、任务范围、开发者和分支一致
- [x] 主模块为 `modules.yaml` 的单个键；多模块改动与 Owner 审批已记录
- [x] 当前分支、需求编号与任务范围一致
- [x] 所有示例已脱敏
- [x] 互联网 AI 使用许可已明确

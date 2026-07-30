---
document_type: ai_coding_requirement
template_version: "1.0"
requirement_id: "REQ-20260730-004"
requirement_ref: "vvvvx/REQ-20260730-004"
title: "RADAR 交付 Skill 增强"
status: "ready"
priority: "P1"
requester: "项目负责人"
developer: "vvvvx"
module: "governance"
module_owner: "hengguan"
contains_confidential_information: false
external_access_required: false
internet_ai_coding_allowed: true
last_updated: "2026-07-30"
---

# [vvvvx/REQ-20260730-004] RADAR 交付 Skill 增强

## 0. AI 执行约束

- 仅将 `vvvvx-REQ-20260729-01` 中可复用的仓库级交付 Skill、治理检查和运行门禁移植到最新 `main`，并按当前配置目录能力校准说明；不回退或覆盖 `main` 已有的模块依赖、需求命名空间或治理入口。
- Skill 必须反映 `settings/process-configuration` 的现行规则：代码目录是内置字段/交付件基线；配置注册不等于页面渲染；复杂控件以业务 JSX 适配器显式接入；新库种子与旧库幂等升级均需覆盖且不得覆盖管理员配置或软删除意图。
- 本次不新增或调整任何业务输入项、交付件、模板、数据库、接口、权限、审计、附件或外网能力；不得将本 Skill 作为绕过这些既有规则的替代品。

## 1. 目标与业务价值

- 要解决的问题：AI 研发任务缺少可发现、可校验的统一交付流程，且旧 Skill 未覆盖近期统一的输入项与交付件配置目录、配置升级和显式渲染机制。
- 预期结果：仓库提供中文 `radar-delivery-engineer` Skill、可引用的架构/协作/可用性/数据来源/验证资料，以及 CI 中的 Skill、UI 数据源和隔离运行检查。
- 业务价值：减少把配置登记误当成页面实现、把构建通过误报为浏览器验收，以及将可维护数据硬编码在业务页面中的遗漏。

## 2. 使用者与场景

| 使用者 | 触发条件 | 前置条件 | 操作场景 | 完成结果 |
| --- | --- | --- | --- | --- |
| RADAR 开发人员或 AI | 开始实现、修复、重构或评审任务 | 已有 `ready` 需求与任务范围 | 读取 Skill，按用户任务、配置数据源、边界和验证路径实施 | 获得可追溯的设计与验证证据 |
| 审阅者 | 审阅治理或前端改动 | CI 已运行 | 检查 Skill 结构、数据源门禁和应用运行门禁 | 能区分静态、构建、运行与浏览器证据 |

## 3. 范围

### 本次要做

1. 新增仓库级 `radar-delivery-engineer` Skill 及其展示元数据、架构、协作、前端可用性、控件数据来源和验证参考资料。
2. 根据 `REQ-20260730-002` 和 `REQ-20260730-003` 的配置目录实现，补充输入项、交付件、四位置生效、`StageBuiltinField`/标准目录渲染、稳定键和幂等升级说明。
3. 新增 Skill 完整性、UI 数据源和隔离应用运行检查，并接入 CI。
4. 在当前 `AGENTS.md`、模块清单和本需求范围中登记 `.agents/**`，但保留最新 `main` 的入口与模块依赖内容。

### 明确不做

1. 不修改任何业务模块页面、配置定义、交付件定义、模板、迁移、接口、权限、审计或附件实现。
2. 不把 UI 静态检查视为服务端字段校验或配置升级的替代品。
3. 不声称运行门禁等同于真实浏览器的完整用户路径验收。

- [x] 可独立实现
- [x] 可独立测试
- [x] 可独立验收

## 4. 行为与业务规则

| 规则编号 | 触发条件 | 业务规则 | 不满足时处理 |
| --- | --- | --- |
| BR-001 | AI 开始 RADAR 研发任务 | 先读取需求、任务范围、模块边界、公共契约和适用 Skill 资料，再开始修改 | 缺少任何影响正确实现的结论时停止编码 |
| BR-002 | 新增或调整业务字段/交付件 | Skill 要求逐项确认配置注册、列表列、筛选、详情/编辑 JSX 和系统设置；交付件还确认状态规则和模板版本 | 不得仅登记配置或仅添加页面控件就声明完成 |
| BR-003 | 新库或已有环境需要默认配置 | Skill 要求新库种子与按稳定升级 ID/键的旧库幂等补齐；不得覆盖管理员呈现、状态规则、模板或软删除意图 | 缺失兼容策略时不得实施配置定义变更 |
| BR-004 | CI 执行 | Skill 结构、UI 数据源和构建后的隔离运行检查失败即失败 | 输出可定位的修正提示 |
| BR-005 | 报告页面验收 | 构建、服务可达和浏览器验收为不同证据等级 | 无浏览器路径证据不得宣称浏览器已验收 |

## 5A. 配置与交付影响分析

| 项目 | 适用？ | 结论、标识与验证证据 |
| --- | --- | --- |
| 输入项配置注册 | 不适用 | 本次仅新增指导资料和静态检查，不创建或调整任何 `stage_field_definition`；Skill 明确后续业务变更需按范围、稳定键、分区、状态规则、新库种子与旧库升级实施。 |
| 字段四位置生效 | 不适用 | 本次不渲染业务字段；Skill 已更新为要求逐项核对列表、筛选、详情/编辑 JSX（标准字段或 `StageBuiltinField` 业务适配器）和系统设置输入项配置。 |
| 交付件配置注册 | 不适用 | 本次不创建交付件、状态规则或模板；Skill 已更新为要求交付件登记、状态规则、模板版本及旧库补齐，且模板版本只追加。 |
| 种子与 mock 数据 | 不适用 | 不新增业务字段或交付件；Skill 说明适用时必须补齐新库种子、旧库升级和必填字段的 mock。 |
| 服务端字段校验与导入导出 | 不适用 | 不改动业务字段或接口；UI 数据源检查只防止界面硬编码，不能替代服务端校验。 |
| 公共能力或跨模块契约 | 是 | 新增治理模块下的仓库 Skill 和 CI 检查；不改变业务模块公开契约，合并前由治理 Owner 复核。 |
| 数据库与历史数据 | 不适用 | 不新增迁移、不读取或写入业务数据。运行验证使用临时 SQLite 文件并在结束时删除。 |
| 权限、审计、附件、外网 | 不适用 | 不新增受保护业务动作、附件访问或外网入口；运行脚本仅启动本地临时实例。 |

## 6. 权限、审计与外网

- 权限：沿用仓库与 CI 的既有访问控制；不新增业务权限。
- 审计：不新增业务审计事件；CI 日志作为检查记录。
- 外网开放场景、字段、动作、附件限制与禁止项：不涉及。

## 7. 验收与脱敏示例

| 编号 | 类型 | Given | When | Then |
| --- | --- | --- | --- | --- |
| AC-001 | 正常 | AI 开始任意 RADAR 研发任务 | 读取 `radar-delivery-engineer` | 能获得准入、用户任务、数据源、配置、验证和报告流程 |
| AC-002 | 配置 | 后续任务新增内置字段或交付件 | 按 Skill 设计 | 能明确配置范围、稳定键、四位置、显式渲染、种子和旧库升级，且不覆盖管理员配置 |
| AC-003 | 异常 | Skill 文件、元数据或引用资料缺失 | CI 执行 Skill 检查 | CI 失败并给出缺失项 |
| AC-004 | 异常 | 业务/共享前端新增原生选项或受控数据硬编码 | CI 执行 UI 数据源检查 | CI 失败并提示使用配置数据源或公共组件；合规例外必须有原因注释 |
| AC-005 | 运行 | 前端构建完成 | CI 运行隔离应用检查 | 健康接口、SPA 入口、入口资源和客户端路由回退均可访问 |
| AC-006 | 边界 | 仅完成构建或隔离运行检查 | 最终报告 | 不将其表述为完整浏览器用户路径验收 |

## 8. 研发上下文

- 目标模块 / Owner / 基准分支：`governance` / `hengguan` / `origin/main`；工作分支为 `vvvvx/REQ-20260730-004-Skill增强`。
- 受影响模块：仅 `governance`；Skill 引用 settings 的已登记公开能力和规约，不修改 settings 内部实现。
- 必须复用的能力与公开契约：`settings/process-configuration` 的公开 `index.js`，其中包括 `StageBuiltinFields`、`StageBuiltinField`、`StageBuiltinCatalogField`、`StageContentPanel` 和配置升级机制；不得直接依赖 settings 私有持久化实现。
- 数据库迁移、历史数据、SQLite/TDSQL/MySQL 8：不适用。运行检查以随机端口、临时 SQLite 与临时附件目录运行，结束后删除临时目录。
- 必测：Skill、UI 数据源、构建、隔离运行、既有服务端单元/API/RBAC 测试、`git diff --check`；真实浏览器验收仅适用于后续业务页面任务。
- 风险与审批：高风险治理与 CI 变更。UI 检查采用低误报规则且保留具理由的例外注释；治理 Owner `hengguan` 在合并前复核。

## 9. 完成记录

- 修改文件与范围一致性：新增 `.agents/skills/radar-delivery-engineer/**`、三项治理脚本和本需求文档；修改 `AGENTS.md`、`governance/modules.yaml`、CI。所有变更均在任务范围内；未修改业务模块、现有输入项/交付件定义、数据库或附件。
- 配置与交付影响落实：本次没有实际配置注册或交付件改动。Skill 已按当前 `settings/process-configuration` 实现写明：配置目录与稳定键是代码基线，标准字段使用 `StageBuiltinCatalogField`，复杂字段使用 `StageBuiltinField` 业务适配器，扩展字段/交付件使用 `StageContentPanel`；新库种子与旧库升级只补缺失项并保留管理员配置和软删除意图。
- 测试证据：`node scripts/check-repo-skill.mjs`、`node scripts/check-ui-data-sources.mjs`、`node scripts/check-module-boundaries.mjs`、`node scripts/check-governance.mjs`、`git diff --check` 通过；`npm test --prefix server` 为 31 通过、1 个 opt-in 集成套件跳过；`npm run test:api --prefix server` 与 `npm run test:rbac --prefix server` 各 16 通过；`npm run build --prefix web`、`node scripts/verify-app-runtime.mjs`、迁移配对/MySQL 8、代码注释、依赖审计和许可证检查通过。
- 已知风险：UI 数据源检查是低误报静态门禁，确属不可配置的技术常量须以带原因的 `radar-ui-governance-allow` 注释豁免；隔离运行门禁不替代真实浏览器用户路径验收。依赖安装仍报告项目既有的 npm audit 风险，依赖审计基线检查通过。
- 发布验证与回退：合并后 CI 将执行新门禁；后续业务页面任务应按 Skill 补充真实浏览器验收。若门禁引发意外阻断，回退本需求提交即可移除 Skill、脚本和 CI 步骤；不涉及数据库补偿。

## 10. 需求准入

- [x] 核心规则与验收标准无未决项
- [x] 涉密和外网边界明确
- [x] 配置与交付影响已逐项分析，并已记录不适用原因
- [x] `requirement_ref`、标题、目录、任务范围、开发者和分支一致
- [x] 主模块为 `modules.yaml` 的单个键，Owner 审批已记录
- [x] 所有示例已脱敏
- [x] 互联网 AI 使用许可已明确

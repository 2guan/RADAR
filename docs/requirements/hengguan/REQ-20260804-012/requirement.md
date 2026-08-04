---
document_type: ai_coding_requirement
template_version: "1.0"
requirement_id: "REQ-20260804-012"
requirement_ref: "hengguan/REQ-20260804-012"
title: "服务端依赖高危审计修复"
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

# [hengguan/REQ-20260804-012] 服务端依赖高危审计修复

## 0. AI 执行约束

- 仅处理 `npm audit fix` 可在不使用 `--force` 情况下修复的服务端高危依赖链，并只提交实际产生的依赖清单/锁文件变更。
- 不执行 `npm audit fix --force`，不降级 `exceljs`，不修改业务代码、API、数据库、权限、附件或审计基线。
- 不以放宽或更新 `governance/security-audit-baseline.json` 掩盖可修复高危漏洞；中危 `exceljs → uuid` 破坏性修复留在本次范围外。

## 1. 目标与业务价值

- 要解决的问题：GitHub CI 的依赖审计发现服务端 `brace-expansion` 与 `fast-uri` 高危告警，当前高危数为 2，高于已批准基线 1，阻塞所有 PR。
- 预期结果：以兼容的依赖解析更新修复两个高危告警，使 `node scripts/check-dependency-audit.mjs` 通过；保留既有中危项并如实记录。
- 业务价值：恢复 CI 安全门禁，同时避免通过降低基线或引入破坏性依赖降级换取绿灯。

## 2. 使用者与场景

| 使用者 | 触发条件 | 前置条件 | 操作场景 | 完成结果 |
| --- | --- | --- | --- | --- |
| 研发维护人员 | PR 因依赖审计失败 | Node/npm 锁文件可复现安装 | 更新服务端依赖解析并运行回归 | 高危审计不再高于基线，功能与运行门禁保持通过 |

## 3. 范围

### 本次要做

1. 对服务端执行不带 `--force` 的依赖审计修复，仅保留其实际产生的 `package.json` 或 `package-lock.json` 变更。
2. 核对 `brace-expansion`、`fast-uri` 的解析版本已脱离高危公告范围，运行依赖审计、单元、API、RBAC、构建与隔离运行验证。
3. 记录未处理的 `exceljs → uuid` 中危项及其需要破坏性变更的原因。

### 明确不做

1. 不执行 `npm audit fix --force`，不安装 `exceljs@3.4.0` 或其他破坏性版本。
2. 不修改 `governance/security-audit-baseline.json`、应用源代码、数据库迁移、部署镜像或任何运行环境。
3. 不合并、审批或绕过其他 PR 的检查。

- [x] 可独立实现
- [x] 可独立测试
- [x] 可独立验收

## 4. 行为与业务规则

| 规则编号 | 触发条件 | 业务规则 | 不满足时处理 |
| --- | --- | --- | --- |
| BR-001 | 执行依赖修复 | 仅使用不带 `--force` 的 npm 审计修复 | 发生破坏性依赖提议时停止，不写入锁文件 |
| BR-002 | 修复后审计 | 服务端高危数不得高于治理基线，且审计脚本必须通过 | 保留失败并报告具体依赖链，不通过更新基线隐藏 |
| BR-003 | 发现中危 `exceljs → uuid` | 不因修复高危项而降级或破坏性变更 Excel 导出依赖 | 记录为独立后续兼容性评估项 |

## 5A. 配置与交付影响分析

| 项目 | 适用？ | 结论、标识与验证证据 |
| --- | --- | --- |
| 输入项配置注册 | 不适用 | 不改业务字段或页面。 |
| 字段四位置生效 | 不适用 | 不改业务字段或页面。 |
| 交付件配置注册 | 不适用 | 不改交付件定义、模板或预览配置。 |
| 种子与 mock 数据 | 不适用 | 不改种子、mock 或测试业务数据。 |
| 服务端字段校验与导入导出 | 不适用 | 不改 API 或字段校验；Excel 导出仅做回归测试。 |
| 公共能力或跨模块契约 | 适用 | governance 模块的依赖安全交付物与任务文档适用公共变更审批记录；不改应用公开方法、DTO 或模块入口，旧运行时契约保持。 |
| 数据库与历史数据 | 不适用 | 不改 schema、迁移或历史数据。 |
| 权限、审计、附件、外网 | 适用 | 仅依赖供应链安全审计；不改变应用 RBAC、附件与外网能力，执行 API/RBAC 回归。 |

## 6. 权限、审计与外网

| 角色 | 查看/新增/修改/动作 | 数据范围 | 内网/外网 |
| --- | --- | --- | --- |
| 研发维护人员 | 更新受控服务端依赖锁文件 | 代码仓库 | 内网开发环境 |

- 无权限处理：不改变应用权限；依赖更新不涉及用户操作。
- 审计要求：依赖变更由 Git 提交、PR 与 CI 审计可追溯。
- 外网开放场景、字段、动作、附件限制与禁止项：不涉及；npm 审计仅在本地开发环境读取公开依赖公告，不访问生产系统。

## 7. 验收与脱敏示例

| 编号 | 类型 | Given | When | Then |
| --- | --- | --- | --- |
| AC-001 | 安全 | 修复前服务端审计为 2 个 high | 执行不带 `--force` 的审计修复 | `brace-expansion` 与 `fast-uri` 不再以 high 计数，审计基线检查通过 |
| AC-002 | 兼容 | 服务端锁文件更新 | 执行单元、API 与 RBAC 测试 | 测试通过；不改变 API 包装、权限语义或业务数据 |
| AC-003 | 运行 | 前端构建完成 | 执行隔离运行验证 | 健康检查、SPA 入口和客户端路由回退正常 |
| AC-004 | 边界 | `npm audit` 建议对 exceljs 使用 `--force` | 评估依赖修复 | 不执行该破坏性变更；中危项保留并记录 |

## 8. 研发上下文

- 目标模块 / Owner / 基准分支：`governance` / `hengguan` / `origin/main`；分支为 `hengguan/REQ-20260804-012-server-dependency-audit`。此模块登记仓库级依赖安全门禁；服务端锁文件是本次最小依赖解析交付物。
- 允许与禁止修改路径：见 `ai-task-scope.yaml`。
- 必须复用的能力与公开契约：既有 npm 锁文件、`scripts/check-dependency-audit.mjs`、服务端 API/RBAC 测试与应用运行验证；不改变其语义。
- 接口契约：不涉及，既有 `{ code, data, message }`、认证/RBAC 与附件访问语义必须保持。
- 数据库迁移、历史数据、SQLite/TDSQL/MySQL 8 兼容及回退：不涉及；回退为恢复修复前的锁文件提交。
- 必须执行的测试：`node scripts/check-dependency-audit.mjs`、`npm test --prefix server`、`npm run test:api --prefix server`、`npm run test:rbac --prefix server`、`npm run build --prefix web`、`node scripts/verify-app-runtime.mjs`、治理/模块边界/范围/空白检查。
- 风险、审批与未决问题：风险为 important；依赖解析可能影响服务端启动或 Excel 导出，故需完整回归。中危 exceljs 链需要破坏性修复，已明确排除。

## 9. 完成记录

- 修改文件与范围一致性：仅新增本需求目录并更新 `server/package-lock.json`；未修改 `server/package.json`、应用源代码、审计基线、数据库、部署配置或既有未跟踪的 `docs/reports/`。
- 配置与交付影响落实：输入项、字段四位置、交付件、种子/mock、字段校验、数据库均不适用；governance 依赖安全交付物适用公共变更审批记录，但不改变任何公开运行时/API 契约；API/RBAC 回归证明权限、附件和外网语义未改变。
- 测试证据：`npm audit fix --prefix server`（未使用 `--force`）将 `brace-expansion` 升级到 1.1.18、2.1.4、5.0.9，将 `fast-uri` 升级到 3.1.5、4.1.2；`node scripts/check-dependency-audit.mjs` 通过（server：0 high、1 moderate；web：0 high、3 moderate）；`npm test --prefix server` 为 38 通过、1 跳过；`npm run test:api --prefix server` 与 `npm run test:rbac --prefix server` 均为 30 通过、5 跳过；`npm run build --prefix web`、`node scripts/verify-app-runtime.mjs`、`node scripts/check-governance.mjs`、`node scripts/check-module-boundaries.mjs`、范围检查和空白检查均通过。
- 已知风险：`exceljs@4.4.0 → uuid` 仍有 1 个服务端中危及 2 个 web 中危依赖审计告警；npm 仅建议通过 `npm audit fix --force` 降级到 `exceljs@3.4.0` 才能处理，该方式具备破坏性且已明确不执行。审计基线未被放宽，仍需在到期日前进行独立兼容性评估。
- 发布验证与回退：发布仅更新服务端锁文件；部署构建应使用更新后的 `server/package-lock.json` 重建依赖。若出现兼容问题，回退本提交即可恢复旧解析树；无数据库补偿或数据回退。

## 10. 需求准入

- [x] 核心规则与验收标准无未决项
- [x] 涉密和外网边界明确
- [x] 配置与交付影响已逐项分析，并已记录适用范围或不适用原因
- [x] `requirement_ref`、标题、目录、任务范围、开发者和分支一致
- [x] 主模块为 `modules.yaml` 的单个键；多模块改动与 Owner 审批已记录
- [x] 当前分支、需求编号与任务范围一致
- [x] 所有示例已脱敏
- [x] 互联网 AI 使用许可已明确

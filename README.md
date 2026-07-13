<!--
文件：README.md
用途：完整说明 RADAR 项目的业务目标、功能模块、技术架构、数据模型、部署方式与维护约定。
作者：hengguan
-->

# RADAR · 日常需求研发流程管理

> **R**equirement **A**gile **D**elivery & **A**cceleration **R**esource

RADAR 是一套面向金融研发协同场景的常规投产版本全生命周期流程管控平台。系统以「投产版本/投产点」为主线，将需求、工单、开发任务、测试任务、问题、投产申请、投产审批和过程留痕统一到同一个可追踪工作台中，目标是让业务、开发、测试、运维、项目管理和评审会签角色在一个平台内完成日常交付协同。

平台当前的核心工作项包括两类：

- **需求**：由业务或管理人员录入，进入需求分析、开发、测试、投产链路。
- **工单**：由问题或外部工单转化而来，进入工单分析、开发、测试、投产链路。工单与需求共享后续研发交付链路，但拥有独立编号、独立状态、独立类型和独立管理页面。

平台同时支持外部 PAMS 问题同步。问题本身不在本系统内编辑，但可以被投产申请引用，并进入投产审批、会签和导出评审单流程。

---

## 目录

- [项目定位](#项目定位)
- [适用角色](#适用角色)
- [业务主线](#业务主线)
- [功能模块](#功能模块)
- [关键业务规则](#关键业务规则)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [目录结构](#目录结构)
- [数据模型](#数据模型)
- [权限模型](#权限模型)
- [安全机制](#安全机制)
- [本地开发](#本地开发)
- [环境变量](#环境变量)
- [生产部署](#生产部署)
- [数据库与迁移](#数据库与迁移)
- [导入导出](#导入导出)
- [演示数据](#演示数据)

---

## 项目定位

RADAR 解决的是日常研发交付中「工作项分散、状态不可见、跨角色协同依赖人工追问、投产评审材料不可追溯」的问题。

系统将以下信息统一归档：

- 需求与工单的提出、分析、负责人、涉及系统、计划投产点。
- 开发任务的系统拆分、负责人、计划时间、实际时间、排期偏差率和阶段附件。
- 测试任务的 SIT、UAT、NFT、SEC 四类测试状态、负责人、实施系统和阶段附件。
- PAMS 问题同步后的问题概述、明细、状态、系统、工单号和处理信息。
- 投产申请中的变更编号、变更系统、影响范围、交付制品、摆渡状态、关联需求/工单/问题。
- 投产审批中的评审状态、会签进度、电子签名、投产状态和 Word 评审单。
- 所有关键写操作的字段级变更历史。

系统强调三点：

1. **投产点视角**：默认围绕当前或指定投产窗口查看所有工作项。
2. **全链路视角**：从需求/工单/问题进入开发、测试、投产，不割裂地看阶段。
3. **可追溯视角**：字段变更、附件、路径、会签意见、签名和导出材料均可追溯。

---

## 适用角色

平台面向云南农信与建信金科协同研发团队，以及参与日常投产管理的实施、运维、项目和评审人员。

内置角色包括：

| 角色 | 典型职责 |
| --- | --- |
| 金科业务、农信业务 | 维护需求/工单业务信息，查看交付进展，参与需求确认 |
| 金科开发、农信开发 | 承接开发任务，维护开发状态、计划/实际时间、开发附件 |
| 金科测试、农信测试 | 承接 SIT/UAT/NFT/SEC 测试任务，维护测试状态、计划/实际时间、测试附件 |
| 金科运维、农信运维 | 关注投产申请、投产审批、制品和上线状态 |
| 安全负责人 | 投产评审会签角色之一 |
| 架构负责人 | 投产评审会签角色之一 |
| 机构负责人 | 投产评审会签角色之一 |
| 项目负责人 | 投产评审会签角色之一 |
| 测试负责人 | 投产评审会签角色之一 |
| 配置负责人 | 投产评审会签角色之一 |
| 管理员 | 维护人员、角色、权限、字典、系统、投产点和平台配置 |
| 超级管理员 | 拥有全部权限，主要用于初始化和紧急维护 |

用户支持一人多角色。后端按多个角色的权限并集判定，前端菜单和按钮也按权限动态显示。

---

## 业务主线

### 需求交付链路

```text
需求登记
  -> 需求分析
  -> 分析完成
  -> 开发承接
  -> 开发设计/开发实施/单元测试
  -> 开发完成
  -> 测试承接
  -> 测试方案/测试实施/测试报告
  -> 测试完成
  -> 投产申请
  -> 投产审批
  -> 评审会签
  -> 已上线
```

### 工单交付链路

```text
工单登记
  -> 工单分析
  -> 分析完成
  -> 开发承接
  -> 测试承接
  -> 投产申请
  -> 投产审批
  -> 评审会签
  -> 已上线
```

工单和需求在分析阶段之前分开管理，在开发、测试、投产阶段共享任务表和审批流程。开发任务、测试任务表中的 `req_code` 字段实际表示「关联需求/工单编号」。

### 问题投产链路

```text
PAMS 同步问题
  -> 投产申请引用问题编号
  -> 投产审批展开问题
  -> 评审会签
  -> 已上线
```

问题不走开发/测试承接，但可以通过投产申请进入审批和会签。

### 投产申请与投产审批的关系

投产申请是变更单视角，记录变更编号、变更系统、交付制品和关联工作项。投产审批是审批对象视角，从投产申请的 `ref_codes` 中展开每一个需求、工单或问题，逐条生成审批清单。

投产审批详情在首次打开时会惰性创建投产任务和 6 个会签项。这样可以先准备投产申请，再按审批对象逐条补充负责人、投产状态、评审意见和签名。

---

## 功能模块

### 效能仪表盘

路径：`/dashboard`

效能仪表盘提供投产窗口维度下的统计与自定义分析能力。

主要能力：

- 原子指标卡：需求、工单、开发、SIT、UAT、投产申请/制品等总量与终态数量。
- 自定义图表：支持柱状图、面积图、饼图和透视表。
- 数据源：需求、工单、开发、SIT、UAT、NFT、SEC、投产系统/制品，以及混合数据源。
- 维度聚合：按状态、系统、机构、负责人、投产点等维度分组。
- 局部过滤：图表内部可设置筛选条件。
- 分组归并：可将多个维度值归并为同一展示组。
- 图表钻取：点击图表元素可查看底层记录列表。
- 图表范围：支持个人图表和系统图表。系统图表需要 `dashboard:manage` 权限维护。

相关后端模块：

- [server/src/modules/dashboard/routes.js](server/src/modules/dashboard/routes.js)
- [server/src/lib/chart-dims.js](server/src/lib/chart-dims.js)

### 版本概览

路径：`/overview`

版本概览是日常查看进展的核心页面。它按实施机构聚合当前投产窗口下的需求、工单和投产申请关联的问题，并展示每个工作项在全链路中的当前位置。

主要能力：

- 默认按当前投产点或所选投产点过滤。
- 需求、工单混排展示，问题卡片也可纳入投产视角。
- 按实施机构分组，实施机构取值优先级为：
  1. 主责系统对应开发任务的开发实施方。
  2. 第一个主责系统在系统清单中的所属机构。
  3. 未分配机构。
- 链路节点展示：需求/工单、开发、SIT、NFT、SEC、UAT、投产。
- NFT 和 SEC 为按需阶段，仅有任务时展示。
- 支持按投产点、编号、内容、实施机构、当前阶段、任务状态、主责系统、协同系统筛选。
- 支持打开 5 层全生命周期详情。
- 支持查看全流程变更历史。
- 支持导出版本概览宽表。

相关后端模块：

- [server/src/modules/overview/routes.js](server/src/modules/overview/routes.js)

### 需求分析

路径：`/requirements`

需求分析用于登记和维护普通研发需求。

主要字段：

- 需求编号：默认按 `RC_{投产窗口}_{序号}` 规则生成，也支持页面内校验唯一性。
- 需求标题、需求概述、需求状态、需求类型。
- 是否涉账。
- 提出部门、提出人、云南农信业务负责人、建信金科业务负责人、提出时间。
- 计划投产点。
- 主责系统、协同改造系统、协同测试系统。
- 关联问题/工单编号。
- 需求说明书附件。

主要能力：

- 新增、编辑、删除、导入、导出。
- 默认按当前投产窗口过滤。
- 已关联开发或测试任务后，需求编号不可修改，需求不可删除。
- 状态进入终态时至少需要 1 个主责系统。
- 字段级变更自动写入过程留痕。
- 导入时支持跳过、覆盖和回滚模式。
- 导入时可按系统编号或系统名称解析系统字段，可按投产日期匹配投产点。

相关后端模块：

- [server/src/modules/requirements/routes.js](server/src/modules/requirements/routes.js)

### 工单分析

路径：`/tickets`

工单分析是近期新增并已接入全链路的模块。它用于承接来自问题系统或外部工单口径的工作项，独立于需求编号体系，但与需求共享后续开发、测试和投产能力。

主要字段：

- 工单编号：默认按 `TK_{投产窗口}_{序号}` 规则生成，也支持手动编号和唯一性校验。
- 工单概述、工单详情、工单状态、工单类型。
- 是否涉账。
- 提出部门、提出人、云南农信工单负责人、建信金科工单负责人、提出时间。
- 计划投产点。
- 主责系统、协同改造系统、协同测试系统。
- 关联问题/工单编号。

主要能力：

- 新增、编辑、删除、导入、导出。
- 默认按当前投产窗口过滤。
- 工单编号输入框可按问题编号或 PAMS 工单号联想查询，并回填问题摘要、详情、分类和系统。
- 已关联开发或测试任务后，工单编号不可修改，工单不可删除。
- 状态进入终态时至少需要 1 个主责系统。
- 工单可被开发承接、测试承接、投产申请引用、投产审批展开。
- 工单状态、类型、必填项均有独立配置。

相关后端模块：

- [server/src/modules/tickets/routes.js](server/src/modules/tickets/routes.js)
- [web/src/pages/Tickets.jsx](web/src/pages/Tickets.jsx)
- [web/src/components/editors/TicketEditor.jsx](web/src/components/editors/TicketEditor.jsx)

### 开发管理

路径：`/dev`

开发管理负责把需求或工单拆分成具体开发任务。

主要字段：

- 关联需求/工单编号。
- 开发任务编号：默认按 `RW_{需求编号}_{序号}` 生成。
- 开发任务名称、开发内容概述、开发状态。
- 开发负责人、开发实施系统、开发实施方。
- 计划开始、计划结束、实际开始、实际结束。
- 排期偏差率。
- 阶段附件：概要设计、详细设计、代码走查、单元测试报告、影响性分析文档。

主要能力：

- 开发承接预览：按主责系统和协同改造系统生成待建任务清单。
- 开发承接：默认对尚未建立开发任务的系统补建任务，避免重复承接。
- 编辑、删除、导入、导出。
- 关联需求/工单可以来自 `requirement` 或 `ticket`。
- 任务详情返回关联工作项类型和标题，便于页面跳转。
- 状态进入终态时计划/实际起止时间必填。
- 保存时自动重算排期偏差率。

相关后端模块：

- [server/src/modules/dev-tasks/routes.js](server/src/modules/dev-tasks/routes.js)

### 测试管理

路径：

- `/test/sit`：应用组装测试
- `/test/uat`：用户测试
- `/test/nft`：非功能测试
- `/test/sec`：安全测试

四类测试共用 `test_task` 表，通过 `test_type` 区分。

主要字段：

- 关联需求/工单编号。
- 测试任务编号：默认按 `{测试类型}_{需求编号}_{序号}` 生成。
- 测试任务名称、测试类型、测试状态。
- 测试负责人、测试实施系统、测试实施方、实施机构。
- 计划开始、计划结束、实际开始、实际结束。
- 排期偏差率。
- 阶段附件：测试方案、测试报告；SIT 导出时还包含测试覆盖设计文档。

主要能力：

- 测试承接预览。
- 测试承接支持两种模式：
  - 整体测试：按工作项创建一条测试任务。
  - 按系统拆分：按主责系统和协同测试系统创建多条任务。
- NFT 和 SEC 按需承接，不承接则不出现在版本概览链路中。
- 编辑、删除、导入、导出。
- 状态进入终态时计划/实际起止时间必填。
- 保存时自动重算排期偏差率。
- 测试详情会返回同一工作项下的开发任务摘要，便于联动查看。

相关后端模块：

- [server/src/modules/test-tasks/routes.js](server/src/modules/test-tasks/routes.js)

### 投产申请

路径：`/release/apply`

投产申请用于维护版本变更申请单，记录变更编号、变更系统、影响范围、交付制品和关联工作项。

主要字段：

- 变更编号：默认按 `{版本年月}-10bg{序号}` 生成。
- 计划投产点。
- 变更系统、实施机构。
- 变更内容、影响范围。
- 关联需求/工单/问题编号。
- 变更负责部门：输出口径、部署口径。
- 交付制品数组：
  - 制品类型：镜像制品、二进制制品、介质库文件、无制品。
  - 交付单元名称。
  - 新版本号。
  - 摆渡状态：未摆渡、待发送、已摆渡、摆渡失败。

主要能力：

- 新增、编辑、删除、导入、导出。
- 支持一张投产申请关联多个需求、工单或问题。
- 评审状态由所关联工作项在投产审批中的评审状态派生，取最弱状态。
- 交付制品支持多组维护。
- 必填字段可在系统设置中配置。
- 投产审批清单来源于投产申请的关联编号。

相关后端模块：

- [server/src/modules/release-apply/routes.js](server/src/modules/release-apply/routes.js)

### 投产审批

路径：`/release`

投产审批按投产申请中的关联编号展开，每个需求、工单或问题都是一条审批对象。

主要能力：

- 列表展示：实施机构、变更编号、审批对象编号、对象类型、标题、计划投产点、投产状态、评审状态、会签进度。
- 首次打开详情时自动创建投产任务和 6 个会签项。
- 支持维护投产负责人、投产状态、评审状态。
- 会签角色：安全负责人、架构负责人、机构负责人、项目负责人、测试负责人、配置负责人。
- 会签结果：未签署、已签署、已驳回。
- 非超级管理员只能签署自己拥有的会签角色。
- 任一会签驳回时评审状态变为评审拒绝；全部签署时变为评审同意。
- 评审撤销、应急审批为手动状态，不被自动重算覆盖。
- 支持电子签名。
- 支持导出单条 Word 评审单。
- 支持导出投产审批清单。
- 详情中会展示关联制品情况，即引用该编号的投产申请及交付制品。

相关后端模块：

- [server/src/modules/release/routes.js](server/src/modules/release/routes.js)
- [server/src/lib/release-word.js](server/src/lib/release-word.js)
- [server/src/modules/signatures/routes.js](server/src/modules/signatures/routes.js)

### 问题管理

路径：`/issues`

问题管理用于同步和展示外部 PAMS 问题数据。本平台不提供问题新增或编辑，只提供同步、详情展示和清空本地问题数据。

主要能力：

- 同步问题概述列表，按 `issue_code` upsert。
- 同步问题详情，可同步指定问题或全部问题。
- 后台详情同步，前端轮询进度。
- 支持查看问题详情：分类、系统、模块、业务组、紧急程度、轮次、问题描述、处理信息、关联案例、标签等。
- 支持清空本地问题数据。后台同步运行中禁止清空。
- 问题可以被工单联想引用，也可以被投产申请直接引用。

相关配置：

- `PAMS_BASE_URL`
- `PAMS_API_KEY`
- `PAMS_TIMEOUT`

相关后端模块：

- [server/src/modules/issues/routes.js](server/src/modules/issues/routes.js)
- [server/src/lib/pams.js](server/src/lib/pams.js)

### 人员管理

路径：`/users`

人员管理用于维护登录账号、姓名、机构、角色、状态和密码。

主要能力：

- 用户新增、编辑、删除、导入、导出。
- 用户启用/停用。
- 一人多角色。
- 账号解锁。
- 重置密码。
- 活跃用户搜索，用于负责人、提出人、会签人等选择器。

相关后端模块：

- [server/src/modules/users/routes.js](server/src/modules/users/routes.js)

### 系统设置

路径：`/settings`

系统设置包含多个基础配置区：

- 平台配置：平台名称、简称、版权、主题色、编号规则等。
- 字典配置：流程状态、需求类型、工单类型、版本类型、投产状态、评审状态、制品类型、摆渡状态、机构、部门、板块等。
- 所属系统：系统编号、系统名称、所属机构、所属板块、外联部门、投产部门。
- 投产点：投产日期/窗口、版本类型、备注、默认投产点、归档状态。
- 角色与权限：角色维护、权限矩阵维护、默认首页、默认主题。
- 必填项矩阵：按模块和状态类型配置字段是否必填。
- 附件输入模式：对附件字段配置「上传文档」「填写路径」「都可以」。
- 外观设置：主题预设和界面展示配置。

相关后端模块：

- [server/src/modules/settings/routes.js](server/src/modules/settings/routes.js)
- [server/src/modules/dict/routes.js](server/src/modules/dict/routes.js)
- [server/src/modules/systems/routes.js](server/src/modules/systems/routes.js)
- [server/src/modules/release-points/routes.js](server/src/modules/release-points/routes.js)
- [server/src/modules/roles/routes.js](server/src/modules/roles/routes.js)

---

## 关键业务规则

### 当前投产窗口

多数列表默认按当前投产窗口过滤。当前窗口由前端全局状态传入，也可由投产点选择器手动切换。投产点支持默认投产点和「投产点待定」内置窗口。

相关工具：

- [server/src/lib/window.js](server/src/lib/window.js)
- [web/src/stores/app.js](web/src/stores/app.js)

### 编号规则

编号规则存储在 `app_config` 中，可在系统设置中维护。

| 对象 | 默认规则 |
| --- | --- |
| 需求编号 | `RC_{投产窗口}_{序号}` |
| 工单编号 | `TK_{投产窗口}_{序号}` |
| 开发任务编号 | `RW_{需求编号}_{序号}` |
| SIT 测试任务编号 | `SIT_{需求编号}_{序号}` |
| UAT 测试任务编号 | `UAT_{需求编号}_{序号}` |
| NFT 测试任务编号 | `NFT_{需求编号}_{序号}` |
| SEC 测试任务编号 | `SEC_{需求编号}_{序号}` |
| 投产申请变更编号 | `{版本年月}-10bg{序号}` |

编号生成在事务内完成，避免并发提交时产生重复编号。

相关工具：

- [server/src/lib/code-gen.js](server/src/lib/code-gen.js)

### 终态校验

流程状态来自 `dict_item` 的 `process_status` 字典，`extra` 中包含阶段和状态类型。

典型终态校验：

- 需求或工单进入分析完成时，必须至少有 1 个主责系统。
- 开发任务进入开发完成时，计划开始、计划结束、实际开始、实际结束均必填。
- 测试任务进入测试完成时，计划开始、计划结束、实际开始、实际结束均必填。
- 必填项矩阵中配置为终态必填的字段，也会在后端保存时校验。

相关工具：

- [server/src/lib/status.js](server/src/lib/status.js)
- [server/src/lib/required-fields.js](server/src/lib/required-fields.js)

### 排期偏差率

开发和测试任务保存时自动计算排期偏差率。

计算逻辑：

```text
round((实际结束日期 - 计划结束日期) / max(计划结束日期 - 计划开始日期, 1 天) * 100)
```

含义：

- 正数：延期。
- 负数：提前。
- `null`：计划或实际信息不完整，无法计算。

相关工具：

- [server/src/lib/deviation.js](server/src/lib/deviation.js)

### 过程留痕

需求、工单、开发、测试、投产申请、投产审批和附件相关写操作会写入 `audit_log`。

留痕内容包括：

- 实体类型。
- 实体编号。
- 操作类型。
- 操作人。
- 字段中文名。
- 修改前值。
- 修改后值。
- 创建时间。

相关工具：

- [server/src/lib/audit.js](server/src/lib/audit.js)
- [server/src/modules/audit/routes.js](server/src/modules/audit/routes.js)

### 附件与路径

附件表支持两种形式：

- `file`：上传文件，保存到 `ATTACHMENT_DIR`。
- `path`：登记外部路径或介质路径。

上传会校验：

- 文件大小。
- 扩展名白名单。
- 当前业务状态下该附件字段是否允许上传文件或填写路径。

相关模块：

- [server/src/modules/attachments/routes.js](server/src/modules/attachments/routes.js)
- [server/src/lib/attachment.js](server/src/lib/attachment.js)

### 电子签名

用户可以保存电子签名，并设为默认签名。投产评审会签时可选择自己的签名，会签详情和 Word 评审单中会展示签名图片。

相关模块：

- [server/src/modules/signatures/routes.js](server/src/modules/signatures/routes.js)
- [server/src/lib/signature.js](server/src/lib/signature.js)

---

## 技术栈

### 后端

- Node.js 22.5 及以上，推荐使用 Node.js 22 LTS 或更高版本。
- ESM 模块体系。
- Fastify 5。
- `node:sqlite` 原生 SQLite 同步 API。
- `mysql2/promise`，用于 TDSQL MySQL 兼容版。
- `@fastify/jwt`，用于 JWT 登录态。
- `@fastify/helmet`，用于安全响应头和 CSP。
- `@fastify/cors`，用于跨域控制。
- `@fastify/rate-limit`，用于限流。
- `@fastify/multipart`，用于文件上传。
- `@fastify/compress`，用于 gzip/deflate 压缩。
- `@fastify/static`，用于生产模式托管前端静态资源。
- `exceljs`，用于 Excel 导入导出。
- `docx`，用于 Word 评审单导出。

### 前端

- React 18。
- Vite 5。
- Ant Design 5。
- ECharts + echarts-for-react。
- zustand。
- react-router-dom 6。
- axios。
- dayjs。

### 部署

- Docker 多阶段构建。
- Docker Compose 单服务部署。
- 后端在生产模式下同时提供 API 和前端静态页面。
- 数据库与附件目录通过 volume 挂载持久化。

---

## 系统架构

```text
浏览器
  React + Ant Design + ECharts
  HashRouter
  Axios API Client
        |
        | HTTP /api，JWT Bearer，统一响应 { code, data, message }
        v
Fastify
  app.js
    - compress
    - helmet / CSP
    - cors
    - rate-limit
    - multipart
    - auth plugin
    - CSRF 自定义头校验
    - 全局错误处理
    - /api 业务路由
    - 生产静态资源托管
        |
        v
业务模块
  auth / dict / systems / release-points / roles / users / settings
  requirements / tickets / issues
  dev-tasks / test-tasks
  release-apply / release / signatures
  attachments / audit / overview / dashboard
        |
        v
通用库
  query / crud / audit / code-gen / status / required-fields
  deviation / attachment / excel / pams / work-items / resolver
        |
        v
数据库统一入口
  db/index.js
    - SQLite provider
    - TDSQL provider
    - dialect abstraction
        |
        v
SQLite data/radar.db 或 TDSQL MySQL 兼容库
附件目录 attachments/
```

### 请求响应约定

后端统一响应结构：

```json
{
  "code": 0,
  "data": {},
  "message": "ok"
}
```

前端 [web/src/api/client.js](web/src/api/client.js) 会自动解包 `data`，自动注入 JWT，并在 401 时跳转登录页。

### 路由注册

所有业务路由统一挂载在 `/api` 前缀下。

健康检查：

```text
GET /api/health
```

---

## 目录结构

```text
RADAR/
├─ server/                              # Fastify 后端
│  ├─ package.json
│  ├─ scripts/                          # 数据库迁移、TDSQL 备份恢复脚本
│  │  ├─ sqlite-to-tdsql.js
│  │  ├─ tdsql-dump.js
│  │  └─ tdsql-restore.js
│  ├─ test/                             # node:test 测试
│  └─ src/
│     ├─ server.js                      # 入口：迁移、种子、启动、优雅退出
│     ├─ app.js                         # Fastify 装配、插件、路由、静态资源
│     ├─ config.js                      # 环境变量和运行配置
│     ├─ db/
│     │  ├─ index.js                    # 统一数据库入口
│     │  ├─ migrate.js                  # 迁移执行器
│     │  ├─ seed.js                     # 幂等种子数据
│     │  ├─ mock.js                     # 演示数据生成
│     │  ├─ dialects/                   # SQLite/TDSQL 方言差异封装
│     │  ├─ providers/                  # SQLite/TDSQL provider
│     │  └─ migrations/                 # SQLite 迁移和 TDSQL 初始化脚本
│     ├─ lib/                           # 通用业务库
│     ├─ plugins/
│     │  └─ auth.js                     # JWT + RBAC
│     └─ modules/                       # 业务模块路由
│        ├─ auth/
│        ├─ dict/
│        ├─ systems/
│        ├─ release-points/
│        ├─ roles/
│        ├─ users/
│        ├─ settings/
│        ├─ requirements/
│        ├─ tickets/
│        ├─ issues/
│        ├─ dev-tasks/
│        ├─ test-tasks/
│        ├─ release-apply/
│        ├─ release/
│        ├─ signatures/
│        ├─ attachments/
│        ├─ audit/
│        ├─ overview/
│        └─ dashboard/
│
├─ web/                                 # React 前端
│  ├─ package.json
│  ├─ vite.config.js
│  ├─ index.html
│  ├─ public/fonts/inter/               # 字体资源
│  └─ src/
│     ├─ main.jsx                       # 前端入口
│     ├─ app.jsx                        # 根组件和路由
│     ├─ api/client.js                  # API 客户端
│     ├─ stores/app.js                  # 全局状态
│     ├─ layout/MainLayout.jsx          # 主布局
│     ├─ router/
│     │  ├─ menu.js                     # 菜单与权限模块映射
│     │  └─ detailLinks.js              # 详情链接映射
│     ├─ pages/                         # 页面级组件
│     │  ├─ Dashboard.jsx
│     │  ├─ Overview.jsx
│     │  ├─ Requirements.jsx
│     │  ├─ Tickets.jsx
│     │  ├─ DevTasks.jsx
│     │  ├─ TestTasks.jsx
│     │  ├─ ReleaseApply.jsx
│     │  ├─ Release.jsx
│     │  ├─ Issues.jsx
│     │  ├─ Users.jsx
│     │  ├─ Settings.jsx
│     │  ├─ DetailPages.jsx
│     │  └─ Login.jsx
│     ├─ components/                    # 通用组件
│     │  ├─ DataTable.jsx
│     │  ├─ FilterPanel.jsx
│     │  ├─ CrudManager.jsx
│     │  ├─ Can.jsx
│     │  ├─ DictSelect.jsx
│     │  ├─ SystemSelect.jsx
│     │  ├─ PersonPicker.jsx
│     │  ├─ AttachmentField.jsx
│     │  ├─ HistoryDrawer.jsx
│     │  ├─ StatusBadge.jsx
│     │  ├─ ChainBar.jsx
│     │  ├─ SignaturePad.jsx
│     │  ├─ PermissionMatrix.jsx
│     │  ├─ RequiredFieldMatrix.jsx
│     │  ├─ dashboard/                  # 图表编辑、图表渲染、透视表
│     │  └─ editors/                    # 详情编辑器
│     ├─ hooks/                         # 响应式、必填项、默认状态等 hook
│     ├─ utils/                         # 时间、下载上传工具
│     ├─ theme/presets.js               # 主题预设
│     └─ styles.css                     # 全局样式
│
├─ data/                                # SQLite 数据库目录，本地运行时生成
├─ attachments/                         # 附件目录，本地运行时生成
├─ Dockerfile                           # 多阶段镜像构建
├─ docker-compose.yml                   # 单服务部署编排
├─ .env.example                         # 环境变量模板
├─ package.json                         # 根目录并行启动脚本
├─ PRODUCT.md                           # 产品定位
├─ DESIGN.md                            # 设计系统
├─ AI-GUIDE.md                          # 协作说明
├─ MIGRATION.md                         # 迁移说明
├─ DASHBOARD-PLAN.md                    # 仪表盘规划记录
└─ README.md
```

---

## 数据模型

### 核心表

| 表 | 说明 |
| --- | --- |
| `app_config` | 平台配置、编号规则、主题、安全策略、必填项配置 |
| `dict_item` | 通用字典，包含流程状态、类型、机构、板块、评审状态等 |
| `system` | 所属系统清单，包含系统编号、名称、机构、板块、外联部门、投产部门 |
| `role` | 角色，含内置标识、会签角色标识、默认首页、默认主题 |
| `permission` | 权限矩阵，角色 × 模块 × 操作 |
| `user` | 用户账号，含密码哈希、状态、锁定与密码过期字段 |
| `user_role` | 用户和角色的多对多关系 |
| `release_point` | 投产点/投产窗口 |
| `requirement` | 需求分析主表 |
| `ticket` | 工单分析主表 |
| `dev_task` | 开发任务 |
| `test_task` | 测试任务，SIT/UAT/NFT/SEC 共表 |
| `issue` | 外部问题同步表 |
| `release_apply` | 投产申请/版本变更申请 |
| `release_task` | 投产审批任务，编号可对应需求、工单或问题 |
| `release_system` | 历史投产系统明细表，当前投产详情主要展示关联制品情况 |
| `release_signoff` | 投产评审会签项 |
| `attachment` | 附件和路径记录 |
| `audit_log` | 字段级过程留痕 |
| `saved_filter` | 用户保存的筛选条件 |
| `dashboard_chart` | 仪表盘图表配置 |
| `user_signature` | 用户电子签名 |
| `login_fail_tracker` | 登录失败跟踪，辅助账号锁定 |

### JSON 字段

项目同时支持 SQLite 和 TDSQL。为保持兼容，部分数组或结构化字段以 JSON 存储。

典型 JSON 字段：

- `requirement.proposer`
- `requirement.main_systems`
- `requirement.collab_dev_systems`
- `requirement.collab_test_systems`
- `ticket.proposer`
- `ticket.main_systems`
- `ticket.collab_dev_systems`
- `ticket.collab_test_systems`
- `release_apply.ref_codes`
- `release_apply.delivery_units`
- `dashboard_chart.config`
- `saved_filter.payload`
- `dict_item.extra`
- `issue.analysis_log`
- `issue.tags`
- `issue.linked_cases`

### 迁移版本

SQLite 迁移位于 [server/src/db/migrations](server/src/db/migrations)。

当前迁移序列：

| 版本 | 说明 |
| --- | --- |
| `0001_init.sql` | 初始表结构 |
| `0002_signoff_role.sql` | 角色增加会签角色标识 |
| `0003_dashboard_charts_v2.sql` | 仪表盘图表扩展 |
| `0004_perf_indexes.sql` | 性能索引 |
| `0005_security_hardening.sql` | 用户安全字段 |
| `0006_role_default_theme.sql` | 角色默认主题 |
| `0007_fix_role_default_theme.sql` | 默认主题修正 |
| `0008_issue.sql` | 问题管理 |
| `0009_release_review_status.sql` | 投产评审状态 |
| `0010_release_apply.sql` | 投产申请 |
| `0011_release_task_entity.sql` | 投产任务实体类型扩展 |
| `0012_release_apply_delivery_units.sql` | 投产申请多交付制品 |
| `0013_signature.sql` | 用户电子签名 |
| `0014_requirement_issue_no.sql` | 需求关联问题/工单编号 |
| `0015_proposer_to_array.sql` | 提出人字段转数组 |
| `0016_login_fail_tracker.sql` | 登录失败跟踪 |
| `0017_ticket_analysis.sql` | 工单分析主表，开发/测试关联编号泛化 |
| `0018_accounting_and_stage_attachments.sql` | 是否涉账字段 |
| `0019_system_change_depts.sql` | 系统外联部门和投产部门 |
| `0020_default_pending_release_point.sql` | 内置投产点待定 |
| `0021_clear_default_attachment_required.sql` | 清理旧附件必填默认值 |

TDSQL 初始化脚本位于 [server/src/db/migrations/tdsql/0001_init.sql](server/src/db/migrations/tdsql/0001_init.sql)，包含当前完整结构。

---

## 权限模型

权限目录位于 [server/src/lib/perm-catalog.js](server/src/lib/perm-catalog.js)。

权限由三层共同控制：

1. 后端路由使用 `fastify.requirePerm(module, action)` 强制校验。
2. 前端菜单根据模块 `view` 权限过滤。
3. 前端按钮使用 `<Can module="..." action="...">` 控制显示。

超级管理员 `is_super=1` 跳过权限校验。

### 权限模块

| 模块键 | 中文模块 | 主要操作 |
| --- | --- | --- |
| `dashboard` | 效能仪表盘 | 查看、管理系统图表 |
| `overview` | 版本概览 | 查看 |
| `requirement` | 需求分析 | 查看、新增、编辑、删除、导入、导出 |
| `ticket` | 工单分析 | 查看、新增、编辑、删除、导入、导出 |
| `issue` | 问题管理 | 查看、同步、清空 |
| `dev` | 开发管理 | 查看、新增、编辑、删除、承接开发、导入、导出 |
| `test` | 测试管理 | 查看、新增、编辑、删除、承接测试、导入、导出 |
| `release_apply` | 投产申请 | 查看、新增、编辑、删除、导入、导出 |
| `release` | 投产审批 | 查看、编辑、评审会签、投产登记、导出 |
| `user` | 人员管理 | 查看、新增、编辑、删除、导入、导出 |
| `settings` | 系统设置 | 查看、新增、编辑、删除、导入、导出、编辑权限矩阵 |

### 鉴权流程

1. 登录接口校验验证码、账号状态、密码和锁定状态。
2. 登录成功后签发 JWT。
3. 前端将 JWT 放入后续请求的 `Authorization: Bearer <token>`。
4. 后端解析 JWT，查询当前用户、状态和密码有效期。
5. 权限守卫读取用户所有角色的权限并集。
6. 无权限时返回 403。

---

## 安全机制

### 密码安全

- 使用 scrypt 加盐哈希存储密码。
- 支持密码复杂度配置。
- 支持密码有效期配置。
- 支持登录失败锁定。
- 支持管理员重置密码。
- 支持用户主动修改密码。

### 登录防护

- 登录验证码。
- 验证码有效期和最大尝试次数可配置。
- 登录失败计数和锁定时间可配置。

### 请求安全

- JWT 鉴权。
- 生产模式写操作强制校验自定义头 `X-Requested-By`。
- CORS 来源可配置。
- Helmet 安全响应头。
- CSP `connect-src` 可配置。
- 全局限流。
- JSON/表单请求体大小限制。
- 文件上传大小和扩展名白名单。
- 全局错误处理不返回堆栈。

### 静态资源缓存

生产模式下后端托管 `web/dist`：

- `index.html` 使用 `no-cache`，保证新部署后能加载最新资源引用。
- Vite hash 资源使用长期强缓存。

---

## 本地开发

### 环境要求

- Node.js 22.5 及以上。
- npm。
- 如使用 TDSQL，需要可访问的 TDSQL MySQL 兼容库。
- 如使用原生 TDSQL 备份恢复，需要系统安装 `mysqldump` 和 `mysql` 客户端。

### 安装依赖

```bash
npm install
cd server && npm install
cd ../web && npm install
```

根目录只包含并行启动脚本，后端和前端依赖分别安装在各自目录。

### 准备环境变量

```bash
cp .env.example .env
```

至少需要修改：

```env
JWT_SECRET=please-change-this-secret-in-production
ADMIN_PASSWORD=please-change-this-admin-password
```

生产环境必须配置 `JWT_SECRET` 和 `ADMIN_PASSWORD`。初始超级管理员密码不再由代码提供默认值。

### 启动后端

```bash
cd server
npm run dev
```

默认监听：

```text
http://localhost:3000
```

后端启动过程：

1. 读取仓库根目录 `.env`。
2. 初始化数据库 provider。
3. 执行数据库迁移。
4. 写入幂等种子数据。
5. 启动 Fastify。

### 启动前端

```bash
cd web
npm run dev
```

默认监听：

```text
http://localhost:5173
```

Vite 会把 `/api` 代理到 `VITE_API_PROXY_TARGET`，默认是 `http://localhost:3000`。

### 根目录一键启动

```bash
npm run dev
```

该命令使用 `concurrently` 同时启动后端和前端。

---

## 环境变量

完整示例见 [.env.example](.env.example)。

### 基础运行

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NODE_ENV` | `production` | 运行环境。生产模式启用生产日志和静态资源托管 |
| `HOST` | `0.0.0.0` | 后端监听地址 |
| `PORT` | `3000` | 后端监听端口 |
| `RADAR_HTTP_PORT` | `3510` | Docker Compose 暴露到宿主机的端口 |
| `RADAR_CONTAINER_NAME` | `radar` | Docker 容器名称 |
| `NODE_IMAGE` | `docker.m.daocloud.io/library/node:22-alpine` | Docker 构建基础镜像 |
| `NPM_CONFIG_REGISTRY` | `https://registry.npmmirror.com` | Docker 构建时 npm registry |

### JWT 与初始管理员

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 无 | JWT 签名密钥，生产必须配置 |
| `JWT_EXPIRES_IN` | `12h` | JWT 有效期 |
| `ADMIN_PHONE` | `admin` | 初始超级管理员登录名 |
| `ADMIN_NAME` | `超级管理员` | 初始超级管理员显示名称 |
| `ADMIN_PASSWORD` | 无 | 初始超级管理员密码，必须显式配置 |

### 数据库与文件路径

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DB_CLIENT` | `sqlite` | 数据库类型，支持 `sqlite`、`tdsql`、`mysql` |
| `DB_FILE` | `./data/radar.db` | SQLite 数据库文件 |
| `TDSQL_HOST` | `127.0.0.1` | TDSQL 地址 |
| `TDSQL_PORT` | `3306` | TDSQL 端口 |
| `TDSQL_DATABASE` | `radar` | TDSQL 数据库名 |
| `TDSQL_USER` | `radar_app` | TDSQL 用户名 |
| `TDSQL_PASSWORD` | 空 | TDSQL 密码 |
| `TDSQL_SSL` | `false` | 是否启用 SSL |
| `TDSQL_CONNECTION_LIMIT` | `10` | TDSQL 连接池大小 |
| `TDSQL_TIMEZONE` | `+08:00` | TDSQL 时区 |
| `ATTACHMENT_DIR` | `./attachments` | 附件目录 |
| `WEB_DIST` | `./web/dist` | 前端构建产物目录 |
| `RADAR_DATA_DIR` | `./RADARdata/data` | Docker 宿主机数据库挂载目录 |
| `RADAR_ATTACHMENTS_DIR` | `./RADARdata/attachments` | Docker 宿主机附件挂载目录 |

### PAMS 问题系统

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PAMS_BASE_URL` | 空 | PAMS 服务基础地址 |
| `PAMS_API_KEY` | 空 | PAMS API Key |
| `PAMS_TIMEOUT` | `20000` | PAMS 请求超时时间，单位毫秒 |

### CORS、CSP 与 CSRF

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CORS_ORIGINS` | 开发环境本地端口 | 允许跨域访问的来源，多个来源用英文逗号分隔 |
| `CSP_CONNECT_SRC` | `self` | CSP connect-src 白名单 |
| `CSRF_HEADER_VALUE` | `RADAR` | 后端期望的 `X-Requested-By` 值 |

### 上传、请求体、限流与压缩

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MAX_FILE_SIZE` | `52428800` | 单附件最大字节数，默认 50MB |
| `UPLOAD_ALLOWED_EXTENSIONS` | 见 `.env.example` | 附件扩展名白名单 |
| `API_BODY_LIMIT` | `1048576` | 非 multipart API 请求体大小限制 |
| `RATE_LIMIT_MAX` | `600` | 单 IP 每个限流窗口最多请求数 |
| `RATE_LIMIT_WINDOW` | `1 minute` | 限流窗口 |
| `COMPRESSION_THRESHOLD` | `1024` | 响应压缩阈值 |

### 验证码与电子签名

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CAPTCHA_EXPIRES_MS` | `300000` | 验证码有效期 |
| `CAPTCHA_MAX_ATTEMPTS` | `3` | 单个验证码最大尝试次数 |
| `CAPTCHA_CODE_LENGTH` | `4` | 验证码字符长度 |
| `CAPTCHA_CLEANUP_INTERVAL_MS` | `60000` | 过期验证码清理间隔 |
| `SIGNATURE_MAX_BYTES` | `2097152` | 单张电子签名图片最大字节数 |

### 前端开发

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_DEV_PORT` | `5173` | Vite 开发服务器端口 |
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | 开发代理目标 |
| `VITE_API_BASE_URL` | `/api` | API 基础路径 |
| `VITE_API_TIMEOUT` | `30000` | 前端请求超时 |
| `VITE_CSRF_HEADER_VALUE` | `RADAR` | 前端写操作请求头值 |
| `VITE_CHUNK_SIZE_WARNING_LIMIT` | `1500` | Vite chunk 体积警告阈值，单位 KB |

---

## 生产部署

### Docker Compose 部署

准备 `.env`：

```bash
cp .env.example .env
```

至少修改：

```env
JWT_SECRET=your-random-secret
ADMIN_PASSWORD=your-admin-password
RADAR_HTTP_PORT=3510
```

启动：

```bash
docker compose up -d --build
```

访问：

```text
http://<服务器 IP>:3510
```

### 持久化目录

默认挂载：

| 宿主机目录 | 容器目录 | 说明 |
| --- | --- | --- |
| `./RADARdata/data` | `/app/data` | SQLite 数据库 |
| `./RADARdata/attachments` | `/app/attachments` | 附件 |

容器删除后，只要挂载目录保留，数据和附件不会丢失。

### 镜像构建

Dockerfile 采用两阶段构建：

1. `web-builder`：安装前端依赖并执行 `npm run build`。
2. 运行阶段：安装后端生产依赖，拷贝后端源码和前端 `dist`。

默认启动命令：

```bash
node server/src/server.js
```

### 非 Docker 生产运行

```bash
cd web
npm ci
npm run build

cd ../server
npm ci --omit=dev
NODE_ENV=production npm start
```

确保 `WEB_DIST` 指向前端构建目录，默认是仓库根目录下的 `web/dist`。

---

## 数据库与迁移

### SQLite 模式

默认模式：

```env
DB_CLIENT=sqlite
DB_FILE=./data/radar.db
```

SQLite 数据库文件会在首次启动时创建。迁移记录写入 `_migrations` 表。

适用场景：

- 本地开发。
- 单机部署。
- 轻量演示。
- 无独立数据库环境的小团队使用。

### TDSQL 模式

切换到 TDSQL：

```env
DB_CLIENT=tdsql
TDSQL_HOST=your-host
TDSQL_PORT=3306
TDSQL_DATABASE=radar
TDSQL_USER=radar_app
TDSQL_PASSWORD=your-password
TDSQL_SSL=false
```

启动后端时，会使用 TDSQL provider，并执行 TDSQL 初始化迁移。

TDSQL provider 会处理：

- 连接池。
- 事务连接复用。
- SQLite 常用写法到 MySQL 兼容写法的窄转换。
- `system`、`user`、`role` 等保留字表名引用。
- JSON 查询方言差异。

### SQLite 到 TDSQL

```bash
cd server
npm run migrate:tdsql -- --sqlite ../data/radar.db
```

清空目标表后重新导入：

```bash
npm run migrate:tdsql -- --sqlite ../data/radar.db --truncate
```

演练模式：

```bash
npm run migrate:tdsql -- --sqlite ../data/radar.db --dry-run
```

### TDSQL 到 SQLite

```bash
cd server
npm run migrate:sqlite -- --sqlite ../data/radar-from-tdsql.db
```

清空目标 SQLite 后重新导入：

```bash
npm run migrate:sqlite -- --sqlite ../data/radar-from-tdsql.db --truncate
```

### TDSQL 到 TDSQL

```bash
cd server
npm run migrate:tdsql-to-tdsql -- \
  --source-host source.example.com \
  --source-port 3306 \
  --source-database radar_source \
  --source-user radar_user \
  --source-password 'source-password' \
  --target-host target.example.com \
  --target-port 3306 \
  --target-database radar_target \
  --target-user radar_user \
  --target-password 'target-password'
```

清空目标库业务表后重新导入：

```bash
npm run migrate:tdsql-to-tdsql -- \
  --source-host source.example.com \
  --source-database radar_source \
  --source-user radar_user \
  --source-password 'source-password' \
  --target-host target.example.com \
  --target-database radar_target \
  --target-user radar_user \
  --target-password 'target-password' \
  --truncate
```

脚本会拒绝在源库和目标库指向同一库时执行 `--truncate`。

### TDSQL 原生备份

导出：

```bash
cd server
npm run dump:tdsql -- --output ../radar-tdsql-dump.sql.gz
```

恢复：

```bash
cd server
npm run restore:tdsql -- --input ../radar-tdsql-dump.sql.gz
```

删库重建恢复需要显式确认：

```bash
npm run restore:tdsql -- --input ../radar-tdsql-dump.sql.gz --drop-database --force
```

---

## 导入导出

以下模块支持 Excel 导入、模板下载和导出：

- 需求分析。
- 工单分析。
- 开发管理。
- 测试管理。
- 投产申请。
- 人员管理。
- 字典配置。

导入通用策略：

- `skip`：遇到重复编号时跳过。
- `overwrite`：遇到重复编号时覆盖可写字段，并记录变更。
- `rollback`：遇到失败或重复冲突时回滚本次导入。

导入时会做兼容解析：

- 投产点按投产日期匹配。
- 系统支持系统编号或系统名称解析。
- 字典字段支持显示值或属性值解析。
- 人员多选字段支持中文逗号、英文逗号拆分。
- 关联需求/工单/问题支持多分隔符拆分。

导出会尽量使用中文名称和可读文本：

- 系统编号转系统名称。
- JSON 数组转中文分隔文本。
- 附件转文件名或路径描述。
- 偏差率带百分号。
- 投产申请交付制品按组输出。

---

## 演示数据

需要生成一套可演示的完整业务数据时，可运行：

```bash
cd server
node src/db/mock.js
```

注意：该脚本会清空除超级管理员外的业务数据和人员数据，请勿在生产库执行。

演示数据覆盖：

- 多个投产点。
- 需求。
- 工单。
- 开发任务。
- SIT、UAT、NFT、SEC 测试任务。
- 投产申请。
- 投产审批。
- 会签状态。
- 问题清单。
- 附件和过程留痕。

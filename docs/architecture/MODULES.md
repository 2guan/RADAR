# RADAR 模块说明

模块边界、路径、Owner、依赖与公开契约以 [`governance/modules.yaml`](../../governance/modules.yaml) 为唯一机器可读事实源。本文件解释当前前后端一致的十个一级业务模块。

| 模块 | 前端页面 | 后端职责 |
| --- | --- | --- |
| `requirements` | 需求管理 | 需求登记、编号、状态与需求交付信息 |
| `tickets` | 工单管理 | 工单登记、编号、状态与独立写入边界 |
| `development` | 开发管理 | 开发任务、影响性分析与开发交付信息 |
| `testing` | 测试管理 | SIT/UAT/NFT/SEC 测试任务与覆盖性分析 |
| `release` | 投产申请、投产审批 | 投产申请、审批、会签、材料与投产记录 |
| `overview` | 概览 | 待办、工作台、生命周期只读聚合 |
| `dashboard` | 仪表盘 | 指标、图表、钻取与图表配置 |
| `issues` | 问题管理 | PAMS 问题快照、同步与问题详情 |
| `settings` | 系统设置 | 字典、系统、投产点、编号规则、流程、动态字段与交付物配置 |
| `identity-access` | 用户与权限 | 登录、会话、用户、角色与权限管理 |

后端的 `platform/` 仅提供认证、持久化、附件/签名、审计、导入导出、运行时和可观测性能力；前端的 `web/src/platform/` 统一承载 HTTP、路由、布局、全局状态、主题、品牌、响应式、附件/签名、审计抽屉与导入导出能力。`platform` 对业务模块只读。

前后端的 `shared/` 存放稳定 DTO、时间工具、表格/筛选/编辑器壳、状态展示和无数据所有权的流程协作组件。`shared` 可以由获授权模块协作维护，但不得拥有业务表或业务写入权，且跨模块访问仍必须走公开契约。附件、审计和签名的 HTTP 入口属于平台适配层，不再作为一级业务模块。

`settings` 是配置业务的唯一 Owner：`reference-data` 管理字典、系统、投产点和编号规则；`process-configuration` 管理内置字段、扩展字段、交付件定义、分区布局、状态规则和配置版本。需求、工单、开发、测试、投产等模块只消费这些配置与保存自身业务值。

每个业务模块对外只通过 `index.js` 和登记的 `contracts/**` 协作。旧 REST 地址保持兼容；路由文件只负责 HTTP 适配，业务规则与数据所有权仍归对应模块。

## 物理目录约定

```text
server/src/
├── bootstrap/                       # 组合根：迁移后写入默认种子数据
├── platform/                        # 只读基础设施；认证、持久化、审计、附件、运行时等
├── shared/                          # 无数据所有权的 DTO、工具和流程协作能力
└── modules/<module>/                # 业务模块：api / application / contracts / index.js

web/src/
├── platform/                        # HTTP、路由、布局、状态、主题、附件、审计、导入导出
├── shared/                          # 共享 UI、工作流展示、无领域工具
└── modules/<module>/                # 业务模块：api / pages / components / index.js
```

`release/applications/release-apply` 是投产模块内部的投产申请子域，不是独立一级模块；前端仍通过 `web/src/modules/release/` 的公开入口提供投产申请与投产审批页面。

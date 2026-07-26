# RADAR 模块说明

机器可读边界、路径、表、依赖、风险和 Owner 以 [`governance/modules.yaml`](../../governance/modules.yaml) 为唯一来源。本文件描述职责，不重复审批配置。

| 模块 | 职责 |
| --- | --- |
| `governance` | 研发规约、模块清单、自动化治理脚本与协作工作流 |
| `platform/auth` | 登录、JWT、RBAC、会话、密码与验证码基础能力 |
| `platform/audit` | 统一操作审计契约与记录 |
| `platform/attachments` | 附件、签名和存储访问控制 |
| `platform/import-export` | Excel、导入导出和简单配置 CRUD 技术能力 |
| `platform/persistence` | SQLite/TDSQL 适配、迁移与编号序列基础能力 |
| `reference-data` | 字典、系统、投产点与平台配置 |
| `requirements` | 需求登记、分析和独立公开读取契约 |
| `tickets` | 工单登记、分析和独立公开读取契约 |
| `delivery` | 开发、测试、影响和覆盖分析 |
| `process-configuration` | 动态状态、必填项、阶段内容与交付物配置 |
| `release-apply` / `release` | 投产申请、审批、会签与材料 |
| `issues` | PAMS 问题快照与同步集成 |
| `reporting` | 概览、仪表盘和跨模块只读投影 |

`server/src/lib/` 已移除。跨模块能力必须从 `platform/*/index.js` 或业务模块 `index.js` 的公开契约访问；新增代码必须写入所属模块分层目录。

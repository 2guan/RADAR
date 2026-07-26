# RADAR 模块说明

机器可读边界、路径、表、依赖、风险和 Owner 以 [`governance/modules.yaml`](../../governance/modules.yaml) 为唯一来源。本文件描述职责，不重复审批配置。

| 模块 | 职责 |
| --- | --- |
| `governance` | 研发规约、模块清单、自动化治理脚本与协作工作流 |
| `platform/auth` | 登录、JWT、RBAC、会话、密码与验证码基础能力 |
| `platform/audit` | 统一操作审计契约与记录 |
| `platform/attachments` | 附件、签名和存储访问控制 |
| `reference-data` | 字典、系统、投产点与平台配置 |
| `requirements` | 需求登记、分析和独立公开读取契约 |
| `tickets` | 工单登记、分析和独立公开读取契约 |
| `delivery` | 开发、测试、影响和覆盖分析 |
| `process-configuration` | 动态状态、必填项、阶段内容与交付物配置 |
| `release-apply` / `release` | 投产申请、审批、会签与材料 |
| `issues` | PAMS 问题快照与同步集成 |
| `reporting` | 概览、仪表盘和跨模块只读投影 |

模块迁移期间，旧路径只可作为兼容入口；新增代码必须写入目标模块分层目录。

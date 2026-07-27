---
document_type: ai_coding_requirement
template_version: "1.0"
requirement_id: "REQ-20260724-001"
title: "多人共创架构治理"
status: "ready"
priority: "P1"
requester: "项目负责人"
developer: "hengguan"
module: "governance"
module_owner: "hengguan"
contains_confidential_information: false
external_access_required: false
internet_ai_coding_allowed: true
last_updated: "2026-07-27"
---

# [REQ-20260724-001] 多人共创架构治理

## 目标

将 RADAR 演进为可由多人持续维护的模块化单体：正式规约、机器化模块边界、任务范围和 CI 门禁成为统一事实源；保留现有 API、SQLite 与 TDSQL/MySQL 8 兼容。本需求当前由 `hengguan` 负责。

## 本次范围

1. 建立正式治理入口、完整模块清单、需求和任务范围模板。
2. 建立公开契约、平台能力和兼容入口的目录基础。
3. 将 CI 改为检查任务范围、模块依赖、迁移配对和质量基线。
4. 固化前后端十个业务模块、`platform`、`shared` 与设置配置子域的目录归属，并以代码注释检查持续校验文件头规范。

## 明确不做

1. 不实现外网辅助入口、外网 API 或外网前端。
2. 不替换 SQLite；SQLite 与 TDSQL/MySQL 8 均为支持目标。
3. 不合并需求与工单模块，不改变既有 REST 路径和历史数据库字段。
4. 本需求经项目负责人明确授权，在单维护人过渡期可直接维护 `main`；新增多人协作需求仍须使用受保护分支和 PR。

## 验收标准

| 编号 | Given | When | Then |
| --- | --- | --- | --- |
| AC-001 | 新需求进入研发 | 创建任务范围 | 能声明可写、只读、禁止路径及风险/测试 |
| AC-002 | PR 修改模块文件 | CI 执行 | 能拒绝越界路径和跨模块内部导入 |
| AC-003 | 旧 API 调用 | 完成结构调整 | 返回和业务行为保持兼容 |
| AC-004 | SQLite 或 TDSQL/MySQL 环境 | 运行迁移检查 | 两端迁移均被验证 |
| AC-005 | 未批准外网能力 | 部署当前版本 | 不新增外网路由或前端入口 |

## 风险与回退

该任务涉及公共边界和 CI。实施采用兼容导出；发现回归时可回退到本任务前提交，不执行数据库结构变更。

# RADAR 2.0 整体建设方案

## 目标

RADAR 保持 Node.js + Fastify + React 的模块化单体部署，不拆分微服务。目标是让多人能够在明确模块、契约、Owner、任务范围和自动化门禁下并行交付，同时保留既有 REST API、历史字段与 SQLite、TDSQL/MySQL 8 双兼容。

## 架构原则

1. 需求与工单是独立业务模块，分别拥有数据和公开契约。
2. `platform` 承担认证、审计、附件、持久化等横切基础能力；`shared` 只承载 DTO 和纯工具。
3. 模块内按 `api / application / infrastructure / contracts` 分层；跨模块只使用 `index.js` 和 `contracts`。
4. 内网完成全部业务流程；外网只在获批需求后以受控子集形式增加，当前不实施。
5. 规约、任务范围、CODEOWNERS、CI 和主分支保护共同形成可执行治理。

## 实施路线

第一阶段固化规约、需求模板、模块清单、AI 入口和 CI；第二阶段抽取 platform 与公开契约；第三阶段以 tickets 为试点迁移前后端模块，再依次迁移 requirements、delivery、release、reporting；第四阶段收口迁移验证、审计与可选外网网关。迁移期间使用兼容导出与 API 回归测试，确认无调用方后再删除旧入口。

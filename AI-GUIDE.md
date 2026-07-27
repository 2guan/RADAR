# RADAR 开发上下文兼容入口

正式规则已收敛到 [AGENTS.md](AGENTS.md)、[研发规约导航](docs/governance/README.md) 和当前需求目录。开始编码前请按 `AGENTS.md` 的必读清单执行；本文件不再维护独立规则或技术栈结论。

代码定位从 [模块说明](docs/architecture/MODULES.md)、[ADR-004](docs/architecture/decisions/ADR-004-platform-shared-ownership.md) 和 `governance/modules.yaml` 开始。前后端均采用 `platform / shared / modules`：`platform` 对业务模块只读，`shared` 不拥有业务数据且只能按公共能力流程协作维护。

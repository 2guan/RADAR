# RADAR 正式研发规约

这里是 RADAR 的唯一正式通用规约来源：

- [项目研发规约](PROJECT-RULES.md)：模块、契约、数据、质量与发布规则。
- [AI Coding 与数据边界](AI-CODING-RULES.md)：AI 使用、任务范围和敏感数据规则。
- [GitHub 协作规约](GITHUB-RULES.md)：Issue、分支、PR、审批与 CI 规则。

长期模块边界只维护在 [`governance/modules.yaml`](../../governance/modules.yaml)；单任务边界只维护在对应需求目录的 `ai-task-scope.yaml`。其他文档只能引用，不得复制或另行定义同类硬规则。

当前项目约定以 `modules.yaml` 为准：`platform` 是业务模块只读的基础设施；`shared` 是不拥有业务数据的可复用协作能力，可在 Shared Change Issue、Owner 审批和回归测试前提下维护。代码文件头统一使用“文件、说明、用途、作者”顺序，CI 由 `scripts/check-code-comments.mjs` 校验。

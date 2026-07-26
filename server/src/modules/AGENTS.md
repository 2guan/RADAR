# 后端业务模块规则

模块仅拥有 governance/modules.yaml 登记的表和公开契约。跨模块访问必须通过目标模块 index.js 或 contracts/**；不得导入其他模块 routes.js、内部 application/infrastructure 文件，也不得直接写其表。新增公共能力需走任务范围中的 Shared Change Issue 和兼容性测试。


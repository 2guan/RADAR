# 控件与数据来源

## 控件选择

| 数据特征 | 推荐控件 |
| --- | --- |
| 是/否 | Switch 或 Checkbox |
| 少量互斥值 | Radio 或 Segmented |
| 大量或可搜索单选 | Select |
| 多个受控值 | 多选 Select |
| 日期/时间 | DatePicker |
| 数量、比例、范围 | InputNumber、步进器或 Slider |
| 颜色 | 颜色选择器或色块 |
| 文件 | 上传控件，并提供名称、大小、状态、下载/预览/删除能力 |
| 真正自由描述 | Input 或 TextArea |

受平台维护的数据不得使用自由文本。

## RADAR 数据源

| 含义 | Owner/来源 | 前端能力 |
| --- | --- | --- |
| 字典和流程状态 | `settings/reference-data` | `DictSelect` |
| 系统 | settings 系统公开契约 | `SystemSelect` |
| 人员 | 已登记人员搜索接口 | `PersonPicker` |
| 机构 | 字典分类 `org` | `DictSelect category="org"` |
| 投产点 | settings 投产点契约 | `makeReleasePointOptions` 或既有页面模式 |
| 普通目录型内置字段 | `settings/process-configuration` | `StageBuiltinFields` 与 `StageBuiltinCatalogField` |
| 复杂内置字段 | `settings/process-configuration` + 业务模块 | `StageBuiltinFields` 中以 `StageBuiltinField` 声明实际业务 JSX 适配器 |
| 扩展业务字段 | `settings/process-configuration` | 在适当布局位置使用 `StageContentPanel` |
| 交付件 | `settings/process-configuration` | 注册交付件定义、状态规则和模板版本，并由 `StageContentPanel`/既有附件字段承载 |

通过 `web/src/modules/settings/reference-data/index.js`、`web/src/modules/settings/process-configuration/index.js` 或登记的公开契约导入，不复制实现或访问 settings 私有存储。

## 配置登记与页面接入

`settings/process-configuration` 的内置配置目录是字段和交付件语义的代码基线；数据库配置只保存管理员可调整的分区、排序、可见性、状态规则等呈现规则。注册定义不会自动把控件放进业务页面：

- 普通目录字段必须由 `StageBuiltinFields` 和 `StageBuiltinCatalogField` 接入；未在目录中声明为标准渲染器的字段不应伪装为已渲染。
- 有专业交互、结构化数据或业务联动的字段必须由所属编辑器以 `StageBuiltinField` 包裹实际 JSX 适配器；不得为了动态化而退化交互。
- 扩展字段与交付件由 `StageContentPanel` 在页面的左、右或全宽布局位置承载；交付件还须登记提交方式、状态规则和适用的不可变模板版本。
- 每个字段分别确认列表列、筛选、详情/编辑 JSX、系统设置输入项配置；每个交付件分别确认配置页、页面位置、状态规则、模板版本和附件权限。
- 默认定义必须同时覆盖新库种子与已有环境的版本化、幂等升级。以升级 ID 和稳定键只补齐缺失项，保留管理员的布局、可见性、排序、状态规则、模板和软删除意图。

## 字段设计检查

每个字段确认：

- 是否已有平台数据源和公共组件；
- 单选、多选、允许清空和允许自定义是否符合业务；
- 默认值来自用户、版本、上下文还是系统配置；
- 是否需要搜索、远程加载、禁用项、级联和反显历史值；
- 必填、格式、长度、跨字段和状态校验是否服务端一致；
- 配置范围、稳定键、默认分区和运行时能力是否已登记；普通字段是目录渲染还是复杂业务适配器；
- 列表、筛选、详情/编辑 JSX、系统设置配置四处是否适用并实际生效；已有环境升级是否只补齐缺失定义；
- 错误是否显示在字段附近并能指导修正；
- 只读态是否仍能看清完整值；
- 移动端键盘和弹层是否可用。

## 硬编码判断

仅技术协议常量、算法模式或当前模块拥有且明确不可配置的业务不变量可以硬编码。人员、机构、系统、投产点、流程状态、字典、字段、交付件和管理员维护选项不得硬编码；固定业务枚举仍须在配置目录、服务端校验和导入入口保持同一语义。

兼容场景确需“检索已有值并允许自定义”时，复用已有 tags 模式组件并记录自由输入的业务理由。

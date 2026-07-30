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
| 可配置业务字段 | `settings/process-configuration` | `StageContentPanel` 与注册字段源 |
| 交付件 | `settings/process-configuration` | 注册交付件定义与附件字段 |

通过 `web/src/modules/settings/reference-data/index.js` 或登记的公开契约导入，不复制实现。

## 字段设计检查

每个字段确认：

- 是否已有平台数据源和公共组件；
- 单选、多选、允许清空和允许自定义是否符合业务；
- 默认值来自用户、版本、上下文还是系统配置；
- 是否需要搜索、远程加载、禁用项、级联和反显历史值；
- 必填、格式、长度、跨字段和状态校验是否服务端一致；
- 错误是否显示在字段附近并能指导修正；
- 只读态是否仍能看清完整值；
- 移动端键盘和弹层是否可用。

## 硬编码判断

仅技术协议常量、算法模式或当前模块拥有且明确不可配置的业务不变量可以硬编码。人员、机构、系统、投产点、流程状态、字典、字段、交付件和管理员维护选项不得硬编码。

兼容场景确需“检索已有值并允许自定义”时，复用已有 tags 模式组件并记录自由输入的业务理由。

# 效能仪表盘 · 分析图表重制方案

> **实现状态（2026-06-12）**：Phase 0–4 已完成并通过浏览器端到端验证（5 指标卡保留、系统/我的图表两分区、编辑器、饼/柱/横柱/堆叠/折线/面积/透视表渲染、局部过滤、分组归并、弹窗钻取、卡片增删改移、投产窗口联动）。**已按确认决策落地**：① 系统图表+我的图表分区 ✅ ② 钻取弹窗列表 ✅ ③ 保留 5 原子指标卡 ✅ ④ 偏差率/周月粒度暂不做。
> **后续增强（未做）**：透视表 2~3 级嵌套子维度（Phase 5 的 subGroups 递归）、`avg/sum_deviation` 指标与 `timeGrain`、时间维度缺失日补零、可配置「列×行」看板。


> 目标：把 PAMS「统计仪表盘下方自定义图表」的全部能力（多维度组合 / 分组归并 / 局部过滤 / 透视表 / 系统图表+我的图表分区 / 颜色与布局自定义 / 钻取）移植并重制到 RADAR 的效能仪表盘「分析图表」区域，并适配 RADAR 多数据源模型与翡翠绿主题。
>
> 作者：hengguan ｜ 维护：impeccable（视觉）

---

## 0. 现状对比（为什么要重制）

| 维度 | PAMS（参考） | RADAR（现状） |
|---|---|---|
| 图表类型 | 饼 / 柱 / 横向柱 / 堆叠柱(纵·横) / 折线 / 面积 / **透视表** | 柱 / 面积 / 饼 / 简单两列表 |
| 维度 | 主维度(Y) + **次维度(X，堆叠/透视)** | 单维度 |
| 分组归并 | groups：自定义标签+颜色+**嵌套子维度(3级)** | 无 |
| 局部过滤 | filters：任意维度多值 + **时间区间** | 无（仅全局投产窗口） |
| 预设 | 「加载预设」从看板/字典一键生成分组 | 无 |
| 颜色 | 每分组自定义（HEX 取色器+调色盘+清除） | 单一主色 |
| 分区 | **系统图表(管理员共享)** + 我的图表(个人) | 仅个人，平铺 |
| 卡片操作 | 编辑 / 左右移动 / 删除 / 行高对齐 / 半宽全宽 | 仅删除 |
| 钻取 | 点击图元 → 底层记录列表弹窗 | 无 |
| 持久化 | `sys_user_dashboard`（SYSTEM/用户 JSON）+ 旧格式迁移 | `dashboard_chart`（每行一图，config 极简） |
| 后端引擎 | `getChartStatsBase` 1D/2D 透视 + 维度白名单 + 分组归并 + 时间维度 | `/dashboard/chart-data` 内存分桶，4 维度固定 |

**核心差异（最大改造点）**：PAMS 所有图表查询同一张 `biz_issue` 表，维度即列；**RADAR 有多张源表**（requirement / dev_task / test_task / release_system），所以图表配置必须携带 `source`，**可用维度与字典随 source 变化** → 需要一份「按数据源的维度注册表」。

---

## 1. PAMS 设计思路提炼（要照搬的"魂"）

### 1.1 配置数据模型（声明式、可序列化）
一张图 = 一个 `ChartConfig` JSON（`PAMS/src/app/(main)/dashboard/dashboardConfig.ts:52`）：

```ts
{
  id, title,
  dimension,            // 主维度（Y/分类）
  xAxisDimension?,      // 次维度（X/堆叠/透视列），仅 表格/堆叠/折线/面积 有效
  chartType,            // pie|bar|horizontal_bar|stacked_bar|stacked_bar_horizontal|line|area|table
  filters?,             // { 维度: 值[] | [起,止] } 局部过滤
  groups?,              // 主维度分组归并 [{label,values[],color?,subDimension?,subGroups?[]}]
  xAxisGroups?,         // 次维度分组归并（同上结构）
  colSpan,              // 12=半宽 24=全宽
  height,
}
```
分区 `DashboardSection { type:'system'|'user', charts:[] }`，整盘 `DashboardConfig { board, sections }`。

### 1.2 后端聚合引擎（`PAMS/src/lib/db.ts:1833` `getChartStatsBase`）
- **维度白名单**防注入：`allowed=[status,category,...]`，非法维度直接返回空。
- **字段表达式映射** `getFieldExpr`：时间维度 `substr(create_time,1,10)`、分组维度 `CASE WHEN ... END`。
- **WHERE 构建**：数组值 → `IN (?)`；时间双值 → `BETWEEN`；空数组 → `1=0`。
- **1D**：`SELECT COALESCE(dim,'未分配') name, COUNT(*) value GROUP BY name`，时间维度按 name 升序，否则按 value 降序。
- **2D 透视**：`GROUP BY name_y, name_x`，返回 `[{name_y,name_x,value}]`。
- **分组归并在 JS 完成**：把原始值并入 `groups[i].values` → 用 `groups[i].label` 累加；命中"维度占位符"（values 含维度名本身）则保留原值不归并；其余落 `其它`；按 groups 顺序排序。
- **嵌套子维度**（`getChartStats:2045`）：递归 `traverseDimension`，对带 `subDimension` 的分组把其 values 注入下钻过滤，产出带 `path_y/path_x` 的多层结果 → 供透视表多级表头。

### 1.3 前端渲染（`PAMS/.../dashboard/page.tsx`）
- `DashboardChartComponent`（:218）：拉 `/api/stats/chart` → `processedData`（**时间维度补零填充缺失日期** :257）→ 按 chartType 构造 ECharts option。
- **样式手法**：
  - `generateGradient(baseColor)`（:373）柱/饼用「主色→透明」线性渐变，`itemStyle.borderRadius:6`。
  - 堆叠柱：段内白字标签 + **透明"合计"幽灵 series** 在顶端显示总数（:547）。
  - 饼：圆环 `radius:['50%','80%']`，scroll 图例底部。
  - 标题：左下 **渐变下划线**点缀（:737）。hover 才显隐操作按钮。
- `renderTable`（:1707 周边）：多级列表头 + `总计`行 + 全零列隐藏 + 单元格按分组色着色 + 0 值灰显。
- 点击图元 → `onChartClick` → 底层 issue 列表弹窗（钻取）。
- `ChartEditor`（独立 Modal）：表单驱动全部配置；`handleLoadPresets` 从看板/字典生成分组预设；`CustomColorPicker` 取色。
- 布局：按 `colSpan` 累加分行，**同一行卡片高度对齐**（:2364）；`xs=24, lg=colSpan` 响应式。

### 1.4 持久化与权限
- `sys_user_dashboard(user_id, config_content JSON)`，`SYSTEM` 为系统默认；系统图表仅管理员可存。
- 读时返回 `{system, user}` 两份，前端合并渲染。

---

## 2. RADAR 适配设计

### 2.1 按数据源的维度注册表（新增核心）
新建 `server/src/lib/chart-dims.js`，声明每个 source 的可用维度、取值方式、显示字典：

| dimKey | 适用 source | 记录取值（raw） | 显示映射 | 多值 |
|---|---|---|---|---|
| `status` | 全部 | `r.status` | dict `process_status`（display_value） | 否 |
| `req_type` | requirement | `r.req_type` | dict `req_type` | 否 |
| `test_type` | sit/uat/nft/sec | `r.test_type` | 字面(SIT/UAT/NFT/SEC) | 否 |
| `org` | 全部 | `impl_org` ／ 由 `main_systems` 经 system.org 映射 ／ `propose_dept` | dict `org` | 是* |
| `sector` | 全部 | system.sector（由系统编号映射） | dict `sector` | 是* |
| `system` | 全部 | `impl_system` ／ `main_systems[]` | system.sys_name | 是* |
| `owner` | dev/test | `r.owner` | 原值（人名） | 否 |
| `propose_dept` | requirement | `r.propose_dept` | dict `org` | 否 |
| `release_point` | requirement | `r.release_point_id` | release_point.name | 否 |
| `propose_time_day` | requirement | `substr(propose_time,1,10)` | 原值（日期） | 否 |
| `plan_end_day` / `actual_end_day` | dev/test | `substr(plan_end,1,10)` 等 | 原值（日期） | 否 |
| `actual_release_day` | releaseSystem | `substr(actual_release_time,1,10)` | 原值 | 否 |
| `deviation_bucket` | dev/test | 由 `deviation_rate` 分箱：`≤0 / 1–20 / 21–50 / >50` | 箱标签 | 否 |

\* 多值维度（system/org/sector 来自 `main_systems` JSON 或编号映射）→ 一条记录对多个桶各 +1（沿用现 `dimValues` 思路）。

新增 source：`releaseSystem`（投产系统，关联 release_task→requirement 做窗口过滤）。

### 2.2 指标（metric）
默认 `count`（COUNT 记录）。增强：`avg_deviation` / `sum_deviation`（仅 dev/test，对 `deviation_rate` 聚合）——Phase 6。

### 2.3 配置 JSON Schema（存入 `dashboard_chart.config`）
```jsonc
{
  "source": "requirement",
  "dimension": "status",
  "xAxisDimension": null,            // 堆叠/透视/折线 才用
  "metric": "count",                 // count|avg_deviation|sum_deviation
  "filters": { "status": ["待评审","开发中"], "propose_time_day": ["2026-01-01","2026-06-30"] },
  "groups": [
    { "label": "进行中", "values": ["开发中","测试中"], "color": "#0E9F6E",
      "subDimension": "org", "subGroups": [ /* 透视表三级 */ ] }
  ],
  "xAxisGroups": [],
  "colSpan": 12,
  "height": 320,
  "timeGrain": "day"                 // day|week|month（时间维度，增强）
}
```
`chart_type` 仍用现有独立列；`title`/`sort` 不变。

### 2.4 聚合策略
RADAR 维度含 JSON 数组与跨表映射，不易纯 SQL 下推 → **延用「SQL 取窗口内行 + JS 抽取/归并」**（与现状一致、PAMS 的 JS 分组归并同构）。规模为内部工具量级，内存聚合可接受；后续可对纯标量维度做 SQL 下推优化（记录于风险）。

---

## 3. 架构与文件分解

### 3.1 数据库迁移 `server/src/db/migrations/0003_dashboard_charts_v2.sql`
```sql
-- 系统图表/个人图表分区 + 布局列
ALTER TABLE dashboard_chart ADD COLUMN scope TEXT NOT NULL DEFAULT 'user';   -- user|system
ALTER TABLE dashboard_chart ADD COLUMN col_span INTEGER NOT NULL DEFAULT 12; -- 12半宽 24全宽
ALTER TABLE dashboard_chart ADD COLUMN height   INTEGER NOT NULL DEFAULT 320;
CREATE INDEX idx_dash_chart_scope ON dashboard_chart(scope, user_id, sort);
```
- 系统图表：`scope='system'`，`user_id` 记创建管理员，**对所有人可见**。
- 个人图表：`scope='user'`，仅本人可见可改。
- 兼容：旧行 `scope='user'` 自动归入「我的图表」；旧 `config{source,dimension,color}` 在前端渲染时按缺省值补全（无 groups/filters）。

### 3.2 权限
`server/src/lib/perm-catalog.js` 的 `dashboard` 增动作 `manage`（管理系统图表）；seed 给超管/管理员。系统图表的增删改 `preHandler: requirePerm('dashboard','manage')`，查看仍 `view`。

### 3.3 后端接口（`server/src/modules/dashboard/routes.js` 重写）
| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/dashboard/metrics` | view | **保留**（5 原子指标卡） |
| GET | `/dashboard/dimensions?source=` | view | 返回该 source 可用维度、图表类型、各维度取值来源（dict/system/release_point/free） |
| POST | `/dashboard/chart-data` | view | **重写**：入参 `{source,dimension,xAxisDimension?,metric?,filters?,groups?,xAxisGroups?,releasePointIds}`；输出 1D `[{name,value}]` 或 2D `[{name_y,name_x,value,path_y?,path_x?}]`（raw 值，前端映射显示名/色） |
| POST | `/dashboard/chart-drilldown` | view | 钻取：同过滤条件返回底层记录列表（分页） |
| GET | `/dashboard/charts` | view | 返回 `scope='system'` ∪ 本人 `scope='user'`，按 scope、sort 排 |
| POST | `/dashboard/charts` | view／manage | 新增（system 图表需 manage） |
| PUT | `/dashboard/charts/:id` | view／manage | 改（system 图表需 manage，且校验 scope） |
| DELETE | `/dashboard/charts/:id` | view／manage | 删 |

**引擎实现要点**（移植 `getChartStatsBase`/`getChartStats` 思路）：
1. `loadRows(source, windowCodes)`：按 source 取行并做投产窗口过滤（releaseSystem 经 release_task join）。
2. `extract(dim, row) -> string[]`：维度抽取器（注册表驱动；多值维度返回数组；空 → `['未分配']`）。
3. `applyFilters(rows, filters)`：逐维度多值/时间区间过滤（用同一 extractor）。
4. `mergeGroups(rawCounts, groups, dim)`：归并到 `groups[i].label`，含维度占位符与 `其它` 落桶、按 groups 顺序排序（照搬 PAMS 规则）。
5. 1D：分桶→归并；2D：`(y×x)` 双重分桶→双向归并；嵌套 `subDimension` 递归注入过滤产出 `path_*`。
6. 安全：维度键必须命中注册表白名单。

### 3.4 前端组件树（`web/src/pages/Dashboard.jsx` 重写 + 新建组件）
```
pages/Dashboard.jsx                     // 装配：指标卡 + 分区(系统/我的) + 编辑器/弹窗
components/dashboard/
  ├─ DashboardChart.jsx                 // 单图卡：拉数→processData→ECharts/透视表渲染 + hover 操作(编辑/移动/删除)
  ├─ ChartEditor.jsx                    // 配置 Modal：维度/类型/次维度/过滤/分组(+颜色+预设+嵌套)/布局
  ├─ PivotTable.jsx                     // 多级表头透视表 + 合计行 + 全零列隐藏 + 单元格着色
  ├─ ColorPickerField.jsx              // HEX 取色 + 翡翠绿调色盘 + 清除（移植 CustomColorPicker）
  ├─ chartOption.js                    // 各类型 ECharts option 构造 + generateGradient + 主题适配
  └─ useDimensionMeta.js               // hook：缓存 dimensions/字典/系统/投产点，提供 选项 与 显示名映射
```
- `useDimensionMeta`：统一缓存 `GET /dict/by-category/:c`、系统列表、投产点列表、`/dashboard/dimensions`；导出 `getOptions(source,dim)`（编辑器下拉/预设）与 `labelOf(dim, rawValue)`（渲染显示名）。
- 显示名映射放前端（与 PAMS 一致），后端只回 raw，避免重复字典逻辑。

### 3.5 ECharts option（`chartOption.js`，翡翠绿 + 明暗双主题）
- 通用：`backgroundColor:'transparent'`，文本色走 CSS 变量 `--radar-ink`，`theme={isDark?'dark':undefined}`。
- 配色：默认主色 `#0E9F6E`；调色盘以翡翠绿为首，含语义状态色（成功/警告/危险/信息，取自 DESIGN.md）。
- `generateGradient(color)`：柱/饼「主色→透明」纵向渐变；柱 `barMaxWidth:30`、`itemStyle.borderRadius:[6,6,0,0]`。
- 饼：`radius:['50%','80%']`、`borderRadius:6`、scroll 图例底部。
- 堆叠：段内白字 + 透明合计幽灵 series 顶部显总数；横向堆叠 Y 轴逆序。
- 折线/面积：`smooth:true`，面积「主色→透明」渐变；含次维度时多 series。
- 时间维度：缺失日期补零（移植 `processedData` 逻辑）；标签按 `timeGrain` 格式化。
- 每分组颜色优先取 `groups[i].color`，否则取调色盘轮转。

### 3.6 视觉规范（对齐 DESIGN.md / impeccable）
- 卡片：`Card size="small"`，圆角 8px、扁平分层阴影；标题 15px `--radar-ink` 粗体 + 左下翡翠渐变下划线点缀；hover 显隐右上操作区（移动/编辑/删除）。
- 分区头：`系统图表` / `我的图表` 标题 + 右侧「新增图表」（系统区需 `manage`）。
- 布局：`Row gutter=[16,16]`；`Col xs=24 lg=colSpan`（colSpan∈{8,12,24}）；同行卡片高度对齐。
- 透视表：表头底色淡翡翠、`总计`行加粗、0 值 `#bfbfbf`、单元格按分组色 8%~12% 透明度着色。
- 暗色：所有色彩与文本用变量/`dark` 主题，保证明暗对等与 WCAG AA；信息不靠颜色单一编码（标签+数值并存）。
- 空/载入：`Empty`「点击新增自定义分析图表」、卡片 `loading`。

---

## 4. 分阶段实施计划

> 每阶段可独立交付、可回滚；前后端按阶段对齐。

### Phase 0 · 数据与骨架
- [ ] 迁移 `0003_dashboard_charts_v2.sql`（scope/col_span/height/索引）。
- [ ] `lib/chart-dims.js`：维度注册表 + `extract()` + 取值来源声明。
- [ ] perm-catalog 加 `dashboard:manage`，seed 授权管理员。
- **验收**：`npm start` 自动迁移通过；旧图仍可读为「我的图表」。

### Phase 1 · 后端引擎
- [ ] 重写 `/dashboard/chart-data`（1D/2D + filters + groups/xAxisGroups + metric + 白名单）。
- [ ] 新增 `/dashboard/dimensions`、`/dashboard/chart-drilldown`。
- [ ] charts CRUD 支持 scope（系统图表走 `manage`）。
- **验收**：`curl` 各 source×维度×类型返回正确结构；2D 透视、分组归并、时间区间、占位符不归并均通过。

### Phase 2 · 前端基础设施
- [ ] `ColorPickerField.jsx`（移植 + 翡翠调色盘）。
- [ ] `useDimensionMeta.js`（字典/系统/投产点/维度缓存 + 选项 + 显示名）。
- [ ] `ChartEditor.jsx`：标题 / 主维度 / 类型 / 次维度(条件) / 过滤列表(多值+时间区间) / 主分组(标签+色+值+预设) / 次分组 / colSpan / height；保存回写 config。
- **验收**：编辑器可产出完整 config；「加载预设」从字典/系统列表一键生成分组。

### Phase 3 · 图表渲染
- [ ] `chartOption.js`（七种图表 + 渐变 + 主题）。
- [ ] `PivotTable.jsx`（多级表头 + 合计 + 零列隐藏 + 着色）。
- [ ] `DashboardChart.jsx`（拉数 + processData 补零/排序 + 渲染 + hover 操作）。
- **验收**：饼/柱/横柱/堆叠(纵横)/折线/面积/透视全部正确；明暗主题对等。

### Phase 4 · 分区与布局装配
- [ ] `Dashboard.jsx` 重写：保留 5 指标卡；新增「系统图表」「我的图表」两分区。
- [ ] 每分区「新增图表」、卡片 编辑/左右移动/删除、同行高对齐、响应式。
- [ ] 持久化：sort 重排、scope 落库。
- **验收**：管理员可建系统图表并对所有人可见；普通用户仅管理我的图表；移动/编辑/删除即时生效并持久。

### Phase 5 · 嵌套透视 + 钻取
- [ ] 透视表 2~3 级子维度（编辑器嵌套 subGroups + 引擎 `path_*`）。
- [ ] 点击图元/单元格 → 底层记录列表弹窗（按 source 复用列；可跳模块详情）。
- **验收**：三级透视表头与合计正确；钻取列表条数与图元数值一致。

### Phase 6 · 增强与打磨
- [ ] `avg/sum_deviation` 指标、`timeGrain`(周/月)。
- [ ] 空/载入/错误态、密度与无障碍复核（impeccable `/impeccable audit`）。
- [ ] （可选）可配置「列×行」透视看板替代/补充 5 指标卡。
- **验收**：偏差率指标可视化正确；a11y/对比度达标。

---

## 5. 关键决策（需确认，附建议）

1. **系统图表 + 我的图表分区** —— 建议**采用**（PAMS 同款，团队协同价值高）。代价：新增 `dashboard:manage` 权限与 seed。
2. **钻取目标** —— 建议**弹窗列表**（与 PAMS 一致），按 source 复用最小列；后续可深链到需求/任务详情。
3. **聚合位置** —— 建议**JS 内存聚合**（贴合多源/JSON 维度，改造小）；纯标量维度的 SQL 下推列为后续优化。
4. **5 原子指标卡** —— 建议**保留**；PAMS 顶部「列×行透视看板」作为 Phase 6 可选项，不阻塞主线。
5. **偏差率/时间粒度** —— 作为增强项（Phase 6），不影响 1~4 阶段交付。

---

## 6. 风险

- **维度爆炸/性能**：多值维度 × 2D 透视 × 全量行内存聚合在数据增大后可能变慢 → 设“候选行先按窗口+过滤裁剪”，必要时缓存 dimensions 与字典；标量维度后续 SQL 下推。
- **旧数据兼容**：旧 `config{source,dimension,color}` 缺 groups/filters → 前端渲染按缺省补全，编辑器打开即可升级保存。
- **暗色对比度**：透视表着色与渐变需在暗色下复核 WCAG AA（用变量，不写死浅色）。
- **权限边界**：系统图表的改/删必须校验 `scope` 与 `manage`，防止越权改他人/系统图表。

---

## 7. 验收清单（端到端场景）

- [ ] 各 source（需求/开发/SIT/UAT/NFT/SEC/投产系统）× 各维度 × 各图表类型可建可渲染。
- [ ] 过滤（多值 + 时间区间）、分组归并（含占位符不归并、其它落桶、顺序）正确。
- [ ] 2D 堆叠/透视：合计、零列隐藏、着色、多级表头正确。
- [ ] 颜色：分组自定义色生效；默认翡翠调色盘；清除回退。
- [ ] 分区：系统图表全员可见、仅 `manage` 可改；我的图表用户隔离。
- [ ] 卡片：编辑/左右移动/删除/半宽全宽/同行高对齐/响应式。
- [ ] 钻取：列表条数与图元一致。
- [ ] 明暗双主题对等、空/载入态、投产窗口联动刷新。
```

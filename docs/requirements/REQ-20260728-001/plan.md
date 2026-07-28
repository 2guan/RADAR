# [REQ-20260728-001] 开发方案

## 概览

为需求分析模块增加「优先级」字段，在数据库、后端 API、前端列表和编辑表单中同步支持。

---

## 修改文件清单

| # | 文件 | 类型 | 说明 |
|---|------|------|------|
| 1 | `server/src/platform/persistence/migrations/0040_add_requirement_priority.sql` | 新增 | SQLite 迁移：ADD COLUMN priority |
| 2 | `server/src/platform/persistence/migrations/tdsql/0020_add_requirement_priority.sql` | 新增 | TDSQL 迁移：ADD COLUMN priority |
| 3 | `server/src/modules/requirements/routes.js` | 修改 | 插入/更新/列表查询中加入 priority |
| 4 | `web/src/modules/requirements/components/RequirementEditor.jsx` | 修改 | 表单新增优先级下拉选择 |
| 5 | `web/src/modules/requirements/pages/RequirementsPage.jsx` | 修改 | 列表新增优先级列 |

---

## 详细方案

### 1. 数据库迁移

#### SQLite (`0040_add_requirement_priority.sql`)
```sql
-- 0040_add_requirement_priority.sql
-- 用途：为需求表增加优先级字段，默认值为"中"
ALTER TABLE requirement ADD COLUMN priority TEXT NOT NULL DEFAULT '中';
UPDATE requirement SET priority = '中' WHERE priority IS NULL OR priority = '';
```

#### TDSQL (`tdsql/0020_add_requirement_priority.sql`)
```sql
-- 0020_add_requirement_priority.sql
-- 用途：为需求表增加优先级字段（TDSQL/MySQL 8），默认值为"中"
ALTER TABLE requirement ADD COLUMN priority VARCHAR(16) NOT NULL DEFAULT '中';
UPDATE requirement SET priority = '中' WHERE priority IS NULL OR priority = '';
```

### 2. 后端 API 修改 (`routes.js`)

**影响点：**

1. **插入 SQL (约第 150 行附近)** — INSERT 语句加入 `priority` 字段
2. **更新 SQL (约第 280 行附近)** — UPDATE 语句加入 `priority = ?`
3. **列表查询 SELECT (约第 60 行附近)** — 查询列中加入 `r.priority`
4. **插入参数绑定** — 参数列表中加入 `body.priority || '中'`
5. **更新参数绑定** — 参数列表中加入 `body.priority || '中'`

### 3. 前端列表 (`RequirementsPage.jsx`)

在 columns 数组中（约第 80-120 行区域）新增一列：

```jsx
{
  title: '优先级',
  dataIndex: 'priority',
  width: 80,
}
```

### 4. 前端编辑表单 (`RequirementEditor.jsx`)

在「基本信息」区域（左栏），`is_accounting` 字段旁边附近新增：

```jsx
<Form.Item label="优先级" name="priority" initialValue="中">
  <Select>
    <Option value="高">高</Option>
    <Option value="中">中</Option>
    <Option value="低">低</Option>
  </Select>
</Form.Item>
```

同时确保 `initialValues` 或 `form.setFieldsValue` 中包含 `priority` 字段的初始化。

---

## 不修改的文件

- `server/src/modules/requirements/contracts/work-item.js` — 公开契约不变
- `web/src/modules/requirements/pages/RequirementDetailPage.jsx` — 详情页不涉及
- 导出/导入 API — 本次不做

---

## 验收测试计划

| 编号 | 测试步骤 | 预期结果 |
|------|----------|----------|
| AC-001 | 新建需求，不选优先级 | 保存后列表显示「中」 |
| AC-002 | 新建需求，选「高」 | 保存后列表显示「高」 |
| AC-003 | 编辑需求，改优先级为「低」 | 保存后列表显示「低」 |
| AC-004 | 打开需求列表 | 优先级列正常显示 |
| AC-005 | API 传入非法值 | 失败或降级为「中」 |
| AC-006 | 查看迁移前的历史数据 | 优先级显示「中」 |

---

## 风险与回退

- **风险**：低。纯追加字段，无破坏性变更。
- **回退**：执行 `ALTER TABLE requirement DROP COLUMN priority;` 并还原代码。

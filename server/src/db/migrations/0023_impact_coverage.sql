-- 文件：db/migrations/0023_impact_coverage.sql
-- 用途：将「开发阶段影响性分析」「应用组装阶段测试覆盖性分析」从附件改为结构化存储。
--       两者均按需求/工单（req_code）级别组织：影响性分析登记若干变更条目，
--       测试覆盖性分析针对每个变更条目逐条登记覆盖情况（1:1）。
-- 作者：hengguan

-- 影响性分析：变更条目（每个需求/工单可含多条，按 category 决定明细字段集）
CREATE TABLE impact_change_item (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  req_code       TEXT NOT NULL,               -- 关联需求/工单编号
  category       TEXT NOT NULL,               -- 变更内容分类（联机接口/功能 等 11 类之一）
  system         TEXT,                        -- 系统名称（主责系统默认，可库内检索或手填）
  change_kind    TEXT,                        -- 变更类型：修改/新增/删除
  change_content TEXT,                        -- 变更内容
  detail         TEXT,                        -- 其余按分类变化的明细字段（JSON）
  sort_order     INTEGER NOT NULL DEFAULT 0,  -- 展示顺序
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT
);
CREATE INDEX idx_impact_req ON impact_change_item(req_code);

-- 测试覆盖性分析：针对影响性分析每个变更条目的覆盖登记
CREATE TABLE coverage_item (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  change_item_id INTEGER NOT NULL,            -- 对应 impact_change_item.id
  req_code       TEXT NOT NULL,               -- 冗余，便于按需求/工单聚合
  strategy       TEXT,                        -- 案例覆盖策略简述
  result         TEXT,                        -- 测试覆盖检查结果：未覆盖/已覆盖
  case_no        TEXT,                        -- 测试案例编号
  tester         TEXT,                        -- 测试人员
  created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at     TEXT
);
CREATE UNIQUE INDEX idx_coverage_change ON coverage_item(change_item_id);
CREATE INDEX idx_coverage_req ON coverage_item(req_code);

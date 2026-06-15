-- 0011_release_task_entity.sql
-- 用途：将投产任务（投产审批）由「仅需求」泛化为「需求或问题」。去掉 req_code 对 requirement 的外键约束，
--       新增 entity_type 区分实体类型（requirement / issue）。req_code 列名保留，语义改为「实体编号」（需求编号或问题编号），
--       以最小改动兼容 overview/dashboard/requirements/release-apply 等模块对 release_task.req_code 的既有查询。
-- 说明：node:sqlite 外键约束默认开启，且迁移在单事务内无法切换 PRAGMA，故采用「先备份子表 → 清空 → 重建主表 → 还原子表」的方式，
--       避免 DROP TABLE 触发 release_signoff/release_system 的级联删除导致会签数据丢失。投产任务 id 全程保留，子表外键不失效。
-- 作者：hengguan

-- 1) 备份并清空子表（清空后再 DROP 主表，避免级联删除的不确定性）
CREATE TABLE _release_signoff_bak AS SELECT * FROM release_signoff;
CREATE TABLE _release_system_bak  AS SELECT * FROM release_system;
DELETE FROM release_signoff;
DELETE FROM release_system;

-- 2) 重建 release_task：去掉 requirement 外键，新增 entity_type
CREATE TABLE release_task_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  req_code      TEXT NOT NULL UNIQUE,            -- 实体编号（需求编号或问题编号）
  entity_type   TEXT NOT NULL DEFAULT 'requirement', -- requirement / issue
  status        TEXT NOT NULL DEFAULT '待投产',  -- 投产状态（字典）
  owner         TEXT,                            -- 投产负责人
  registrar     TEXT,
  register_time TEXT,
  review_status TEXT NOT NULL DEFAULT '待评审',  -- 评审状态
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO release_task_new (id, req_code, entity_type, status, owner, registrar, register_time, review_status, created_at, updated_at)
  SELECT id, req_code, 'requirement', status, owner, registrar, register_time, review_status, created_at, updated_at FROM release_task;

DROP TABLE release_task;
ALTER TABLE release_task_new RENAME TO release_task;

-- 3) 还原子表数据（投产任务 id 已保留，外键有效）
INSERT INTO release_signoff SELECT * FROM _release_signoff_bak;
INSERT INTO release_system  SELECT * FROM _release_system_bak;
DROP TABLE _release_signoff_bak;
DROP TABLE _release_system_bak;

-- 0022_release_task_apply_point.sql
-- 用途：将投产审批从“按工作项唯一”调整为“按工作项 + 申请投产点唯一”。
--       同一需求/工单/问题如果在不同投产申请点投产，需要分别生成审批实例并分别会签。
-- 说明：SQLite 无法直接删除 UNIQUE 约束，因此采用重建 release_task 的方式。
--       迁移会为已有审批选择一个主申请投产点保留原 id，并为其它申请投产点复制审批、会签和投产系统记录。
-- 作者：hengguan

-- 1) 备份旧表和子表，避免重建主表时触发级联删除。
CREATE TABLE _rt_old AS SELECT * FROM release_task;
CREATE TABLE _rs_old AS SELECT * FROM release_signoff;
CREATE TABLE _ry_old AS SELECT * FROM release_system;
DELETE FROM release_signoff;
DELETE FROM release_system;

-- 2) 为每个旧审批计算应关联的申请投产点。
--    优先取引用了该工作项的投产申请点；没有申请时回退到需求/工单自身计划投产点；问题无申请时保留 NULL。
CREATE TABLE _rt_points AS
SELECT DISTINCT
  rt.id AS old_id,
  rt.req_code,
  COALESCE(ra.release_point_id, req.release_point_id, tk.release_point_id) AS release_point_id
FROM _rt_old rt
LEFT JOIN release_apply ra
  ON EXISTS (SELECT 1 FROM json_each(COALESCE(ra.ref_codes, '[]')) WHERE value = rt.req_code)
LEFT JOIN requirement req ON req.req_code = rt.req_code
LEFT JOIN ticket tk ON tk.ticket_code = rt.req_code;

CREATE TABLE _rt_primary AS
SELECT old_id, MIN(release_point_id) AS release_point_id
FROM _rt_points
GROUP BY old_id;

-- 3) 重建 release_task：同一工作项可以在不同申请投产点下分别审批。
CREATE TABLE release_task_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  req_code         TEXT NOT NULL,                  -- 实体编号（需求编号、工单编号或问题编号）
  release_point_id INTEGER REFERENCES release_point(id), -- 申请投产点
  entity_type      TEXT NOT NULL DEFAULT 'requirement', -- requirement / ticket / issue / unknown
  status           TEXT NOT NULL DEFAULT '待投产',  -- 投产状态（字典）
  owner            TEXT,                            -- 投产负责人
  registrar        TEXT,
  register_time    TEXT,
  review_status    TEXT NOT NULL DEFAULT '待评审',  -- 评审状态
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(req_code, release_point_id)
);

-- 主申请投产点沿用旧 id，最大限度保留历史引用。
INSERT INTO release_task_new
  (id, req_code, release_point_id, entity_type, status, owner, registrar, register_time, review_status, created_at, updated_at)
SELECT
  rt.id, rt.req_code, p.release_point_id, rt.entity_type, rt.status, rt.owner, rt.registrar,
  rt.register_time, rt.review_status, rt.created_at, rt.updated_at
FROM _rt_old rt
LEFT JOIN _rt_primary p ON p.old_id = rt.id;

DROP TABLE release_task;
ALTER TABLE release_task_new RENAME TO release_task;
CREATE INDEX idx_release_task_code_point ON release_task(req_code, release_point_id);
CREATE INDEX idx_release_task_point ON release_task(release_point_id);

-- 其它申请投产点复制为新的审批实例，用于后续分别会签。
INSERT INTO release_task
  (req_code, release_point_id, entity_type, status, owner, registrar, register_time, review_status, created_at, updated_at)
SELECT
  rt.req_code, p.release_point_id, rt.entity_type, rt.status, rt.owner, rt.registrar,
  rt.register_time, rt.review_status, rt.created_at, rt.updated_at
FROM _rt_old rt
JOIN _rt_points p ON p.old_id = rt.id
LEFT JOIN _rt_primary pri ON pri.old_id = rt.id
WHERE (
  (p.release_point_id IS NOT NULL AND pri.release_point_id IS NOT NULL AND p.release_point_id != pri.release_point_id)
  OR (p.release_point_id IS NOT NULL AND pri.release_point_id IS NULL)
);

-- 4) 按新审批实例还原/复制会签和投产系统记录。
INSERT INTO release_signoff
  (release_task_id, role_id, role_name, signer_user_id, signer_name, result, conclusion, sign_time, created_at, updated_at, signature_path)
SELECT
  new_rt.id, so.role_id, so.role_name, so.signer_user_id, so.signer_name, so.result, so.conclusion,
  so.sign_time, so.created_at, so.updated_at, so.signature_path
FROM _rs_old so
JOIN _rt_old old_rt ON old_rt.id = so.release_task_id
JOIN release_task new_rt ON new_rt.req_code = old_rt.req_code
WHERE (
  new_rt.release_point_id IS NOT NULL
  OR NOT EXISTS (SELECT 1 FROM _rt_points p WHERE p.old_id = old_rt.id AND p.release_point_id IS NOT NULL)
);

INSERT INTO release_system
  (release_task_id, system_code, impl_org, actual_release_time, status, created_at, updated_at)
SELECT
  new_rt.id, rs.system_code, rs.impl_org, rs.actual_release_time, rs.status, rs.created_at, rs.updated_at
FROM _ry_old rs
JOIN _rt_old old_rt ON old_rt.id = rs.release_task_id
JOIN release_task new_rt ON new_rt.req_code = old_rt.req_code
WHERE (
  new_rt.release_point_id IS NOT NULL
  OR NOT EXISTS (SELECT 1 FROM _rt_points p WHERE p.old_id = old_rt.id AND p.release_point_id IS NOT NULL)
);

DROP TABLE _rt_old;
DROP TABLE _rs_old;
DROP TABLE _ry_old;
DROP TABLE _rt_points;
DROP TABLE _rt_primary;

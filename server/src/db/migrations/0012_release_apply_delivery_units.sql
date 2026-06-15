-- 0012_release_apply_delivery_units.sql
-- 用途：投产申请支持「多组交付制品」。将原单值字段 artifact_type/delivery_unit/new_version/ferry_status
--       合并为一个 JSON 数组列 delivery_units，每个元素为一组 {artifact_type, delivery_unit, new_version, ferry_status}。
-- 说明：release_apply 无子表引用，且作为 release_point 的子表重建不触发级联；存量单值数据迁移为单元素数组。
-- 作者：hengguan

CREATE TABLE release_apply_new (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  change_code       TEXT NOT NULL UNIQUE,   -- 变更编号
  change_content    TEXT NOT NULL,          -- 变更内容
  impact_scope      TEXT,                   -- 影响范围
  change_system     TEXT,                   -- 变更系统（系统编号）
  impl_org          TEXT,                   -- 实施机构
  delivery_units    TEXT,                   -- 交付制品（JSON 数组：[{artifact_type, delivery_unit, new_version, ferry_status}]）
  ref_codes         TEXT,                   -- 问题/需求编号（JSON 数组）
  review_status     TEXT,                   -- 评审状态（派生）
  out_dept          TEXT,                   -- 变更负责部门（输出口径）
  deploy_dept       TEXT,                   -- 变更负责部门（部署口径）
  release_point_id  INTEGER REFERENCES release_point(id), -- 计划投产点
  registrar         TEXT,
  register_time     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

INSERT INTO release_apply_new
  (id, change_code, change_content, impact_scope, change_system, impl_org, delivery_units, ref_codes, review_status,
   out_dept, deploy_dept, release_point_id, registrar, register_time, created_at, updated_at)
SELECT
  id, change_code, change_content, impact_scope, change_system, impl_org,
  CASE WHEN (artifact_type IS NOT NULL OR delivery_unit IS NOT NULL OR new_version IS NOT NULL OR ferry_status IS NOT NULL)
    THEN json_array(json_object(
           'artifact_type', artifact_type,
           'delivery_unit', delivery_unit,
           'new_version', new_version,
           'ferry_status', COALESCE(ferry_status, '未摆渡')))
    ELSE '[]' END,
  ref_codes, review_status, out_dept, deploy_dept, release_point_id, registrar, register_time, created_at, updated_at
FROM release_apply;

DROP TABLE release_apply;
ALTER TABLE release_apply_new RENAME TO release_apply;

CREATE INDEX idx_release_apply_rp ON release_apply(release_point_id);
CREATE INDEX idx_release_apply_system ON release_apply(change_system);

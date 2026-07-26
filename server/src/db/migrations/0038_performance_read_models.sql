-- 文件：0038_performance_read_models.sql
-- 说明：为投产申请的 JSON 关联编号建立可索引读模型，并补齐高频列表的复合索引。
-- 用途：降低投产审批、版本概览和审计列表在大数据量下的全表扫描与逐条查询成本。
-- 作者：hengguan

CREATE TABLE release_apply_reference (
  release_apply_id INTEGER NOT NULL,
  ref_code TEXT NOT NULL,
  release_point_id INTEGER,
  PRIMARY KEY (release_apply_id, ref_code),
  FOREIGN KEY (release_apply_id) REFERENCES release_apply(id) ON DELETE CASCADE,
  FOREIGN KEY (release_point_id) REFERENCES release_point(id)
);

-- 为已存在的 JSON 数据回填关系表；JSON 字段仍保留，保证既有接口和导入文件完全兼容。
INSERT OR IGNORE INTO release_apply_reference (release_apply_id, ref_code, release_point_id)
SELECT ra.id, CAST(ref.value AS TEXT), ra.release_point_id
  FROM release_apply ra, json_each(COALESCE(ra.ref_codes, '[]')) ref
 WHERE TRIM(CAST(ref.value AS TEXT)) <> '';

CREATE INDEX idx_release_apply_reference_code_point
  ON release_apply_reference(ref_code, release_point_id);
CREATE INDEX idx_release_apply_reference_point_code
  ON release_apply_reference(release_point_id, ref_code);
CREATE INDEX idx_release_system_task_code
  ON release_system(release_task_id, system_code);
CREATE INDEX idx_audit_entity_created
  ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_stage_field_value_entity_definition
  ON stage_field_value(entity_type, entity_id, field_definition_id, ordinal);

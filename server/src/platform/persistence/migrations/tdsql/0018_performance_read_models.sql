-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0018_performance_read_models.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- 文件：0018_performance_read_models.sql
-- 说明：为投产申请的 JSON 关联编号建立可索引读模型，并补齐高频列表的复合索引。
-- 用途：降低投产审批、版本概览和审计列表在大数据量下的全表扫描与逐条查询成本。
-- 作者：hengguan

CREATE TABLE release_apply_reference (
  release_apply_id BIGINT NOT NULL,
  ref_code VARCHAR(255) NOT NULL,
  release_point_id BIGINT NULL,
  PRIMARY KEY (release_apply_id, ref_code),
  KEY idx_release_apply_reference_code_point (ref_code, release_point_id),
  KEY idx_release_apply_reference_point_code (release_point_id, ref_code),
  CONSTRAINT fk_release_apply_reference_apply FOREIGN KEY (release_apply_id) REFERENCES release_apply(id) ON DELETE CASCADE,
  CONSTRAINT fk_release_apply_reference_point FOREIGN KEY (release_point_id) REFERENCES release_point(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- MySQL 8/TDSQL 使用 JSON_TABLE 读取历史 JSON 数据；JSON 字段继续保留为兼容写模型。
INSERT IGNORE INTO release_apply_reference (release_apply_id, ref_code, release_point_id)
SELECT ra.id, refs.ref_code, ra.release_point_id
  FROM release_apply ra
  JOIN JSON_TABLE(COALESCE(ra.ref_codes, JSON_ARRAY()), '$[*]'
       COLUMNS (ref_code VARCHAR(255) PATH '$')) refs
 WHERE TRIM(refs.ref_code) <> '';

ALTER TABLE release_system ADD INDEX idx_release_system_task_code (release_task_id, system_code);
ALTER TABLE audit_log ADD INDEX idx_audit_entity_created (entity_type, entity_id, created_at DESC);
ALTER TABLE stage_field_value ADD INDEX idx_stage_field_value_entity_definition (entity_type, entity_id, field_definition_id, ordinal);

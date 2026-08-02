-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0026_attachment_versioning.sql
-- 说明：为统一附件补充逻辑交付项、不可变版本链、软删除及上传人快照。
-- 用途：TDSQL/MySQL 8 数据结构迁移；与 SQLite 0046 保持等价语义。
-- 作者：hengguan
-- ============================================================================

ALTER TABLE attachment
  ADD COLUMN logical_item_id VARCHAR(64) NULL,
  ADD COLUMN version_no INT NOT NULL DEFAULT 1,
  ADD COLUMN is_current TINYINT NOT NULL DEFAULT 1,
  ADD COLUMN is_deleted TINYINT NOT NULL DEFAULT 0,
  ADD COLUMN uploader_phone VARCHAR(64) NULL,
  ADD COLUMN uploader_name VARCHAR(128) NULL;

UPDATE attachment
   SET logical_item_id = CONCAT('attgrp_', id),
       uploader_name = COALESCE(uploader_name, uploader),
       version_no = COALESCE(version_no, 1),
       is_current = COALESCE(is_current, 1),
       is_deleted = COALESCE(is_deleted, 0)
 WHERE logical_item_id IS NULL OR logical_item_id = '';

ALTER TABLE attachment
  MODIFY COLUMN logical_item_id VARCHAR(64) NOT NULL,
  ADD COLUMN active_logical_item_id VARCHAR(64)
    GENERATED ALWAYS AS (CASE WHEN is_current = 1 AND is_deleted = 0 THEN logical_item_id ELSE NULL END) STORED,
  ADD UNIQUE KEY uq_attachment_logical_version (logical_item_id, version_no),
  ADD UNIQUE KEY uq_attachment_single_current (active_logical_item_id),
  ADD KEY idx_attachment_entity_current (entity_type, entity_id, field_key, is_current, is_deleted);

INSERT IGNORE INTO app_config (`key`, value, remark)
VALUES
  ('deliverable.preview.enabled', '', '交付件在线预览开关（留空时使用部署环境回退值）'),
  ('deliverable.preview.kkFileViewBaseUrl', '', 'kkFileView 服务地址（留空时使用部署环境回退值）');

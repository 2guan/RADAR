-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0046_attachment_versioning.sql
-- 说明：为统一附件补充逻辑交付项、不可变版本链、软删除及上传人快照。
-- 用途：SQLite 数据结构迁移；历史附件各自成为版本 1，保留现有上传人和时间。
-- 作者：hengguan
-- ============================================================================

ALTER TABLE attachment ADD COLUMN logical_item_id TEXT;
ALTER TABLE attachment ADD COLUMN version_no INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attachment ADD COLUMN is_current INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attachment ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE attachment ADD COLUMN uploader_phone TEXT;
ALTER TABLE attachment ADD COLUMN uploader_name TEXT;

UPDATE attachment
   SET logical_item_id = 'attgrp_' || id,
       uploader_name = COALESCE(uploader_name, uploader),
       version_no = COALESCE(version_no, 1),
       is_current = COALESCE(is_current, 1),
       is_deleted = COALESCE(is_deleted, 0)
 WHERE logical_item_id IS NULL OR logical_item_id = '';

CREATE UNIQUE INDEX uq_attachment_logical_version ON attachment(logical_item_id, version_no);
CREATE UNIQUE INDEX uq_attachment_single_current
  ON attachment(logical_item_id)
  WHERE is_current = 1 AND is_deleted = 0;
CREATE INDEX idx_attachment_entity_current
  ON attachment(entity_type, entity_id, field_key, is_current, is_deleted);

INSERT OR IGNORE INTO app_config (key, value, remark)
VALUES
  ('deliverable.preview.enabled', '', '交付件在线预览开关（留空时使用部署环境回退值）'),
  ('deliverable.preview.kkFileViewBaseUrl', '', 'kkFileView 服务地址（留空时使用部署环境回退值）');

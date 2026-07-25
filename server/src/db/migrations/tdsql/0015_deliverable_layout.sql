-- ============================================================================
-- 文件：0015_deliverable_layout.sql
-- 用途：TDSQL 版公共交付件详情布局位置。
-- ============================================================================

ALTER TABLE deliverable_definition ADD COLUMN layout_mode VARCHAR(16) NOT NULL DEFAULT 'left';

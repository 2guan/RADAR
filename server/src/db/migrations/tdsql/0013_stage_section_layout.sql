-- ============================================================================
-- 文件：0013_stage_section_layout.sql
-- 用途：TDSQL 版阶段内容分区布局位置。
-- ============================================================================

ALTER TABLE stage_section ADD COLUMN layout_mode VARCHAR(16) NOT NULL DEFAULT 'left';

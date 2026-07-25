-- ============================================================================
-- 文件：0016_stage_section_title_visibility.sql
-- 用途：TDSQL 版分区标题显示控制。
-- ============================================================================

ALTER TABLE stage_section ADD COLUMN show_title TINYINT NOT NULL DEFAULT 1;

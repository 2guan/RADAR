-- ============================================================================
-- 文件：0036_stage_section_title_visibility.sql
-- 用途：支持分区标题显示控制；交付件可只展示各项名称而隐藏总分区标题。
-- ============================================================================

ALTER TABLE stage_section ADD COLUMN show_title INTEGER NOT NULL DEFAULT 1;

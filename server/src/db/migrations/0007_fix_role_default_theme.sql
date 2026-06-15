-- ============================================================================
-- 文件：0007_fix_role_default_theme.sql
-- 用途：修复角色表中的初始默认主题。原本错误地填充为了 'light'，
--       现统一修正为 8 种主题中的第一个（'sky' / 蔚蓝）。
-- 作者：hengguan
-- ============================================================================

UPDATE role SET default_theme = 'sky' WHERE default_theme = 'light' OR default_theme IS NULL OR default_theme = '';

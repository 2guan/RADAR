-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0007_fix_role_default_theme.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- ============================================================================
-- 文件：0007_fix_role_default_theme.sql
-- 用途：修复角色表中的初始默认主题。原本错误地填充为了 'light'，
--       现统一修正为 8 种主题中的第一个（'sky' / 蔚蓝）。
-- 作者：hengguan
-- ============================================================================

UPDATE role SET default_theme = 'sky' WHERE default_theme = 'light' OR default_theme IS NULL OR default_theme = '';

-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0010_split_role_signoff_config.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- ============================================================================
-- 文件：tdsql/0010_split_role_signoff_config.sql
-- 用途：将会签检查内容拆分为责任方、会签职责和会签评审点。
-- ============================================================================

ALTER TABLE role ADD COLUMN signoff_responsible_party TEXT;
ALTER TABLE role ADD COLUMN signoff_responsibility TEXT;
ALTER TABLE role ADD COLUMN signoff_review_points TEXT;

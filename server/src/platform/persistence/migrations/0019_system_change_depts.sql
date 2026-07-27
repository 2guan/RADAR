-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0019_system_change_depts.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- 文件：db/migrations/0019_system_change_depts.sql
-- 用途：为系统清单补充外联部门与投产部门字段。
-- 作者：hengguan

ALTER TABLE system ADD COLUMN out_dept TEXT;
ALTER TABLE system ADD COLUMN deploy_dept TEXT;

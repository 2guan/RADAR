-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0014_requirement_issue_no.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- 文件：db/migrations/0014_requirement_issue_no.sql
-- 用途：为需求表增加关联问题/工单编号字段。
-- 作者：hengguan

ALTER TABLE requirement ADD COLUMN issue_no TEXT;

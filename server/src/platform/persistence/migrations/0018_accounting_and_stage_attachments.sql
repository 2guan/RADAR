-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0018_accounting_and_stage_attachments.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- 文件：db/migrations/0018_accounting_and_stage_attachments.sql
-- 用途：为需求与工单补充是否会计类字段，并修正历史空值。
-- 作者：hengguan

ALTER TABLE requirement ADD COLUMN is_accounting TEXT NOT NULL DEFAULT '否';
ALTER TABLE ticket ADD COLUMN is_accounting TEXT NOT NULL DEFAULT '否';

UPDATE requirement SET is_accounting = '否' WHERE is_accounting IS NULL OR is_accounting = '';
UPDATE ticket SET is_accounting = '否' WHERE is_accounting IS NULL OR is_accounting = '';

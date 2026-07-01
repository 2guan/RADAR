-- 文件：db/migrations/0018_accounting_and_stage_attachments.sql
-- 用途：为需求与工单补充是否会计类字段，并修正历史空值。
-- 作者：hengguan

ALTER TABLE requirement ADD COLUMN is_accounting TEXT NOT NULL DEFAULT '否';
ALTER TABLE ticket ADD COLUMN is_accounting TEXT NOT NULL DEFAULT '否';

UPDATE requirement SET is_accounting = '否' WHERE is_accounting IS NULL OR is_accounting = '';
UPDATE ticket SET is_accounting = '否' WHERE is_accounting IS NULL OR is_accounting = '';

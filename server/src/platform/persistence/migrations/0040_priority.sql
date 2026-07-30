-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0040_priority.sql
-- 说明：RADAR 历史数据库迁移脚本，按 SQLite 版本顺序执行。
-- 用途：为需求与工单增加固定枚举优先级，并补齐历史记录默认值。
-- 作者：hengguan
-- ============================================================================

ALTER TABLE requirement ADD COLUMN priority TEXT NOT NULL DEFAULT '中';
ALTER TABLE ticket ADD COLUMN priority TEXT NOT NULL DEFAULT '中';

UPDATE requirement SET priority = '中' WHERE priority IS NULL OR TRIM(priority) = '';
UPDATE ticket SET priority = '中' WHERE priority IS NULL OR TRIM(priority) = '';

CREATE INDEX idx_req_priority ON requirement(priority);
CREATE INDEX idx_ticket_priority ON ticket(priority);

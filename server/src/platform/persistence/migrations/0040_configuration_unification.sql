-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0040_configuration_unification.sql
-- 说明：仅追加列和表；不改写已有业务记录或管理员配置。
-- 用途：为需求/工单优先级和内置配置的独立升级台账建立可回溯存储。
-- 作者：hengguan
-- ============================================================================

ALTER TABLE requirement ADD COLUMN priority TEXT NOT NULL DEFAULT '中';
ALTER TABLE ticket ADD COLUMN priority TEXT NOT NULL DEFAULT '中';
CREATE INDEX idx_req_priority ON requirement(priority);
CREATE INDEX idx_ticket_priority ON ticket(priority);

CREATE TABLE configuration_upgrade_ledger (
  upgrade_id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  details TEXT NOT NULL DEFAULT '{}'
);

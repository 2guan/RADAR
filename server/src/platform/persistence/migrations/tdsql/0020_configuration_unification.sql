-- ============================================================================
-- 文件：tdsql/0020_configuration_unification.sql
-- 用途：TDSQL/MySQL 8 对等新增优先级列和内置配置升级台账。
-- 说明：仅追加列和表；不改写已有业务记录或管理员配置。
-- 作者：hengguan
-- ============================================================================

ALTER TABLE requirement ADD COLUMN priority VARCHAR(16) NOT NULL DEFAULT '中';
ALTER TABLE ticket ADD COLUMN priority VARCHAR(16) NOT NULL DEFAULT '中';
CREATE INDEX idx_req_priority ON requirement(priority);
CREATE INDEX idx_ticket_priority ON ticket(priority);

CREATE TABLE configuration_upgrade_ledger (
  upgrade_id VARCHAR(128) PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  details LONGTEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

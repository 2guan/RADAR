-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0021_analysis_fields.sql
-- 说明：TDSQL/MySQL 8 迁移，新增字段保持可空以兼容已有需求与工单记录。
-- 用途：为需求分析与工单分析补充实施机构、需求接收人和工作量字段（TDSQL/MySQL 8）。
-- 作者：hengguan
-- ============================================================================

ALTER TABLE requirement ADD COLUMN implementation_org VARCHAR(255) NULL;
ALTER TABLE requirement ADD COLUMN receiver VARCHAR(128) NULL;
ALTER TABLE requirement ADD COLUMN workload VARCHAR(255) NULL;
CREATE INDEX idx_requirement_implementation_org ON requirement(implementation_org);
CREATE INDEX idx_requirement_receiver ON requirement(receiver);

ALTER TABLE ticket ADD COLUMN implementation_org VARCHAR(255) NULL;
ALTER TABLE ticket ADD COLUMN receiver VARCHAR(128) NULL;
ALTER TABLE ticket ADD COLUMN workload VARCHAR(255) NULL;
CREATE INDEX idx_ticket_implementation_org ON ticket(implementation_org);
CREATE INDEX idx_ticket_receiver ON ticket(receiver);

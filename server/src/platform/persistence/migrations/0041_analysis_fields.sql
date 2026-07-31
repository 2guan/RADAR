-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0041_analysis_fields.sql
-- 说明：SQLite 迁移，新增字段保持可空以兼容已有需求与工单记录。
-- 用途：为需求分析与工单分析补充实施机构、需求接收人和工作量字段。
-- 作者：hengguan
-- ============================================================================

ALTER TABLE requirement ADD COLUMN implementation_org TEXT;
ALTER TABLE requirement ADD COLUMN receiver TEXT;
ALTER TABLE requirement ADD COLUMN workload TEXT;
CREATE INDEX idx_requirement_implementation_org ON requirement(implementation_org);
CREATE INDEX idx_requirement_receiver ON requirement(receiver);

ALTER TABLE ticket ADD COLUMN implementation_org TEXT;
ALTER TABLE ticket ADD COLUMN receiver TEXT;
ALTER TABLE ticket ADD COLUMN workload TEXT;
CREATE INDEX idx_ticket_implementation_org ON ticket(implementation_org);
CREATE INDEX idx_ticket_receiver ON ticket(receiver);

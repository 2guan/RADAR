-- ============================================================================
-- 文件：tdsql/0010_split_role_signoff_config.sql
-- 用途：将会签检查内容拆分为责任方、会签职责和会签评审点。
-- ============================================================================

ALTER TABLE role ADD COLUMN signoff_responsible_party TEXT;
ALTER TABLE role ADD COLUMN signoff_responsibility TEXT;
ALTER TABLE role ADD COLUMN signoff_review_points TEXT;

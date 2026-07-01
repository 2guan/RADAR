-- 文件：db/migrations/0014_requirement_issue_no.sql
-- 用途：为需求表增加关联问题/工单编号字段。
-- 作者：hengguan

ALTER TABLE requirement ADD COLUMN issue_no TEXT;

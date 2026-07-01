-- 文件：db/migrations/0019_system_change_depts.sql
-- 用途：为系统清单补充外联部门与投产部门字段。
-- 作者：hengguan

ALTER TABLE system ADD COLUMN out_dept TEXT;
ALTER TABLE system ADD COLUMN deploy_dept TEXT;

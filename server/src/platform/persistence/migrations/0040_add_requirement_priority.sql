-- 0040_add_requirement_priority.sql
-- 用途：为需求表增加优先级字段，默认值为"中"
ALTER TABLE requirement ADD COLUMN priority TEXT NOT NULL DEFAULT '中';
UPDATE requirement SET priority = '中' WHERE priority IS NULL OR priority = '';

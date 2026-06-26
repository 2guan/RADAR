-- 内置“投产点待定”，用于尚未明确投产日期的需求/工单归集。
INSERT INTO release_point (release_date, version_type, remark, is_default, is_archived)
SELECT '投产点待定', '常规版本', '系统内置投产点', 0, 0
WHERE NOT EXISTS (
  SELECT 1 FROM release_point WHERE release_date = '投产点待定'
);

UPDATE release_point
SET version_type = '常规版本'
WHERE release_date = '投产点待定'
  AND (version_type IS NULL OR version_type = '');

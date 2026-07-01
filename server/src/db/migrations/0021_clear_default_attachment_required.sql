-- 0021_clear_default_attachment_required.sql
-- 用途：移除旧版内置的附件终态必填默认值，附件必填完全交由“必填项设置”维护。
-- 作者：hengguan

UPDATE app_config
SET value = json_remove(
  value,
  '$.requirement."attachment:需求说明书"',
  '$.dev."attachment:影响性分析文档"',
  '$.test."attachment:测试报告"',
  '$.test."attachment:测试覆盖设计文档"'
)
WHERE key = 'required.fields'
  AND json_valid(value);

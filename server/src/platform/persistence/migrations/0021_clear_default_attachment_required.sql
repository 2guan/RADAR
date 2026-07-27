-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0021_clear_default_attachment_required.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- 0021_clear_default_attachment_required.sql
-- 用途：移除旧版内置的附件终态必填默认值，附件必填完全交由“检查内容设置”维护。
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

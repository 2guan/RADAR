-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0015_proposer_to_array.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- 文件：db/migrations/0015_proposer_to_array.sql
-- 用途：将需求表 proposer 字段历史数据转换为 JSON 数组格式。
-- 作者：hengguan

UPDATE requirement
SET proposer = json_array(proposer)
WHERE proposer IS NOT NULL
  AND proposer != ''
  AND proposer NOT LIKE '[%';

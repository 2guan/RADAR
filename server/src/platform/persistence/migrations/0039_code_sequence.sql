-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0039_code_sequence.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- 文件：0039_code_sequence.sql
-- 说明：按编号规则与固定前缀维护下一可用序号，避免高并发创建时重复扫描业务表。
-- 用途：为需求、工单、开发、测试和投产申请提供可持久化、可原子递增的业务编号序列。
-- 作者：hengguan

CREATE TABLE code_sequence (
  rule_key   TEXT NOT NULL,
  prefix     TEXT NOT NULL,
  next_value INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY (rule_key, prefix)
);

-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0037_dict_category.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- ============================================================================
-- 文件：0037_dict_category.sql
-- 用途：维护字典分类的中文展示名称，避免在配置页面暴露内部分类编码。
-- ============================================================================

CREATE TABLE IF NOT EXISTS dict_category (
  category   TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  sort       INTEGER NOT NULL DEFAULT 0,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

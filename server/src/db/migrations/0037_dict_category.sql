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

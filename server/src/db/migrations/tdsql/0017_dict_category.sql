-- ============================================================================
-- 文件：0017_dict_category.sql
-- 用途：TDSQL 版字典分类中文展示名称。
-- ============================================================================

CREATE TABLE IF NOT EXISTS dict_category (
  category   VARCHAR(128) PRIMARY KEY,
  label      VARCHAR(255) NOT NULL,
  sort       INT NOT NULL DEFAULT 0,
  enabled    TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

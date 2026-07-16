-- 0002_release_task_apply_point.sql
-- 用途：将 TDSQL 环境中的投产审批调整为“工作项 + 申请投产点”维度。
-- 作者：hengguan

-- TDSQL 的 0001_init.sql 已经合并了历史最终 schema，新库初始化后会天然包含
-- release_point_id、唯一索引和外键；旧库升级时则需要补齐。这里按实际结构检查，
-- 避免清空/重建 TDSQL 数据库后重复执行升级 DDL 导致启动失败。
SET @schema_name = DATABASE();

SET @release_point_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'release_task'
    AND COLUMN_NAME = 'release_point_id'
);
SET @sql = IF(
  @release_point_column_exists = 0,
  'ALTER TABLE release_task ADD COLUMN release_point_id BIGINT NULL AFTER req_code',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 历史 UNIQUE(req_code) 通常由 MySQL 自动命名为 req_code。
-- 这里按索引列自动查找，兼容目标环境索引名不同的情况。
SET @old_req_code_unique_index = (
  SELECT INDEX_NAME
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'release_task'
    AND NON_UNIQUE = 0
    AND INDEX_NAME <> 'PRIMARY'
  GROUP BY INDEX_NAME
  HAVING GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) = 'req_code'
  LIMIT 1
);
SET @sql = IF(
  @old_req_code_unique_index IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE release_task DROP INDEX `', REPLACE(@old_req_code_unique_index, '`', '``'), '`')
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE release_task rt
LEFT JOIN requirement req ON req.req_code = rt.req_code
LEFT JOIN ticket tk ON tk.ticket_code = rt.req_code
SET rt.release_point_id = COALESCE(
  (
    SELECT MIN(ra.release_point_id)
    FROM release_apply ra
    WHERE JSON_CONTAINS(COALESCE(ra.ref_codes, JSON_ARRAY()), JSON_QUOTE(rt.req_code))
  ),
  req.release_point_id,
  tk.release_point_id
);

SET @code_point_unique_exists = (
  SELECT COUNT(*)
  FROM (
    SELECT INDEX_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = @schema_name
      AND TABLE_NAME = 'release_task'
      AND NON_UNIQUE = 0
      AND INDEX_NAME <> 'PRIMARY'
    GROUP BY INDEX_NAME
    HAVING GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) = 'req_code,release_point_id'
  ) matched_indexes
);
SET @sql = IF(
  @code_point_unique_exists = 0,
  'ALTER TABLE release_task ADD UNIQUE KEY uk_release_task_code_point (req_code, release_point_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @release_point_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name
    AND TABLE_NAME = 'release_task'
    AND COLUMN_NAME = 'release_point_id'
    AND SEQ_IN_INDEX = 1
);
SET @sql = IF(
  @release_point_index_exists = 0,
  'ALTER TABLE release_task ADD INDEX idx_release_task_point (release_point_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @release_point_fk_exists = (
  SELECT COUNT(*)
  FROM information_schema.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = @schema_name
    AND TABLE_NAME = 'release_task'
    AND CONSTRAINT_NAME = 'fk_release_task_release_point'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY'
);
SET @sql = IF(
  @release_point_fk_exists = 0,
  'ALTER TABLE release_task ADD CONSTRAINT fk_release_task_release_point FOREIGN KEY (release_point_id) REFERENCES release_point(id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

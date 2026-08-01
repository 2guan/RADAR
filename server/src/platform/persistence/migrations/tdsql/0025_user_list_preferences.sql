-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0025_user_list_preferences.sql
-- 说明：保存按用户隔离的业务列表列显示、顺序和宽度偏好。
-- 用途：TDSQL/MySQL 8 数据结构迁移。
-- 作者：hengguan
-- ============================================================================

CREATE TABLE user_list_preference (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id     BIGINT NOT NULL,
  list_key    VARCHAR(96) NOT NULL,
  payload     JSON NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_list_preference_user_list (user_id, list_key),
  INDEX idx_user_list_preference_user (user_id),
  CONSTRAINT fk_user_list_preference_user FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0045_user_list_preferences.sql
-- 说明：保存按用户隔离的业务列表列显示、顺序和宽度偏好。
-- 用途：SQLite 数据结构迁移。
-- 作者：hengguan
-- ============================================================================

CREATE TABLE user_list_preference (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  list_key    TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(user_id, list_key)
);

CREATE INDEX idx_user_list_preference_user ON user_list_preference(user_id);

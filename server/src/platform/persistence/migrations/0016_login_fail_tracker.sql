-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0016_login_fail_tracker.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- 文件：0016_login_fail_tracker.sql
-- 用途：统一的登录失败追踪表。无论用户是否存在（防止用户枚举），
--       所有手机号的登录失败计数与锁定状态均以此表为准。
-- 作者：hengguan
-- 说明：支持登录失败锁定（lockout）与验证码触发的统一追踪。
--       成功登录后对应记录会被删除。

CREATE TABLE IF NOT EXISTS login_fail_tracker (
  phone         TEXT NOT NULL PRIMARY KEY,
  fail_count    INTEGER NOT NULL DEFAULT 0,
  lockout_until TEXT,
  last_attempt_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

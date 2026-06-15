-- 文件：0005_security_hardening.sql
-- 用途：增加密码安全相关的用户表字段（登录失败次数计数、锁定时间、密码修改时间）。
-- 作者：hengguan
-- 说明：
--   login_fail_count: 连续登录失败次数
--   lockout_until: 限制登录到期时间
--   password_changed_at: 密码修改时间，用于密码定期过期策略

ALTER TABLE user ADD COLUMN login_fail_count INTEGER DEFAULT 0;
ALTER TABLE user ADD COLUMN lockout_until TEXT DEFAULT NULL;
ALTER TABLE user ADD COLUMN password_changed_at TEXT DEFAULT NULL;

-- 历史数据初始化为当前时间，避免已有用户立即过期
UPDATE user SET password_changed_at = datetime('now','localtime') WHERE password_changed_at IS NULL;

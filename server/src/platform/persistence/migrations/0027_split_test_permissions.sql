-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0027_split_test_permissions.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- ============================================================================
-- 将原“测试管理”权限拆分为 SIT、UAT、NFT、SEC 四类测试权限。
-- ============================================================================

INSERT INTO permission (role_id, module_key, action_key, allowed)
SELECT p.role_id, scope.module_key, p.action_key, p.allowed
FROM permission p
CROSS JOIN (
  SELECT 'test.SIT' AS module_key
  UNION ALL SELECT 'test.UAT'
  UNION ALL SELECT 'test.NFT'
  UNION ALL SELECT 'test.SEC'
) AS scope
WHERE p.module_key = 'test'
ON CONFLICT(role_id, module_key, action_key) DO UPDATE SET allowed = excluded.allowed;

DELETE FROM permission WHERE module_key = 'test';

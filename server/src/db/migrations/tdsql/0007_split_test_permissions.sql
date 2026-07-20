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
ON DUPLICATE KEY UPDATE allowed = VALUES(allowed);

DELETE FROM permission WHERE module_key = 'test';

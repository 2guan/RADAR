-- ============================================================================
-- 将已废弃的开发/测试承接权限合并到对应模块的“新增”权限。
-- ============================================================================

INSERT INTO permission (role_id, module_key, action_key, allowed)
SELECT role_id, 'dev', 'create', 1
FROM permission
WHERE module_key = 'dev' AND action_key = 'dev.intake' AND allowed = 1
ON DUPLICATE KEY UPDATE allowed = 1;

INSERT INTO permission (role_id, module_key, action_key, allowed)
SELECT role_id, 'test', 'create', 1
FROM permission
WHERE module_key = 'test' AND action_key = 'test.intake' AND allowed = 1
ON DUPLICATE KEY UPDATE allowed = 1;

DELETE FROM permission
WHERE (module_key = 'dev' AND action_key = 'dev.intake')
   OR (module_key = 'test' AND action_key = 'test.intake');

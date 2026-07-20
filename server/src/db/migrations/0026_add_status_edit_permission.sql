-- ============================================================================
-- 为已有具备编辑权限的角色补充“调整状态”权限，保持升级前的状态调整能力。
-- ============================================================================

INSERT INTO permission (role_id, module_key, action_key, allowed)
SELECT role_id, module_key, 'status.edit', 1
FROM permission
WHERE module_key IN ('requirement', 'ticket', 'dev', 'test', 'release')
  AND action_key = 'edit'
  AND allowed = 1
ON CONFLICT(role_id, module_key, action_key) DO UPDATE SET allowed = 1;

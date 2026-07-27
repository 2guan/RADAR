-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0026_add_status_edit_permission.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
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

-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0025_merge_intake_permissions.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- ============================================================================
-- 将已废弃的开发/测试承接权限合并到对应模块的“新增”权限。
-- ============================================================================

INSERT INTO permission (role_id, module_key, action_key, allowed)
SELECT role_id, 'dev', 'create', 1
FROM permission
WHERE module_key = 'dev' AND action_key = 'dev.intake' AND allowed = 1
ON CONFLICT(role_id, module_key, action_key) DO UPDATE SET allowed = 1;

INSERT INTO permission (role_id, module_key, action_key, allowed)
SELECT role_id, 'test', 'create', 1
FROM permission
WHERE module_key = 'test' AND action_key = 'test.intake' AND allowed = 1
ON CONFLICT(role_id, module_key, action_key) DO UPDATE SET allowed = 1;

DELETE FROM permission
WHERE (module_key = 'dev' AND action_key = 'dev.intake')
   OR (module_key = 'test' AND action_key = 'test.intake');

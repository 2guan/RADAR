-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0022_role_and_user_all_org_access.sql
-- 说明：TDSQL/MySQL 8 迁移，为角色默认数据范围和人员单独覆盖新增权限字段。
-- 用途：支持全机构权限的角色默认值、人员覆盖值及指定角色的受限默认回填。
-- 作者：hengguan
-- ============================================================================

-- 角色级全机构权限默认值与人员单独覆盖（TDSQL/MySQL 8）。
ALTER TABLE role ADD COLUMN all_org_access TINYINT NOT NULL DEFAULT 1;
ALTER TABLE user ADD COLUMN all_org_access_override TINYINT NULL DEFAULT NULL;

UPDATE role
   SET all_org_access = 0
 WHERE code IN ('金科开发', '农信开发', '金科业务', '农信业务', '机构负责人');

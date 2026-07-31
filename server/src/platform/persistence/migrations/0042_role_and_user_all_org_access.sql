-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0042_role_and_user_all_org_access.sql
-- 说明：SQLite 迁移，为角色默认数据范围和人员单独覆盖新增可兼容的权限字段。
-- 用途：支持全机构权限的角色默认值、人员覆盖值及指定角色的受限默认回填。
-- 作者：hengguan
-- ============================================================================

-- 角色级全机构权限默认值与人员单独覆盖。
ALTER TABLE role ADD COLUMN all_org_access INTEGER NOT NULL DEFAULT 1 CHECK (all_org_access IN (0, 1));
ALTER TABLE user ADD COLUMN all_org_access_override INTEGER NULL CHECK (all_org_access_override IN (0, 1));

-- 与原业务约定保持一致：五类角色默认受机构范围约束，其他已有角色默认全机构。
UPDATE role
   SET all_org_access = 0
 WHERE code IN ('金科开发', '农信开发', '金科业务', '农信业务', '机构负责人');

-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0048_artifact_release_status.sql
-- 说明：为交付制品 JSON 新增受控的投产状态字典初始项。
-- 用途：SQLite 存量兼容迁移；只补齐缺失稳定值，不覆盖管理员的显示值、排序或已有配置。
-- 作者：hengguan
-- ============================================================================

INSERT INTO dict_category (category, label, sort, enabled)
SELECT 'artifact_release_status', '制品投产状态', 75, 1
WHERE NOT EXISTS (SELECT 1 FROM dict_category WHERE category = 'artifact_release_status');

INSERT INTO dict_item (category, attr_value, display_value, sort)
SELECT 'artifact_release_status', '待投产', '待投产', 1
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'artifact_release_status' AND attr_value = '待投产');

INSERT INTO dict_item (category, attr_value, display_value, sort)
SELECT 'artifact_release_status', '已投产', '已投产', 2
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'artifact_release_status' AND attr_value = '已投产');

INSERT INTO dict_item (category, attr_value, display_value, sort)
SELECT 'artifact_release_status', '已回退', '已回退', 3
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'artifact_release_status' AND attr_value = '已回退');

INSERT INTO dict_item (category, attr_value, display_value, sort)
SELECT 'artifact_release_status', '已取消', '已取消', 4
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'artifact_release_status' AND attr_value = '已取消');

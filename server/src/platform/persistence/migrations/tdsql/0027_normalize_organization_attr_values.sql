-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0027_normalize_organization_attr_values.sql
-- 说明：将历史业务表中可唯一匹配的机构显示值转换为 org 属性值。
-- 用途：TDSQL/MySQL 8 存量兼容迁移；与 SQLite 0047 保持等价语义。
-- 作者：hengguan
-- ============================================================================

-- 仅映射显示值唯一且不同于属性值的项；目标已是属性值或无法唯一匹配时不更新，重复执行安全。
UPDATE user AS target JOIN (
  SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item
   WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1
) AS item ON item.display_value = target.org SET target.org = item.attr_value;

UPDATE system AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.org SET target.org = item.attr_value;
UPDATE system AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.out_dept SET target.out_dept = item.attr_value;
UPDATE system AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.deploy_dept SET target.deploy_dept = item.attr_value;

UPDATE requirement AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.implementation_org SET target.implementation_org = item.attr_value;
UPDATE ticket AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.implementation_org SET target.implementation_org = item.attr_value;
UPDATE dev_task AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.impl_org SET target.impl_org = item.attr_value;
UPDATE test_task AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.impl_org SET target.impl_org = item.attr_value;
UPDATE release_system AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.impl_org SET target.impl_org = item.attr_value;
UPDATE release_apply AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.impl_org SET target.impl_org = item.attr_value;
UPDATE release_apply AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.out_dept SET target.out_dept = item.attr_value;
UPDATE release_apply AS target JOIN (SELECT display_value, MIN(attr_value) AS attr_value FROM dict_item WHERE category = 'org' AND attr_value <> display_value GROUP BY display_value HAVING COUNT(*) = 1) AS item ON item.display_value = target.deploy_dept SET target.deploy_dept = item.attr_value;

-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0047_normalize_organization_attr_values.sql
-- 说明：将历史业务表中可唯一匹配的机构显示值转换为 org 属性值。
-- 用途：SQLite 存量兼容迁移；仅处理 attr_value 与 display_value 不同且显示值唯一的字典项。
-- 作者：hengguan
-- ============================================================================

-- 不能唯一映射的历史文本不更新，避免猜测；目标已是属性值时不会命中，重复执行安全。
UPDATE user AS target SET org = (
  SELECT item.attr_value FROM dict_item AS item
   WHERE item.category = 'org' AND item.display_value = target.org
   GROUP BY item.display_value HAVING COUNT(*) = 1
)
WHERE EXISTS (
  SELECT 1 FROM dict_item AS item
   WHERE item.category = 'org' AND item.display_value = target.org AND item.attr_value <> item.display_value
   GROUP BY item.display_value HAVING COUNT(*) = 1
);

UPDATE system AS target SET org = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.org
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.org AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

UPDATE requirement AS target SET implementation_org = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.implementation_org
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.implementation_org AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

UPDATE ticket AS target SET implementation_org = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.implementation_org
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.implementation_org AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

UPDATE dev_task AS target SET impl_org = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.impl_org
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.impl_org AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

UPDATE test_task AS target SET impl_org = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.impl_org
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.impl_org AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

UPDATE release_system AS target SET impl_org = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.impl_org
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.impl_org AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

UPDATE release_apply AS target SET impl_org = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.impl_org
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.impl_org AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

UPDATE release_apply AS target SET out_dept = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.out_dept
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.out_dept AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

UPDATE release_apply AS target SET deploy_dept = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.deploy_dept
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.deploy_dept AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

UPDATE system AS target SET out_dept = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.out_dept
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.out_dept AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

UPDATE system AS target SET deploy_dept = (
  SELECT item.attr_value FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.deploy_dept
  GROUP BY item.display_value HAVING COUNT(*) = 1
) WHERE EXISTS (SELECT 1 FROM dict_item AS item WHERE item.category = 'org' AND item.display_value = target.deploy_dept AND item.attr_value <> item.display_value GROUP BY item.display_value HAVING COUNT(*) = 1);

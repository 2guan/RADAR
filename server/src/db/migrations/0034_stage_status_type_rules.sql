-- 0034_stage_status_type_rules.sql
-- 用途：为投产申请评审状态补齐参数配置中的状态类型，供公共输入项/交付件规则按初始态、进行中、终态聚合。
-- 说明：规则仍按 dict_item.id 落库；状态类型仅来自 dict_item.extra，避免在阶段配置中硬编码具体状态。

UPDATE dict_item
SET extra = json_set(CASE WHEN json_valid(extra) THEN extra ELSE '{}' END, '$.stateType', 'initial', '$.isTerminal', 0)
WHERE category = 'review_status' AND attr_value = '待评审';

UPDATE dict_item
SET extra = json_set(CASE WHEN json_valid(extra) THEN extra ELSE '{}' END, '$.stateType', 'in-progress', '$.isTerminal', 0)
WHERE category = 'review_status' AND attr_value = '应急审批';

UPDATE dict_item
SET extra = json_set(CASE WHEN json_valid(extra) THEN extra ELSE '{}' END, '$.stateType', 'final', '$.isTerminal', 1)
WHERE category = 'review_status' AND attr_value IN ('评审同意', '评审拒绝', '评审撤销');

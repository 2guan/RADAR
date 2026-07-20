-- 0008_unify_release_process_status.sql
-- 用途：将独立的 release_status 字典迁入 process_status 的“投产”阶段。

INSERT INTO dict_item (category, attr_value, display_value, sort, extra)
SELECT
  'process_status', legacy.attr_value, legacy.display_value, legacy.sort,
  CASE legacy.attr_value
    WHEN '待评审' THEN JSON_OBJECT('stage', '投产', 'stateType', 'initial', 'isTerminal', FALSE)
    WHEN '待投产' THEN JSON_OBJECT('stage', '投产', 'stateType', 'in-progress', 'isTerminal', FALSE)
    WHEN '已投产' THEN JSON_OBJECT('stage', '投产', 'stateType', 'final', 'isTerminal', TRUE)
    WHEN '已取消' THEN JSON_OBJECT('stage', '投产', 'stateType', 'final', 'isTerminal', TRUE)
    ELSE JSON_OBJECT('stage', '投产', 'stateType', 'in-progress', 'isTerminal', FALSE)
  END
FROM dict_item legacy
WHERE legacy.category = 'release_status'
  AND NOT EXISTS (
    SELECT 1 FROM dict_item current
    WHERE current.category = 'process_status' AND current.attr_value = legacy.attr_value
  );

INSERT INTO dict_item (category, attr_value, display_value, sort, extra)
SELECT 'process_status', '待评审', '待评审', 17, JSON_OBJECT('stage', '投产', 'stateType', 'initial', 'isTerminal', FALSE)
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'process_status' AND attr_value = '待评审');

INSERT INTO dict_item (category, attr_value, display_value, sort, extra)
SELECT 'process_status', '待投产', '待投产', 18, JSON_OBJECT('stage', '投产', 'stateType', 'in-progress', 'isTerminal', FALSE)
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'process_status' AND attr_value = '待投产');

INSERT INTO dict_item (category, attr_value, display_value, sort, extra)
SELECT 'process_status', '已投产', '已投产', 19, JSON_OBJECT('stage', '投产', 'stateType', 'final', 'isTerminal', TRUE)
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'process_status' AND attr_value = '已投产');

INSERT INTO dict_item (category, attr_value, display_value, sort, extra)
SELECT 'process_status', '已取消', '已取消', 20, JSON_OBJECT('stage', '投产', 'stateType', 'final', 'isTerminal', TRUE)
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'process_status' AND attr_value = '已取消');

UPDATE dict_item
SET extra = CASE attr_value
  WHEN '待评审' THEN JSON_OBJECT('stage', '投产', 'stateType', 'initial', 'isTerminal', FALSE)
  WHEN '待投产' THEN JSON_OBJECT('stage', '投产', 'stateType', 'in-progress', 'isTerminal', FALSE)
  WHEN '已投产' THEN JSON_OBJECT('stage', '投产', 'stateType', 'final', 'isTerminal', TRUE)
  WHEN '已取消' THEN JSON_OBJECT('stage', '投产', 'stateType', 'final', 'isTerminal', TRUE)
  ELSE extra
END,
sort = CASE attr_value
  WHEN '待评审' THEN 17
  WHEN '待投产' THEN 18
  WHEN '已投产' THEN 19
  WHEN '已取消' THEN 20
  ELSE sort
END,
updated_at = CURRENT_TIMESTAMP
WHERE category = 'process_status'
  AND attr_value IN ('待评审', '待投产', '已投产', '已取消');

DELETE FROM dict_item
WHERE category = 'process_status'
  AND attr_value IN ('评审通过', '已上线')
  AND JSON_UNQUOTE(JSON_EXTRACT(extra, '$.stage')) = '投产';

DELETE FROM dict_item WHERE category = 'release_status';

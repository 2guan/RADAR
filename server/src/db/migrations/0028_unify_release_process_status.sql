-- 0028_unify_release_process_status.sql
-- 用途：将独立的 release_status 字典迁入 process_status 的“投产”阶段，
--       使投产审批状态、阶段状态与流程状态使用同一份配置。

-- 先保留原投产状态中的自定义项；已存在同名流程状态时以流程状态为准。
INSERT INTO dict_item (category, attr_value, display_value, sort, extra)
SELECT
  'process_status', legacy.attr_value, legacy.display_value, legacy.sort,
  CASE legacy.attr_value
    WHEN '待评审' THEN '{"stage":"投产","stateType":"initial","isTerminal":false}'
    WHEN '待投产' THEN '{"stage":"投产","stateType":"in-progress","isTerminal":false}'
    WHEN '已投产' THEN '{"stage":"投产","stateType":"final","isTerminal":true}'
    WHEN '已取消' THEN '{"stage":"投产","stateType":"final","isTerminal":true}'
    ELSE '{"stage":"投产","stateType":"in-progress","isTerminal":false}'
  END
FROM dict_item legacy
WHERE legacy.category = 'release_status'
  AND NOT EXISTS (
    SELECT 1 FROM dict_item current
    WHERE current.category = 'process_status' AND current.attr_value = legacy.attr_value
  );

-- 补齐统一后的默认投产阶段状态。待评审为初始态，待投产为进行中，已投产/已取消为终态。
INSERT INTO dict_item (category, attr_value, display_value, sort, extra)
SELECT 'process_status', '待评审', '待评审', 17, '{"stage":"投产","stateType":"initial","isTerminal":false}'
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'process_status' AND attr_value = '待评审');

INSERT INTO dict_item (category, attr_value, display_value, sort, extra)
SELECT 'process_status', '待投产', '待投产', 18, '{"stage":"投产","stateType":"in-progress","isTerminal":false}'
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'process_status' AND attr_value = '待投产');

INSERT INTO dict_item (category, attr_value, display_value, sort, extra)
SELECT 'process_status', '已投产', '已投产', 19, '{"stage":"投产","stateType":"final","isTerminal":true}'
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'process_status' AND attr_value = '已投产');

INSERT INTO dict_item (category, attr_value, display_value, sort, extra)
SELECT 'process_status', '已取消', '已取消', 20, '{"stage":"投产","stateType":"final","isTerminal":true}'
WHERE NOT EXISTS (SELECT 1 FROM dict_item WHERE category = 'process_status' AND attr_value = '已取消');

UPDATE dict_item
SET extra = CASE attr_value
  WHEN '待评审' THEN '{"stage":"投产","stateType":"initial","isTerminal":false}'
  WHEN '待投产' THEN '{"stage":"投产","stateType":"in-progress","isTerminal":false}'
  WHEN '已投产' THEN '{"stage":"投产","stateType":"final","isTerminal":true}'
  WHEN '已取消' THEN '{"stage":"投产","stateType":"final","isTerminal":true}'
  ELSE extra
END,
sort = CASE attr_value
  WHEN '待评审' THEN 17
  WHEN '待投产' THEN 18
  WHEN '已投产' THEN 19
  WHEN '已取消' THEN 20
  ELSE sort
END,
updated_at = datetime('now','localtime')
WHERE category = 'process_status'
  AND attr_value IN ('待评审', '待投产', '已投产', '已取消');

-- 清理旧版初始种子中仅用于映射的投产阶段状态；实际投产任务从未以这些值保存。
DELETE FROM dict_item
WHERE category = 'process_status'
  AND attr_value IN ('评审通过', '已上线')
  AND json_extract(extra, '$.stage') = '投产';

-- 原独立分类已迁移，不再保留，避免配置入口再次分叉。
DELETE FROM dict_item WHERE category = 'release_status';

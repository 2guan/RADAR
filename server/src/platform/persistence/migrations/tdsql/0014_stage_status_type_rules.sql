-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0014_stage_status_type_rules.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- 0014_stage_status_type_rules.sql
-- 用途：为投产申请评审状态补齐参数配置中的状态类型，和 SQLite 0034 保持一致。

UPDATE dict_item
SET extra = JSON_SET(COALESCE(extra, JSON_OBJECT()), '$.stateType', 'initial', '$.isTerminal', FALSE)
WHERE category = 'review_status' AND attr_value = '待评审';

UPDATE dict_item
SET extra = JSON_SET(COALESCE(extra, JSON_OBJECT()), '$.stateType', 'in-progress', '$.isTerminal', FALSE)
WHERE category = 'review_status' AND attr_value = '应急审批';

UPDATE dict_item
SET extra = JSON_SET(COALESCE(extra, JSON_OBJECT()), '$.stateType', 'final', '$.isTerminal', TRUE)
WHERE category = 'review_status' AND attr_value IN ('评审同意', '评审拒绝', '评审撤销');

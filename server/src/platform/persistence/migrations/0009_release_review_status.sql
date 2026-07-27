-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0009_release_review_status.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- 0009_release_review_status.sql
-- 用途：为投产任务新增「评审状态」字段。取值见字典 review_status：
--       待评审 / 评审同意 / 评审拒绝 / 评审撤销 / 应急审批，默认 待评审。
-- 说明：评审同意/评审拒绝由会签结果自动推导（全部签署->评审同意，任一驳回->评审拒绝）；
--       评审撤销/应急审批为手动设置，且不被自动逻辑覆盖。
-- 作者：hengguan

ALTER TABLE release_task ADD COLUMN review_status TEXT NOT NULL DEFAULT '待评审';

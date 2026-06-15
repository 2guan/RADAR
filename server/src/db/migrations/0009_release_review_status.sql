-- 0009_release_review_status.sql
-- 用途：为投产任务新增「评审状态」字段。取值见字典 review_status：
--       待评审 / 评审同意 / 评审拒绝 / 评审撤销 / 应急审批，默认 待评审。
-- 说明：评审同意/评审拒绝由会签结果自动推导（全部签署->评审同意，任一驳回->评审拒绝）；
--       评审撤销/应急审批为手动设置，且不被自动逻辑覆盖。
-- 作者：hengguan

ALTER TABLE release_task ADD COLUMN review_status TEXT NOT NULL DEFAULT '待评审';

-- 0029_advance_release_after_review_approval.sql
-- 用途：补齐既有数据的评审通过联动规则：评审同意时，待评审自动进入待投产。

UPDATE release_task
SET status = '待投产', updated_at = datetime('now','localtime')
WHERE status = '待评审' AND review_status = '评审同意';

-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0044_replace_planned_release_point.sql
-- 说明：计划投产点已由投产申请关联表替代；本迁移删除旧单值列并新增期望投产日期。
-- 用途：SQLite 数据结构迁移。执行前由发布流程清空业务数据库。
-- 作者：hengguan
-- ============================================================================

DROP INDEX IF EXISTS idx_req_release_point;
DROP INDEX IF EXISTS idx_ticket_release_point;
ALTER TABLE requirement DROP COLUMN release_point_id;
ALTER TABLE ticket DROP COLUMN release_point_id;
ALTER TABLE requirement ADD COLUMN expected_release_date TEXT;
ALTER TABLE ticket ADD COLUMN expected_release_date TEXT;
CREATE INDEX idx_requirement_expected_release_date ON requirement(expected_release_date);
CREATE INDEX idx_ticket_expected_release_date ON ticket(expected_release_date);

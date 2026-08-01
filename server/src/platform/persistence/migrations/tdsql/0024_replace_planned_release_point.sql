-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0024_replace_planned_release_point.sql
-- 说明：计划投产点已由投产申请关联表替代；本迁移删除旧单值列并新增期望投产日期。
-- 用途：TDSQL/MySQL 8 数据结构迁移。执行前由发布流程清空业务数据库。
-- 作者：hengguan
-- ============================================================================

ALTER TABLE requirement DROP FOREIGN KEY fk_requirement_release_point;
ALTER TABLE requirement DROP INDEX idx_req_release_point;
ALTER TABLE requirement DROP COLUMN release_point_id;
ALTER TABLE requirement ADD COLUMN expected_release_date DATE NULL;
CREATE INDEX idx_requirement_expected_release_date ON requirement(expected_release_date);

ALTER TABLE ticket DROP FOREIGN KEY fk_ticket_release_point;
ALTER TABLE ticket DROP INDEX idx_ticket_release_point;
ALTER TABLE ticket DROP COLUMN release_point_id;
ALTER TABLE ticket ADD COLUMN expected_release_date DATE NULL;
CREATE INDEX idx_ticket_expected_release_date ON ticket(expected_release_date);

-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0023_dev_and_test_intake_owner.sql
-- 说明：TDSQL/MySQL 8 迁移，为开发和测试任务补充可空的承接操作人字段。
-- 用途：保存任务承接人与负责人，兼容历史任务不补写承接人。
-- 作者：hengguan
-- ============================================================================

-- 开发/测试承接人：记录实际执行承接操作的人员，历史任务保持为空。
ALTER TABLE dev_task ADD COLUMN intake_owner VARCHAR(255) NULL;
ALTER TABLE test_task ADD COLUMN intake_owner VARCHAR(255) NULL;

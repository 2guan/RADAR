-- 文件：0004_perf_indexes.sql
-- 用途：补充性能相关索引，消除热点路径上的整表扫描。
-- 作者：hengguan
-- 说明：
--   idx_user_name —— 概览详情按姓名解析人员（resolvePerson）原走 user 整表扫描；
--   idx_test_type —— 指标卡在「全部投产窗口」下按 test_type 统计，
--                     原 idx_test_req(req_code, test_type) 因前导列不匹配无法命中。

CREATE INDEX IF NOT EXISTS idx_user_name ON user(name);
CREATE INDEX IF NOT EXISTS idx_test_type ON test_task(test_type);

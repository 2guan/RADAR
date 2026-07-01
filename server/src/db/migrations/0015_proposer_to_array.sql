-- 文件：db/migrations/0015_proposer_to_array.sql
-- 用途：将需求表 proposer 字段历史数据转换为 JSON 数组格式。
-- 作者：hengguan

UPDATE requirement 
SET proposer = json_array(proposer) 
WHERE proposer IS NOT NULL 
  AND proposer != '' 
  AND proposer NOT LIKE '[%';

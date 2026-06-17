-- 需求表 proposer 字段历史数据转换为 JSON 数组格式
UPDATE requirement 
SET proposer = json_array(proposer) 
WHERE proposer IS NOT NULL 
  AND proposer != '' 
  AND proposer NOT LIKE '[%';

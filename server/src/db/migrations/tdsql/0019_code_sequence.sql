-- 文件：0019_code_sequence.sql
-- 说明：按编号规则与固定前缀维护下一可用序号，避免高并发创建时重复扫描业务表。
-- 用途：为需求、工单、开发、测试和投产申请提供可持久化、可原子递增的业务编号序列。
-- 作者：hengguan

CREATE TABLE code_sequence (
  rule_key   VARCHAR(128) NOT NULL,
  prefix     VARCHAR(255) NOT NULL,
  next_value BIGINT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (rule_key, prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

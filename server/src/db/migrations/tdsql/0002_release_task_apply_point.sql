-- 0002_release_task_apply_point.sql
-- 用途：将 TDSQL 环境中的投产审批调整为“工作项 + 申请投产点”维度。
-- 作者：hengguan

ALTER TABLE release_task ADD COLUMN release_point_id BIGINT NULL AFTER req_code;

-- 历史 UNIQUE(req_code) 通常由 MySQL 自动命名为 req_code。
-- 若目标环境索引名不同，可在执行失败后按实际索引名手工删除后重跑本迁移。
ALTER TABLE release_task DROP INDEX req_code;

UPDATE release_task rt
LEFT JOIN requirement req ON req.req_code = rt.req_code
LEFT JOIN ticket tk ON tk.ticket_code = rt.req_code
SET rt.release_point_id = COALESCE(
  (
    SELECT MIN(ra.release_point_id)
    FROM release_apply ra
    WHERE JSON_CONTAINS(COALESCE(ra.ref_codes, JSON_ARRAY()), JSON_QUOTE(rt.req_code))
  ),
  req.release_point_id,
  tk.release_point_id
);

ALTER TABLE release_task
  ADD UNIQUE KEY uk_release_task_code_point (req_code, release_point_id),
  ADD INDEX idx_release_task_point (release_point_id),
  ADD CONSTRAINT fk_release_task_release_point FOREIGN KEY (release_point_id) REFERENCES release_point(id);

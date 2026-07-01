-- 0017_ticket_analysis.sql
-- 用途：新增工单分析主表，并将开发/测试任务的 req_code 泛化为「需求/工单编号」。
-- 作者：hengguan

CREATE TABLE ticket (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_code         TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  summary             TEXT,
  status              TEXT NOT NULL,
  ticket_type         TEXT,
  propose_dept        TEXT,
  proposer            TEXT,
  yn_owner            TEXT,
  jk_owner            TEXT,
  propose_time        TEXT,
  main_systems        TEXT,
  collab_dev_systems  TEXT,
  collab_test_systems TEXT,
  release_point_id    INTEGER REFERENCES release_point(id),
  issue_no            TEXT,
  registrar           TEXT,
  register_time       TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_ticket_release_point ON ticket(release_point_id);
CREATE INDEX idx_ticket_status ON ticket(status);

CREATE TABLE dev_task_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  req_code        TEXT NOT NULL,
  task_code       TEXT NOT NULL UNIQUE,
  task_name       TEXT,
  content         TEXT,
  status          TEXT NOT NULL,
  owner           TEXT,
  impl_system     TEXT,
  impl_org        TEXT,
  plan_start      TEXT,
  plan_end        TEXT,
  actual_start    TEXT,
  actual_end      TEXT,
  deviation_rate  INTEGER,
  registrar       TEXT,
  register_time   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO dev_task_new
SELECT id, req_code, task_code, task_name, content, status, owner, impl_system, impl_org,
       plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time, created_at, updated_at
  FROM dev_task;
DROP TABLE dev_task;
ALTER TABLE dev_task_new RENAME TO dev_task;
CREATE INDEX idx_dev_req ON dev_task(req_code);

CREATE TABLE test_task_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  req_code        TEXT NOT NULL,
  task_code       TEXT NOT NULL UNIQUE,
  task_name       TEXT,
  test_type       TEXT NOT NULL,
  status          TEXT NOT NULL,
  owner           TEXT,
  impl_system     TEXT,
  impl_org        TEXT,
  impl_agency     TEXT,
  plan_start      TEXT,
  plan_end        TEXT,
  actual_start    TEXT,
  actual_end      TEXT,
  deviation_rate  INTEGER,
  registrar       TEXT,
  register_time   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
INSERT INTO test_task_new
SELECT id, req_code, task_code, task_name, test_type, status, owner, impl_system, impl_org, impl_agency,
       plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time, created_at, updated_at
  FROM test_task;
DROP TABLE test_task;
ALTER TABLE test_task_new RENAME TO test_task;
CREATE INDEX idx_test_req ON test_task(req_code, test_type);

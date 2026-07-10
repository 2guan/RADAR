-- 文件：db/migrations/tdsql/0003_impact_coverage.sql
-- 用途：TDSQL 版——将影响性分析、测试覆盖性分析改为结构化存储（与 SQLite 0023 对应）。
-- 作者：hengguan

CREATE TABLE impact_change_item (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  req_code       VARCHAR(128) NOT NULL,
  category       VARCHAR(64) NOT NULL,
  system         VARCHAR(255),
  change_kind    VARCHAR(32),
  change_content TEXT,
  detail         TEXT,
  sort_order     INT NOT NULL DEFAULT 0,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NULL,
  INDEX idx_impact_req (req_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE coverage_item (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  change_item_id BIGINT NOT NULL,
  req_code       VARCHAR(128) NOT NULL,
  strategy       TEXT,
  result         VARCHAR(32),
  case_no        TEXT,
  tester         VARCHAR(255),
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NULL,
  UNIQUE KEY idx_coverage_change (change_item_id),
  INDEX idx_coverage_req (req_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 文件：db/migrations/tdsql/0001_init.sql
-- 用途：TDSQL MySQL 兼容版初始表结构。该文件合并 SQLite 0001-0021 的最终 schema，
--       供 DB_CLIENT=tdsql 时初始化空库使用。
-- 作者：hengguan
-- 说明：保留 RADAR 业务表、权限表、仪表盘、问题、签名、登录失败追踪等最终字段；
--       对 key、system、role、user 等敏感标识符在运行时 provider 中统一处理。

-- 平台配置与字典基础表：保存系统级配置项和前端/后端共用的字典值。
CREATE TABLE app_config (
  `key`      VARCHAR(191) PRIMARY KEY,
  value      TEXT,
  remark     TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dict_item (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  category      VARCHAR(64) NOT NULL,
  attr_value    VARCHAR(255) NOT NULL,
  display_value VARCHAR(255) NOT NULL,
  sort          INT NOT NULL DEFAULT 0,
  extra         JSON,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dict_category (category, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 主数据、角色权限与用户表：承载组织系统、RBAC 权限、用户账号及用户角色关系。
CREATE TABLE system (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  sys_code    VARCHAR(64) NOT NULL UNIQUE,
  sys_name    VARCHAR(255) NOT NULL,
  org         VARCHAR(255),
  sector      VARCHAR(255),
  sort        INT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  out_dept    VARCHAR(255),
  deploy_dept VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE role (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  name            VARCHAR(128) NOT NULL,
  code            VARCHAR(128) NOT NULL UNIQUE,
  default_home    VARCHAR(128) NOT NULL DEFAULT '仪表盘',
  is_builtin      TINYINT NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_signoff_role TINYINT NOT NULL DEFAULT 0,
  default_theme   VARCHAR(64) NOT NULL DEFAULT 'sky'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE permission (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  role_id    BIGINT NOT NULL,
  module_key VARCHAR(64) NOT NULL,
  action_key VARCHAR(128) NOT NULL,
  allowed    TINYINT NOT NULL DEFAULT 0,
  UNIQUE KEY uk_permission (role_id, module_key, action_key),
  CONSTRAINT fk_permission_role FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
  phone               VARCHAR(128) NOT NULL UNIQUE,
  name                VARCHAR(128) NOT NULL,
  org                 VARCHAR(255),
  password_hash       VARCHAR(255) NOT NULL,
  status              VARCHAR(32) NOT NULL DEFAULT '启用',
  is_super            TINYINT NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  login_fail_count    INT DEFAULT 0,
  lockout_until       DATETIME DEFAULT NULL,
  password_changed_at DATETIME DEFAULT NULL,
  INDEX idx_user_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_role (
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_user_role_user FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_role_role FOREIGN KEY (role_id) REFERENCES role(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 研发流程主链路表：版本点、需求、工单、开发任务、测试任务均按 SQLite 最终字段同步。
CREATE TABLE release_point (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  release_date VARCHAR(64) NOT NULL,
  version_type VARCHAR(128),
  remark       TEXT,
  is_default   TINYINT NOT NULL DEFAULT 0,
  is_archived  TINYINT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE requirement (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
  req_code            VARCHAR(128) NOT NULL UNIQUE,
  title               VARCHAR(500) NOT NULL,
  summary             TEXT,
  status              VARCHAR(128) NOT NULL,
  req_type            VARCHAR(128),
  propose_dept        VARCHAR(255),
  proposer            JSON,
  yn_owner            VARCHAR(255),
  jk_owner            VARCHAR(255),
  propose_time        VARCHAR(64),
  main_systems        JSON,
  collab_dev_systems  JSON,
  collab_test_systems JSON,
  release_point_id    BIGINT,
  registrar           VARCHAR(128),
  register_time       VARCHAR(64),
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  issue_no            VARCHAR(255),
  is_accounting       VARCHAR(16) NOT NULL DEFAULT '否',
  INDEX idx_req_release_point (release_point_id),
  INDEX idx_req_status (status),
  CONSTRAINT fk_requirement_release_point FOREIGN KEY (release_point_id) REFERENCES release_point(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE ticket (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
  ticket_code         VARCHAR(128) NOT NULL UNIQUE,
  title               VARCHAR(500) NOT NULL,
  summary             TEXT,
  status              VARCHAR(128) NOT NULL,
  ticket_type         VARCHAR(128),
  propose_dept        VARCHAR(255),
  proposer            JSON,
  yn_owner            VARCHAR(255),
  jk_owner            VARCHAR(255),
  propose_time        VARCHAR(64),
  main_systems        JSON,
  collab_dev_systems  JSON,
  collab_test_systems JSON,
  release_point_id    BIGINT,
  issue_no            VARCHAR(255),
  registrar           VARCHAR(128),
  register_time       VARCHAR(64),
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_accounting       VARCHAR(16) NOT NULL DEFAULT '否',
  INDEX idx_ticket_release_point (release_point_id),
  INDEX idx_ticket_status (status),
  CONSTRAINT fk_ticket_release_point FOREIGN KEY (release_point_id) REFERENCES release_point(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dev_task (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  req_code       VARCHAR(128) NOT NULL,
  task_code      VARCHAR(160) NOT NULL UNIQUE,
  task_name      VARCHAR(500),
  content        TEXT,
  status         VARCHAR(128) NOT NULL,
  owner          VARCHAR(255),
  impl_system    VARCHAR(128),
  impl_org       VARCHAR(255),
  plan_start     VARCHAR(64),
  plan_end       VARCHAR(64),
  actual_start   VARCHAR(64),
  actual_end     VARCHAR(64),
  deviation_rate INT,
  registrar      VARCHAR(128),
  register_time  VARCHAR(64),
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_dev_req (req_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE test_task (
  id             BIGINT PRIMARY KEY AUTO_INCREMENT,
  req_code       VARCHAR(128) NOT NULL,
  task_code      VARCHAR(160) NOT NULL UNIQUE,
  task_name      VARCHAR(500),
  test_type      VARCHAR(32) NOT NULL,
  status         VARCHAR(128) NOT NULL,
  owner          VARCHAR(255),
  impl_system    VARCHAR(128),
  impl_org       VARCHAR(255),
  impl_agency    VARCHAR(255),
  plan_start     VARCHAR(64),
  plan_end       VARCHAR(64),
  actual_start   VARCHAR(64),
  actual_end     VARCHAR(64),
  deviation_rate INT,
  registrar      VARCHAR(128),
  register_time  VARCHAR(64),
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_test_req (req_code, test_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 投产申请与审批表：记录投产任务、系统维度投产状态、会签和投产申请单。
CREATE TABLE release_task (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  req_code      VARCHAR(128) NOT NULL,
  release_point_id BIGINT,
  entity_type   VARCHAR(32) NOT NULL DEFAULT 'requirement',
  status        VARCHAR(128) NOT NULL DEFAULT '待投产',
  owner         VARCHAR(255),
  registrar     VARCHAR(128),
  register_time VARCHAR(64),
  review_status VARCHAR(128) NOT NULL DEFAULT '待评审',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_release_task_code_point (req_code, release_point_id),
  INDEX idx_release_task_point (release_point_id),
  CONSTRAINT fk_release_task_release_point FOREIGN KEY (release_point_id) REFERENCES release_point(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE release_system (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT,
  release_task_id     BIGINT NOT NULL,
  system_code         VARCHAR(128) NOT NULL,
  impl_org            VARCHAR(255),
  actual_release_time VARCHAR(64),
  status              VARCHAR(128) NOT NULL DEFAULT '待投产',
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_relsys_task (release_task_id),
  CONSTRAINT fk_release_system_task FOREIGN KEY (release_task_id) REFERENCES release_task(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE release_signoff (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  release_task_id BIGINT NOT NULL,
  role_id         BIGINT,
  role_name       VARCHAR(128),
  signer_user_id  BIGINT,
  signer_name     VARCHAR(128),
  result          VARCHAR(64) NOT NULL DEFAULT '未签署',
  conclusion      TEXT,
  sign_time       DATETIME,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  signature_path  VARCHAR(500),
  INDEX idx_signoff_task (release_task_id),
  CONSTRAINT fk_release_signoff_task FOREIGN KEY (release_task_id) REFERENCES release_task(id) ON DELETE CASCADE,
  CONSTRAINT fk_release_signoff_role FOREIGN KEY (role_id) REFERENCES role(id),
  CONSTRAINT fk_release_signoff_user FOREIGN KEY (signer_user_id) REFERENCES user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE release_apply (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  change_code      VARCHAR(128) NOT NULL UNIQUE,
  change_content   TEXT NOT NULL,
  impact_scope     TEXT,
  change_system    VARCHAR(128),
  impl_org         VARCHAR(255),
  delivery_units   JSON,
  ref_codes        JSON,
  review_status    VARCHAR(128),
  out_dept         VARCHAR(255),
  deploy_dept      VARCHAR(255),
  release_point_id BIGINT,
  registrar        VARCHAR(128),
  register_time    VARCHAR(64),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_release_apply_rp (release_point_id),
  INDEX idx_release_apply_system (change_system),
  CONSTRAINT fk_release_apply_release_point FOREIGN KEY (release_point_id) REFERENCES release_point(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 附件与审计表：保存业务附件元信息及用户操作审计日志。
CREATE TABLE attachment (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  entity_type VARCHAR(64) NOT NULL,
  entity_id   BIGINT NOT NULL,
  field_key   VARCHAR(128) NOT NULL,
  kind        VARCHAR(16) NOT NULL,
  filename    VARCHAR(500),
  stored_path VARCHAR(500),
  path_text   TEXT,
  size        BIGINT,
  uploader    VARCHAR(128),
  upload_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_attach_entity (entity_type, entity_id, field_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE audit_log (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  entity_type VARCHAR(64) NOT NULL,
  entity_id   BIGINT NOT NULL,
  entity_code VARCHAR(160),
  action      VARCHAR(32) NOT NULL,
  operator    VARCHAR(128),
  field       VARCHAR(255),
  old_value   TEXT,
  new_value   TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 个性化与仪表盘表：保存用户筛选条件、图表布局、数据源配置和展示属性。
CREATE TABLE saved_filter (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT NOT NULL,
  module_key VARCHAR(64) NOT NULL,
  name       VARCHAR(128) NOT NULL,
  payload    JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_saved_filter_user FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE dashboard_chart (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id    BIGINT,
  title      VARCHAR(255) NOT NULL,
  chart_type VARCHAR(64) NOT NULL,
  config     JSON NOT NULL,
  sort       INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scope      VARCHAR(32) NOT NULL DEFAULT 'user',
  col_span   INT NOT NULL DEFAULT 12,
  height     INT NOT NULL DEFAULT 320,
  INDEX idx_dash_chart_scope (scope, user_id, sort),
  CONSTRAINT fk_dashboard_chart_user FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 问题与安全辅助表：保存问题闭环、用户签名图片以及登录失败锁定追踪信息。
CREATE TABLE issue (
  id                       BIGINT PRIMARY KEY AUTO_INCREMENT,
  issue_code               VARCHAR(128) NOT NULL UNIQUE,
  round                    VARCHAR(128),
  urgency                  VARCHAR(128),
  handling_method          VARCHAR(128),
  version_codes            TEXT,
  business_group           VARCHAR(255),
  module                   VARCHAR(255),
  system                   VARCHAR(255),
  work_order_no            VARCHAR(255),
  create_time              VARCHAR(64),
  plan_resolve_time        VARCHAR(64),
  status                   VARCHAR(128),
  category                 VARCHAR(255),
  detailed_classification  VARCHAR(255),
  summary                  TEXT,
  details                  TEXT,
  analysis_log             JSON,
  tracker_name             VARCHAR(128),
  tracker_org              VARCHAR(255),
  tracker_contact          VARCHAR(128),
  reporter_name            VARCHAR(128),
  reporter_org             VARCHAR(255),
  reporter_contact         VARCHAR(128),
  handler_name             VARCHAR(128),
  handler_org              VARCHAR(255),
  handler_contact          VARCHAR(128),
  linked_case_code         VARCHAR(255),
  linked_case_name         VARCHAR(255),
  linked_cases             JSON,
  tags                     JSON,
  is_major                 TINYINT NOT NULL DEFAULT 0,
  is_common                TINYINT NOT NULL DEFAULT 0,
  root_cause               TEXT,
  solution                 TEXT,
  release_status           VARCHAR(128),
  synced_at                DATETIME,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_issue_status (status),
  INDEX idx_issue_system (system),
  INDEX idx_issue_classification (detailed_classification)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE user_signature (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id     BIGINT NOT NULL,
  label       VARCHAR(128),
  stored_path VARCHAR(500) NOT NULL,
  is_default  TINYINT NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_signature_user (user_id),
  CONSTRAINT fk_user_signature_user FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE login_fail_tracker (
  phone           VARCHAR(128) NOT NULL PRIMARY KEY,
  fail_count      INT NOT NULL DEFAULT 0,
  lockout_until   DATETIME,
  last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO release_point (release_date, version_type, remark, is_default, is_archived)
VALUES ('投产点待定', '常规版本', '系统内置投产点', 0, 0);

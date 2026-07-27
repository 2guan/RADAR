-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/tdsql/0012_stage_content_and_deliverables.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- ============================================================================
-- 文件：tdsql/0012_stage_content_and_deliverables.sql
-- 用途：TDSQL 版阶段内容、扩展输入项、公共交付件与模板版本数据模型。
-- ============================================================================

CREATE TABLE stage_scope (
  scope_key VARCHAR(128) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  table_name VARCHAR(128) NOT NULL,
  status_category VARCHAR(128) NOT NULL,
  status_stage VARCHAR(128),
  status_field VARCHAR(128),
  permission_module VARCHAR(128) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stage_section (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  scope_key VARCHAR(128) NOT NULL,
  section_key VARCHAR(128) NOT NULL,
  title VARCHAR(255) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  collapsed TINYINT NOT NULL DEFAULT 0,
  is_builtin TINYINT NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_stage_section(scope_key, section_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stage_field_definition (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  scope_key VARCHAR(128) NOT NULL,
  field_key VARCHAR(128) NOT NULL,
  label VARCHAR(255) NOT NULL,
  field_kind VARCHAR(32) NOT NULL,
  input_type VARCHAR(64) NOT NULL,
  source_key VARCHAR(128),
  multiple TINYINT NOT NULL DEFAULT 0,
  native_column VARCHAR(128),
  component_key VARCHAR(128),
  section_id BIGINT,
  column_span INT NOT NULL DEFAULT 12,
  visible TINYINT NOT NULL DEFAULT 1,
  list_visible TINYINT NOT NULL DEFAULT 0,
  filterable TINYINT NOT NULL DEFAULT 0,
  dashboard_dimension TINYINT NOT NULL DEFAULT 0,
  sort INT NOT NULL DEFAULT 0,
  is_builtin TINYINT NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_stage_field(scope_key, field_key),
  KEY idx_stage_field_section(section_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stage_field_status_rule (
  field_definition_id BIGINT NOT NULL,
  status_dict_item_id BIGINT NOT NULL,
  required TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(field_definition_id, status_dict_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 配置定义与业务值分离：定义可版本化调整，业务值仍按实体和序号保留历史。
CREATE TABLE stage_field_value (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  field_definition_id BIGINT NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id BIGINT NOT NULL,
  ordinal INT NOT NULL DEFAULT 0,
  value_text TEXT,
  value_date VARCHAR(64),
  value_code VARCHAR(255),
  value_ref_id BIGINT,
  value_label_snapshot VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_stage_field_value(field_definition_id, entity_type, entity_id, ordinal),
  KEY idx_stage_field_value_entity(entity_type, entity_id),
  KEY idx_stage_field_value_code(field_definition_id, value_code),
  KEY idx_stage_field_value_ref(field_definition_id, value_ref_id),
  KEY idx_stage_field_value_date(field_definition_id, value_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 交付件规则按定义、状态和模板版本拆表，与 SQLite 对等迁移保持相同语义。
CREATE TABLE deliverable_definition (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  scope_key VARCHAR(128) NOT NULL,
  deliverable_key VARCHAR(128) NOT NULL,
  label VARCHAR(255) NOT NULL,
  input_mode VARCHAR(16) NOT NULL DEFAULT 'both',
  visible TINYINT NOT NULL DEFAULT 1,
  sort INT NOT NULL DEFAULT 0,
  deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_deliverable(scope_key, deliverable_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE deliverable_status_rule (
  deliverable_definition_id BIGINT NOT NULL,
  status_dict_item_id BIGINT NOT NULL,
  required TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(deliverable_definition_id, status_dict_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE deliverable_template_version (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  deliverable_definition_id BIGINT NOT NULL,
  template_mode VARCHAR(32) NOT NULL,
  handler_key VARCHAR(128),
  filename VARCHAR(512),
  stored_path VARCHAR(512),
  size BIGINT,
  version_no INT NOT NULL DEFAULT 1,
  enabled TINYINT NOT NULL DEFAULT 1,
  uploader VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  KEY idx_deliverable_template_active(deliverable_definition_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE content_config_revision (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  scope_key VARCHAR(128) NOT NULL,
  config_type VARCHAR(64) NOT NULL,
  snapshot LONGTEXT NOT NULL,
  operator VARCHAR(255),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE attachment ADD COLUMN deliverable_id BIGINT NULL;
CREATE INDEX idx_attachment_deliverable ON attachment(deliverable_id);

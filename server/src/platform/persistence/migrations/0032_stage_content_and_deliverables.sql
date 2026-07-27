-- ============================================================================
-- 文件：server/src/platform/persistence/migrations/0032_stage_content_and_deliverables.sql
-- 说明：RADAR 历史数据库迁移脚本，按对应数据库方言和版本顺序执行。
-- 用途：以可追踪、可审计的方式演进数据结构，并保持 SQLite 与 TDSQL/MySQL 8 迁移配对。
-- 作者：hengguan
-- ============================================================================
-- ============================================================================
-- 文件：0032_stage_content_and_deliverables.sql
-- 用途：建立阶段内容、扩展输入项、公共交付件与模板版本的数据模型。
-- 说明：规则均关联参数配置 dict_item.id；不依赖状态或交付件中文名称。
-- ============================================================================

CREATE TABLE stage_scope (
  scope_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  table_name TEXT NOT NULL,
  status_category TEXT NOT NULL,
  status_stage TEXT,
  status_field TEXT,
  permission_module TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE stage_section (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_key TEXT NOT NULL,
  section_key TEXT NOT NULL,
  title TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  collapsed INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(scope_key, section_key),
  FOREIGN KEY(scope_key) REFERENCES stage_scope(scope_key)
);

CREATE TABLE stage_field_definition (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_kind TEXT NOT NULL,
  input_type TEXT NOT NULL,
  source_key TEXT,
  multiple INTEGER NOT NULL DEFAULT 0,
  native_column TEXT,
  component_key TEXT,
  section_id INTEGER,
  column_span INTEGER NOT NULL DEFAULT 12,
  visible INTEGER NOT NULL DEFAULT 1,
  list_visible INTEGER NOT NULL DEFAULT 0,
  filterable INTEGER NOT NULL DEFAULT 0,
  dashboard_dimension INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(scope_key, field_key),
  FOREIGN KEY(scope_key) REFERENCES stage_scope(scope_key),
  FOREIGN KEY(section_id) REFERENCES stage_section(id)
);

CREATE TABLE stage_field_status_rule (
  field_definition_id INTEGER NOT NULL,
  status_dict_item_id INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY(field_definition_id, status_dict_item_id),
  FOREIGN KEY(field_definition_id) REFERENCES stage_field_definition(id),
  FOREIGN KEY(status_dict_item_id) REFERENCES dict_item(id)
);

-- 配置定义与业务值分离：定义可版本化调整，业务值仍按实体和序号保留历史。
CREATE TABLE stage_field_value (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  field_definition_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL DEFAULT 0,
  value_text TEXT,
  value_date TEXT,
  value_code TEXT,
  value_ref_id INTEGER,
  value_label_snapshot TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(field_definition_id, entity_type, entity_id, ordinal),
  FOREIGN KEY(field_definition_id) REFERENCES stage_field_definition(id)
);
CREATE INDEX idx_stage_field_value_entity ON stage_field_value(entity_type, entity_id);
CREATE INDEX idx_stage_field_value_code ON stage_field_value(field_definition_id, value_code);
CREATE INDEX idx_stage_field_value_ref ON stage_field_value(field_definition_id, value_ref_id);
CREATE INDEX idx_stage_field_value_date ON stage_field_value(field_definition_id, value_date);

-- 交付件规则按定义、状态和模板版本拆表，避免将可配置内容固化在业务模块中。
CREATE TABLE deliverable_definition (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_key TEXT NOT NULL,
  deliverable_key TEXT NOT NULL,
  label TEXT NOT NULL,
  input_mode TEXT NOT NULL DEFAULT 'both',
  visible INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE(scope_key, deliverable_key),
  FOREIGN KEY(scope_key) REFERENCES stage_scope(scope_key)
);

CREATE TABLE deliverable_status_rule (
  deliverable_definition_id INTEGER NOT NULL,
  status_dict_item_id INTEGER NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  PRIMARY KEY(deliverable_definition_id, status_dict_item_id),
  FOREIGN KEY(deliverable_definition_id) REFERENCES deliverable_definition(id),
  FOREIGN KEY(status_dict_item_id) REFERENCES dict_item(id)
);

CREATE TABLE deliverable_template_version (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deliverable_definition_id INTEGER NOT NULL,
  template_mode TEXT NOT NULL,
  handler_key TEXT,
  filename TEXT,
  stored_path TEXT,
  size INTEGER,
  version_no INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  uploader TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  deleted_at TEXT,
  FOREIGN KEY(deliverable_definition_id) REFERENCES deliverable_definition(id)
);
CREATE INDEX idx_deliverable_template_active ON deliverable_template_version(deliverable_definition_id, enabled);

CREATE TABLE content_config_revision (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope_key TEXT NOT NULL,
  config_type TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  operator TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  FOREIGN KEY(scope_key) REFERENCES stage_scope(scope_key)
);

ALTER TABLE attachment ADD COLUMN deliverable_id INTEGER REFERENCES deliverable_definition(id);
CREATE INDEX idx_attachment_deliverable ON attachment(deliverable_id);

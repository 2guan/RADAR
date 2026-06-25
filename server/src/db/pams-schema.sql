-- ============================================================================
-- PAMS 问题管理子系统数据库结构
-- 说明：独立于 RADAR 主库，尽量贴近现有 PAMS 运行时 SQLite 结构，便于迁移。
-- ============================================================================

CREATE TABLE IF NOT EXISTS sys_user (
  user_id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  real_name TEXT NOT NULL,
  role TEXT NOT NULL,
  organization TEXT NOT NULL,
  contact TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ENABLE' CHECK (status IN ('ENABLE', 'DISABLE')),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_dict (
  dict_id INTEGER PRIMARY KEY AUTOINCREMENT,
  dict_code TEXT NOT NULL,
  item_key TEXT NOT NULL,
  item_value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  description TEXT,
  is_system INTEGER DEFAULT 0,
  is_default_val INTEGER DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(dict_code, item_key)
);

CREATE TABLE IF NOT EXISTS biz_issue (
  issue_id TEXT PRIMARY KEY,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT '提出',
  category TEXT,
  summary TEXT NOT NULL,
  details TEXT NOT NULL,
  attachments TEXT DEFAULT '[]',
  analysis_log TEXT DEFAULT '[]',
  tracker_name TEXT NOT NULL,
  tracker_org TEXT NOT NULL,
  tracker_contact TEXT NOT NULL,
  reporter_name TEXT,
  reporter_org TEXT,
  reporter_contact TEXT,
  handler_name TEXT,
  handler_org TEXT,
  handler_contact TEXT,
  linked_case_id TEXT,
  linked_case_name TEXT,
  linked_cases TEXT DEFAULT '[]',
  module TEXT,
  system TEXT,
  business_group TEXT,
  is_major INTEGER DEFAULT 0,
  is_common INTEGER DEFAULT 0,
  root_cause TEXT,
  solution TEXT,
  plan_fix_time DATETIME,
  resolve_time DATETIME,
  detailed_classification TEXT DEFAULT '未分类',
  round TEXT DEFAULT '第二轮',
  tags TEXT DEFAULT '[]',
  urgency TEXT DEFAULT '中',
  handling_method TEXT DEFAULT '其它',
  version_number TEXT,
  release_status TEXT DEFAULT '',
  work_order_no TEXT
);

CREATE TABLE IF NOT EXISTS biz_issue_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  operation_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS biz_common_issue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  summary TEXT NOT NULL,
  cause TEXT,
  solution TEXT,
  screenshots TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]',
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS biz_case (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT NOT NULL,
  case_type TEXT,
  stage TEXT,
  department TEXT,
  module TEXT,
  team TEXT,
  channel TEXT,
  business_group TEXT,
  system TEXT,
  is_external INTEGER DEFAULT 0,
  ext_channel TEXT,
  user_role TEXT,
  scenario TEXT,
  scenario_type TEXT,
  peripherals TEXT,
  media TEXT,
  vouchers TEXT,
  is_financial INTEGER DEFAULT 0,
  steps TEXT,
  data_setup TEXT,
  author TEXT,
  author_contact TEXT,
  executor_org TEXT,
  executor_name TEXT,
  executor_contact TEXT,
  project_executor_name TEXT,
  project_executor_contact TEXT,
  case_status TEXT DEFAULT '未执行',
  case_status_remark TEXT,
  project_status TEXT DEFAULT '未执行',
  project_status_remark TEXT,
  remarks TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS biz_itsm_ticket (
  id TEXT PRIMARY KEY,
  ticket_no TEXT,
  ticket_name TEXT,
  ticket_status TEXT,
  current_step TEXT,
  current_handler TEXT,
  ticket_type TEXT,
  creation_time TEXT,
  creator TEXT,
  last_update_time TEXT,
  processing_time TEXT,
  issue_submitter TEXT,
  issue_creation_time TEXT,
  issue_summary TEXT,
  potential_business_impact TEXT,
  issue_details TEXT,
  issue_attachments TEXT,
  discovery_channel TEXT,
  responsible_department TEXT,
  impacted_system TEXT,
  peripheral_system TEXT,
  issue_status TEXT,
  expected_resolve_time TEXT,
  planned_resolve_time TEXT,
  issue_category TEXT,
  is_linked_incident TEXT,
  assigned_analyst TEXT,
  assignment_time TEXT,
  is_transferred TEXT,
  transfer_time TEXT,
  transferred_department TEXT,
  transferred_personnel TEXT,
  transfer_reason TEXT,
  root_cause_locate_time TEXT,
  solution TEXT,
  solution_submit_time TEXT,
  attachments_upload TEXT,
  solution_verify_result TEXT,
  is_linked_change_order TEXT,
  verify_attachments_upload TEXT,
  close_time TEXT,
  close_code TEXT,
  satisfaction_rating TEXT,
  satisfaction_rating_desc TEXT,
  submitter_department TEXT,
  submitter_contact TEXT,
  issue_source TEXT,
  issue_subcategory_2 TEXT,
  issue_subcategory_3 TEXT,
  issue_handler TEXT,
  issue_handler_department TEXT,
  issue_handler_contact TEXT,
  root_cause_category TEXT,
  issue_handler_name TEXT,
  issue_handler_type TEXT,
  issue_analyst TEXT,
  issue_analyst_contact TEXT,
  physical_subsystem TEXT,
  is_dev_resolved TEXT,
  business_group TEXT,
  final_verified_workload TEXT,
  verified_workload_desc TEXT,
  initial_workload TEXT,
  verified_workload TEXT,
  is_change_required TEXT,
  issue_priority TEXT,
  root_cause_category_2 TEXT,
  primary_responsibility_center TEXT,
  technical_lead TEXT,
  issue_process_status TEXT,
  estimated_resolve_time TEXT,
  technical_lead_name TEXT,
  technical_lead_type TEXT,
  dev_lead TEXT,
  dev_lead_name TEXT,
  dev_lead_type TEXT,
  title TEXT,
  detail TEXT,
  creator_alt TEXT,
  creator_dept TEXT,
  creator_contact TEXT,
  org_code TEXT,
  trans_code TEXT,
  app_system TEXT,
  is_system_error TEXT,
  images TEXT,
  history_record TEXT,
  is_trigger_other TEXT,
  occurrence_time TEXT,
  acceptance_time TEXT,
  resolve_time TEXT,
  resolve_group TEXT,
  resolver TEXT,
  attachment TEXT,
  close_status TEXT,
  satisfaction_score TEXT,
  satisfaction_desc TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS biz_kongming_ticket (
  ticket_issue_id TEXT PRIMARY KEY,
  ticket_name TEXT,
  ticket_no TEXT,
  ticket_status TEXT,
  urgency TEXT,
  current_step TEXT,
  ticket_type TEXT,
  creation_time TEXT,
  creator TEXT,
  last_update_time TEXT,
  issue_no TEXT,
  current_stage TEXT,
  issue_source TEXT,
  directive_code TEXT,
  directive_group TEXT,
  directive_contact_id TEXT,
  directive_contact TEXT,
  directive_contact_phone TEXT,
  directive_contact_type TEXT,
  directive_meaning TEXT,
  task_no TEXT,
  task_name TEXT,
  task_desc TEXT,
  system_name TEXT,
  case_no TEXT,
  case_type TEXT,
  case_system TEXT,
  case_scenario TEXT,
  case_executor_org TEXT,
  case_contact TEXT,
  case_contact_id TEXT,
  case_contact_type TEXT,
  case_contact_phone TEXT,
  issue_proposer TEXT,
  issue_proposer_name TEXT,
  proposer_org TEXT,
  issue_proposer_type TEXT,
  proposer_phone TEXT,
  issue_reporter TEXT,
  reporter_org TEXT,
  reporter_phone TEXT,
  issue_title TEXT,
  issue_occur_time TEXT,
  issue_app_system TEXT,
  collab_system TEXT,
  issue_desc TEXT,
  issue_type TEXT,
  issue_impact TEXT,
  issue_group TEXT,
  issue_group_type TEXT,
  issue_group_id TEXT,
  issue_group_phone TEXT,
  issue_root_system TEXT,
  issue_domain TEXT,
  related_ticket_no TEXT,
  expected_resolve_date TEXT,
  discard_reason TEXT,
  discard_time TEXT,
  issue_process_record TEXT,
  issue_solver TEXT,
  solver_org TEXT,
  issue_cause TEXT,
  issue_solution TEXT,
  followup_items TEXT,
  drill_release TEXT,
  submit_verify_time TEXT,
  verify_pass_time TEXT,
  issue_resolve_time TEXT,
  issue_resolved TEXT,
  drill_round TEXT,
  solver_type TEXT,
  solver_name TEXT,
  solver_phone TEXT,
  reporter_type TEXT,
  reporter_name TEXT,
  issue_app_system_code TEXT,
  is_timeout_accept TEXT,
  is_timeout_process TEXT,
  timeout_detail TEXT,
  timeout_minutes TEXT,
  created_time2 TEXT,
  problem_file TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS biz_business_ticket (
  id TEXT PRIMARY KEY,
  seq_no TEXT,
  problem_register_date TEXT,
  problem_source TEXT,
  ticket_no TEXT,
  delivery_section TEXT,
  subsystem TEXT,
  province_assoc_dept TEXT,
  jinke_group TEXT,
  problem_description TEXT,
  attachments TEXT,
  jinke_initial_feedback TEXT,
  register_time TEXT,
  issue_control_no TEXT,
  issue_control_status TEXT,
  issue_control_close_time TEXT,
  reporter_dept_contact TEXT,
  reporter_contact_info TEXT,
  jinke_contact_phone TEXT,
  operation_instruction_reason TEXT,
  next_step_processing TEXT,
  estimated_or_completed_time TEXT,
  is_problem_resolved TEXT,
  remarks TEXT,
  is_disputed TEXT,
  both_parties_schedule TEXT,
  dispute_over_2_weeks TEXT,
  meeting_minutes TEXT,
  is_undertaken TEXT,
  is_converted_to_problem TEXT,
  is_submitted_to_province_assoc TEXT,
  undertaken_req_tool_no TEXT,
  demand_remarks TEXT,
  current_handler TEXT,
  current_status TEXT,
  expected_complete_time TEXT,
  is_demand_closed TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_ai_settings (
  setting_id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT,
  description TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sys_user_dashboard (
  user_id TEXT PRIMARY KEY,
  config_content TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pams_role_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  radar_role_id INTEGER,
  radar_role_code TEXT NOT NULL UNIQUE,
  radar_role_name TEXT NOT NULL,
  pams_role_key TEXT NOT NULL,
  pams_role_name TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pams_permission_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dict_code ON sys_dict(dict_code);
CREATE INDEX IF NOT EXISTS idx_user_username ON sys_user(username);
CREATE INDEX IF NOT EXISTS idx_user_role ON sys_user(role);
CREATE INDEX IF NOT EXISTS idx_user_organization ON sys_user(organization);
CREATE INDEX IF NOT EXISTS idx_issue_status ON biz_issue(status);
CREATE INDEX IF NOT EXISTS idx_issue_category ON biz_issue(category);
CREATE INDEX IF NOT EXISTS idx_issue_business_group ON biz_issue(business_group);
CREATE INDEX IF NOT EXISTS idx_issue_module ON biz_issue(module);
CREATE INDEX IF NOT EXISTS idx_issue_system ON biz_issue(system);
CREATE INDEX IF NOT EXISTS idx_issue_create_time ON biz_issue(create_time);
CREATE INDEX IF NOT EXISTS idx_issue_is_common ON biz_issue(is_common);
CREATE INDEX IF NOT EXISTS idx_issue_is_major ON biz_issue(is_major);
CREATE INDEX IF NOT EXISTS idx_issue_round ON biz_issue(round);
CREATE INDEX IF NOT EXISTS idx_issue_tracker_name ON biz_issue(tracker_name);
CREATE INDEX IF NOT EXISTS idx_issue_tracker_contact ON biz_issue(tracker_contact);
CREATE INDEX IF NOT EXISTS idx_issue_reporter_contact ON biz_issue(reporter_contact);
CREATE INDEX IF NOT EXISTS idx_issue_handler_contact ON biz_issue(handler_contact);
CREATE INDEX IF NOT EXISTS idx_issue_history_issue_id ON biz_issue_history(issue_id);
CREATE INDEX IF NOT EXISTS idx_case_id ON biz_case(case_id);
CREATE INDEX IF NOT EXISTS idx_case_type ON biz_case(case_type);
CREATE INDEX IF NOT EXISTS idx_case_module ON biz_case(module);
CREATE INDEX IF NOT EXISTS idx_case_business_group ON biz_case(business_group);
CREATE INDEX IF NOT EXISTS idx_case_system ON biz_case(system);
CREATE INDEX IF NOT EXISTS idx_case_executor_org ON biz_case(executor_org);
CREATE INDEX IF NOT EXISTS idx_itsm_ticket_no ON biz_itsm_ticket(ticket_no);
CREATE INDEX IF NOT EXISTS idx_itsm_creation_time ON biz_itsm_ticket(creation_time);
CREATE INDEX IF NOT EXISTS idx_itsm_ticket_status ON biz_itsm_ticket(ticket_status);
CREATE INDEX IF NOT EXISTS idx_itsm_creator ON biz_itsm_ticket(creator);
CREATE INDEX IF NOT EXISTS idx_kongming_ticket_no ON biz_kongming_ticket(ticket_no);
CREATE INDEX IF NOT EXISTS idx_kongming_creation_time ON biz_kongming_ticket(creation_time);
CREATE INDEX IF NOT EXISTS idx_kongming_ticket_status ON biz_kongming_ticket(ticket_status);
CREATE INDEX IF NOT EXISTS idx_kongming_issue_title ON biz_kongming_ticket(issue_title);
CREATE INDEX IF NOT EXISTS idx_business_ticket_no ON biz_business_ticket(ticket_no);
CREATE INDEX IF NOT EXISTS idx_business_issue_control_no ON biz_business_ticket(issue_control_no);

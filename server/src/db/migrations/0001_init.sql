-- ============================================================================
-- 文件：0001_init.sql
-- 用途：RADAR 平台初始数据库结构。涵盖鉴权/RBAC、字典、机构系统、投产点、
--       需求/开发/测试/投产主链路、附件、变更历史等全部核心表。
-- 作者：hengguan
-- 说明：数组类字段（如主责系统）以 JSON 文本存储；所有业务表含 created_at/updated_at。
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 平台配置（键值表）：平台信息、编号规则、主题等
-- ---------------------------------------------------------------------------
CREATE TABLE app_config (
  key         TEXT PRIMARY KEY,          -- 配置键，如 platform.name
  value       TEXT,                       -- 配置值（文本或 JSON）
  remark      TEXT,                       -- 中文说明
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------------
-- 字典表（通用）：流程状态、版本类型、投产状态、需求类型、机构、板块、组织机构等
-- ---------------------------------------------------------------------------
CREATE TABLE dict_item (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  category      TEXT NOT NULL,            -- 字典分类：process_status/version_type/release_status/req_type/org/sector/department...
  attr_value    TEXT NOT NULL,            -- 状态属性值（中文）
  display_value TEXT NOT NULL,            -- 状态显示值（中文）
  sort          INTEGER NOT NULL DEFAULT 0,
  extra         TEXT,                     -- 扩展 JSON：流程状态存 {stage, isTerminal}
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_dict_category ON dict_item(category, sort);

-- ---------------------------------------------------------------------------
-- 所属系统（物理子系统清单）
-- ---------------------------------------------------------------------------
CREATE TABLE system (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sys_code    TEXT NOT NULL UNIQUE,       -- 系统编号，如 YN0320
  sys_name    TEXT NOT NULL,             -- 系统名称
  org         TEXT,                       -- 所属机构（字典 attr_value）
  sector      TEXT,                       -- 所属板块（字典 attr_value）
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------------
-- 角色表
-- ---------------------------------------------------------------------------
CREATE TABLE role (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,           -- 角色名称（中文）
  code          TEXT NOT NULL UNIQUE,     -- 角色标识
  default_home  TEXT NOT NULL DEFAULT '仪表盘', -- 默认首页
  is_builtin    INTEGER NOT NULL DEFAULT 0,     -- 是否内置（如超级管理员）
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------------
-- 权限矩阵：角色 × 模块 × 操作
-- ---------------------------------------------------------------------------
CREATE TABLE permission (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  role_id     INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,             -- 模块：dashboard/overview/requirement/dev/test/release/user/settings
  action_key  TEXT NOT NULL,             -- 操作：view/create/edit/delete/import/export/release.signoff/release.register/settings.permission.edit
  allowed     INTEGER NOT NULL DEFAULT 0,
  UNIQUE(role_id, module_key, action_key)
);

-- ---------------------------------------------------------------------------
-- 用户（人员）表
-- ---------------------------------------------------------------------------
CREATE TABLE user (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  phone         TEXT NOT NULL UNIQUE,     -- 手机号（唯一登录名）
  name          TEXT NOT NULL,           -- 真实姓名
  org           TEXT,                     -- 所属机构（字典 attr_value）
  password_hash TEXT NOT NULL,           -- scrypt 加盐哈希
  status        TEXT NOT NULL DEFAULT '启用', -- 启用/停用
  is_super      INTEGER NOT NULL DEFAULT 0,    -- 是否超级管理员
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 用户-角色多对多
CREATE TABLE user_role (
  user_id  INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role_id  INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

-- ---------------------------------------------------------------------------
-- 投产点（投产版本窗口）
-- ---------------------------------------------------------------------------
CREATE TABLE release_point (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  release_date  TEXT NOT NULL,           -- 投产日期 YYYYMMDD
  version_type  TEXT,                     -- 投产版本类型（字典 attr_value）
  remark        TEXT,
  is_default    INTEGER NOT NULL DEFAULT 0, -- 默认投产窗口标识（同一时刻最多一个）
  is_archived   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------------
-- 需求表
-- ---------------------------------------------------------------------------
CREATE TABLE requirement (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  req_code            TEXT NOT NULL UNIQUE,  -- 需求编号 RC_投产窗口_序号
  title               TEXT NOT NULL,        -- 需求标题
  summary             TEXT,                  -- 需求概述（≤500）
  status              TEXT NOT NULL,        -- 需求状态（流程状态-需求）
  req_type            TEXT,                  -- 需求类型（字典）
  propose_dept        TEXT,                  -- 农信提出部门（机构）
  proposer            TEXT,                  -- 农信提出人（人员姓名）
  yn_owner            TEXT,                  -- 云南农信业务负责人
  jk_owner            TEXT,                  -- 建信金科业务负责人
  propose_time        TEXT,                  -- 提出时间
  main_systems        TEXT,                  -- 主责系统 JSON 数组（系统编号）
  collab_dev_systems  TEXT,                  -- 协同改造系统 JSON 数组
  collab_test_systems TEXT,                  -- 协同测试系统 JSON 数组
  release_point_id    INTEGER REFERENCES release_point(id), -- 计划投产点
  registrar           TEXT,                  -- 登记人（后台记录）
  register_time       TEXT,                  -- 登记时间（后台记录）
  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_req_release_point ON requirement(release_point_id);
CREATE INDEX idx_req_status ON requirement(status);

-- ---------------------------------------------------------------------------
-- 开发任务表
-- ---------------------------------------------------------------------------
CREATE TABLE dev_task (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  req_code        TEXT NOT NULL REFERENCES requirement(req_code) ON DELETE CASCADE,
  task_code       TEXT NOT NULL UNIQUE,    -- 开发任务编号 RW_需求编号_序号
  task_name       TEXT,                     -- 开发任务名称
  content         TEXT,                     -- 开发内容概述
  status          TEXT NOT NULL,           -- 开发状态（流程状态-开发）
  owner           TEXT,                     -- 开发负责人
  impl_system     TEXT,                     -- 开发实施系统（系统编号）
  impl_org        TEXT,                     -- 开发实施方（机构）
  plan_start      TEXT,
  plan_end        TEXT,
  actual_start    TEXT,
  actual_end      TEXT,
  deviation_rate  INTEGER,                  -- 排期偏差率（百分比整数，自动演算）
  registrar       TEXT,
  register_time   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_dev_req ON dev_task(req_code);

-- ---------------------------------------------------------------------------
-- 测试任务表（SIT/UAT/NFT/SEC 共用，按 test_type 区分）
-- ---------------------------------------------------------------------------
CREATE TABLE test_task (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  req_code        TEXT NOT NULL REFERENCES requirement(req_code) ON DELETE CASCADE,
  task_code       TEXT NOT NULL UNIQUE,    -- 测试任务编号 类型_需求编号_序号
  task_name       TEXT,
  test_type       TEXT NOT NULL,           -- SIT/UAT/NFT/SEC
  status          TEXT NOT NULL,           -- 测试状态（流程状态-测试）
  owner           TEXT,                     -- 测试负责人
  impl_system     TEXT,                     -- 测试实施系统
  impl_org        TEXT,                     -- 测试实施方（机构）
  impl_agency     TEXT,                     -- 实施机构
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
CREATE INDEX idx_test_req ON test_task(req_code, test_type);

-- ---------------------------------------------------------------------------
-- 投产任务表（每需求 1 条）
-- ---------------------------------------------------------------------------
CREATE TABLE release_task (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  req_code      TEXT NOT NULL UNIQUE REFERENCES requirement(req_code) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT '待投产', -- 投产状态（字典）
  owner         TEXT,                            -- 投产负责人
  registrar     TEXT,
  register_time TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 投产系统明细（每个改造系统一条上线登记）
CREATE TABLE release_system (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  release_task_id     INTEGER NOT NULL REFERENCES release_task(id) ON DELETE CASCADE,
  system_code         TEXT NOT NULL,       -- 投产实施系统（系统编号）
  impl_org            TEXT,                 -- 投产实施方（机构）
  actual_release_time TEXT,                 -- 实际生产上线时间
  status              TEXT NOT NULL DEFAULT '待投产', -- 系统投产状态
  created_at          TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_relsys_task ON release_system(release_task_id);

-- 评审会签
CREATE TABLE release_signoff (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  release_task_id INTEGER NOT NULL REFERENCES release_task(id) ON DELETE CASCADE,
  role_id         INTEGER REFERENCES role(id),
  role_name       TEXT,                     -- 会签角色名称（冗余便于展示）
  signer_user_id  INTEGER REFERENCES user(id),
  signer_name     TEXT,                     -- 签署人姓名
  result          TEXT NOT NULL DEFAULT '未签署', -- 未签署/已签署/已驳回
  conclusion      TEXT,                     -- 签署备注/结论
  sign_time       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_signoff_task ON release_signoff(release_task_id);

-- ---------------------------------------------------------------------------
-- 附件（多态：文件 / 路径统一存储）
-- ---------------------------------------------------------------------------
CREATE TABLE attachment (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  TEXT NOT NULL,             -- requirement/dev/test/release
  entity_id    INTEGER NOT NULL,         -- 关联业务记录 id
  field_key    TEXT NOT NULL,             -- 字段键，如 概要设计/测试报告/需求说明书
  kind         TEXT NOT NULL,             -- file=上传文件 / path=填写路径
  filename     TEXT,                      -- 原始文件名
  stored_path  TEXT,                      -- 文件相对存储路径（kind=file）
  path_text    TEXT,                      -- 用户填写的路径（kind=path）
  size         INTEGER,
  uploader     TEXT,
  upload_time  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_attach_entity ON attachment(entity_type, entity_id, field_key);

-- ---------------------------------------------------------------------------
-- 变更历史（过程留痕）
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,             -- requirement/dev/test/release...
  entity_id   INTEGER NOT NULL,
  entity_code TEXT,                       -- 业务编号（便于检索）
  action      TEXT NOT NULL,             -- create/update/delete
  operator    TEXT,                      -- 操作人姓名
  field       TEXT,                      -- 修改栏位（中文名）
  old_value   TEXT,                      -- 修改前内容
  new_value   TEXT,                      -- 修改后内容
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- 常用过滤器（用户保存的组合筛选条件）
-- ---------------------------------------------------------------------------
CREATE TABLE saved_filter (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  module_key  TEXT NOT NULL,
  name        TEXT NOT NULL,
  payload     TEXT NOT NULL,             -- JSON：filters/sort 等
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ---------------------------------------------------------------------------
-- 仪表盘自定义图表配置
-- ---------------------------------------------------------------------------
CREATE TABLE dashboard_chart (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES user(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  chart_type  TEXT NOT NULL,             -- bar/area/pie/table
  config      TEXT NOT NULL,             -- JSON：维度/颜色/下钻等
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

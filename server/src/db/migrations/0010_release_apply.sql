-- 0010_release_apply.sql
-- 用途：投产申请（版本变更申请）库表。以「变更编号」为唯一键，承载一次投产版本的变更登记，
--       可关联多个需求/问题编号（ref_codes JSON 数组），评审状态由所关联需求的投产审批评审状态派生（取最弱）。
-- 说明：制品类型/摆渡状态取自字典 artifact_type / ferry_status；review_status 派生字段冗余存储便于导出；
--       默认按计划投产点（release_point_id）所属投产窗口过滤，与需求分析一致。
-- 作者：hengguan

CREATE TABLE release_apply (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  change_code       TEXT NOT NULL UNIQUE,   -- 变更编号（规则 code.release_apply，如 202606-10bg001）
  change_content    TEXT NOT NULL,          -- 变更内容（详细描述，必填）
  impact_scope      TEXT,                   -- 影响范围（非必填）
  change_system     TEXT,                   -- 变更系统（系统编号）
  impl_org          TEXT,                   -- 实施机构（字典 org）
  artifact_type     TEXT,                   -- 制品类型（字典 artifact_type）
  delivery_unit     TEXT,                   -- 交付单元名称（介质库路径/文件名）
  new_version       TEXT,                   -- 新版本号
  ref_codes         TEXT,                   -- 问题/需求编号（JSON 数组字符串）
  review_status     TEXT,                   -- 评审状态（由 ref_codes 关联需求的投产审批评审状态派生，取最弱）
  out_dept          TEXT,                   -- 变更负责部门（输出口径）（字典 org）
  deploy_dept       TEXT,                   -- 变更负责部门（部署口径）（字典 org）
  ferry_status      TEXT NOT NULL DEFAULT '未摆渡', -- 摆渡状态（字典 ferry_status，默认未摆渡）
  release_point_id  INTEGER REFERENCES release_point(id), -- 计划投产点（投产窗口过滤用）
  registrar         TEXT,                   -- 登记人
  register_time     TEXT,                   -- 登记时间
  created_at        TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_release_apply_rp ON release_apply(release_point_id);
CREATE INDEX idx_release_apply_system ON release_apply(change_system);

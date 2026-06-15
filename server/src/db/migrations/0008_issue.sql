-- 0008_issue.sql
-- 用途：问题管理库表。以「问题编号」为唯一键，承载外部 PAMS 系统同步过来的问题清单与明细。
-- 说明：本模块为只读展示（数据来源于外部接口同步），analysis_log/tags/linked_cases 以 JSON 字符串入库；
--       is_major/is_common 以 0/1 存储；列表仅用到 issue_code/status/detailed_classification/system/summary。
-- 作者：hengguan

CREATE TABLE issue (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_code               TEXT NOT NULL UNIQUE,  -- 问题编号（外部 issue_id，同步主键）
  round                    TEXT,                   -- 问题轮次
  urgency                  TEXT,                   -- 问题紧急程度
  handling_method          TEXT,                   -- 问题处理方式
  version_codes            TEXT,                   -- 版本编号（可能为逗号分隔多个）
  business_group           TEXT,                   -- 所属实施机构
  module                   TEXT,                   -- 所属板块
  system                   TEXT,                   -- 所属系统
  work_order_no            TEXT,                   -- 工单编号
  create_time              TEXT,                   -- 提出时间
  plan_resolve_time        TEXT,                   -- 计划解决时间
  status                   TEXT,                   -- 状态
  category                 TEXT,                   -- 分类
  detailed_classification  TEXT,                   -- 详细分类
  summary                  TEXT,                   -- 问题概述
  details                  TEXT,                   -- 问题详情
  analysis_log             TEXT,                   -- 分析修改记录（JSON 数组字符串）
  tracker_name             TEXT,                   -- 跟踪人
  tracker_org              TEXT,                   -- 跟踪人机构
  tracker_contact          TEXT,                   -- 跟踪人联系方式
  reporter_name            TEXT,                   -- 报障人
  reporter_org             TEXT,                   -- 报障人机构
  reporter_contact         TEXT,                   -- 报障人联系方式
  handler_name             TEXT,                   -- 处理人
  handler_org              TEXT,                   -- 处理机构
  handler_contact          TEXT,                   -- 处理人联系方式
  linked_case_code         TEXT,                   -- 关联案例编号
  linked_case_name         TEXT,                   -- 关联案例名称
  linked_cases             TEXT,                   -- 关联案例（JSON 数组字符串）
  tags                     TEXT,                   -- 标签（JSON 数组字符串）
  is_major                 INTEGER NOT NULL DEFAULT 0,  -- 是否重大问题（0/1）
  is_common                INTEGER NOT NULL DEFAULT 0,  -- 是否常见问题（0/1）
  root_cause               TEXT,                   -- 问题原因分析
  solution                 TEXT,                   -- 解决方案
  release_status           TEXT,                   -- 发版情况
  synced_at                TEXT,                   -- 问题明细最后同步时间
  created_at               TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_issue_status ON issue(status);
CREATE INDEX idx_issue_system ON issue(system);
CREATE INDEX idx_issue_classification ON issue(detailed_classification);

/**
 * 文件：server/src/modules/settings/process-configuration/application/local-stage-content-seed.js
 * 说明：由当前本地已确认的系统设置配置导出；历史残留文案、来源和无效跨阶段规则按已验收语义规范化。
 * 用途：为应用初始化和 Mock 重建提供同一份输入项、分区、交付件及动态模板处理器 Seed。
 * 作者：hengguan
 */

const RAW_LOCAL_STAGE_CONTENT_SEED = {
  "source": "current-local-settings",
  "captured_on": "2026-07-31",
  "scopes": [
    // 开发与投产范围：保留当前分区、字段能力、状态规则和动态模板处理器。
    {
      "scope_key": "dev",
      "sections": [
        {
          "section_key": "task",
          "title": "基本信息",
          "sort": 10,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "impact",
          "title": "影响性分析",
          "sort": 20,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "schedule",
          "title": "排期",
          "sort": 30,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "deliverables",
          "title": "交付件",
          "sort": 40,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 0
        },
        {
          "section_key": "extension",
          "title": "扩展信息",
          "sort": 50,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        }
      ],
      "fields": [
        {
          "field_key": "task_name",
          "label": "开发任务名称",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "task_name",
          "component_key": "",
          "section_key": "task",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 0
          }
        },
        {
          "field_key": "content",
          "label": "开发内容概述",
          "field_kind": "native",
          "input_type": "textarea",
          "source_key": "",
          "multiple": 0,
          "native_column": "content",
          "component_key": "",
          "section_key": "task",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 0
          }
        },
        {
          "field_key": "status",
          "label": "开发状态",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "",
          "multiple": 0,
          "native_column": "status",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 0
          }
        },
        {
          "field_key": "owner",
          "label": "开发负责人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "owner",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 0
          }
        },
        {
          "field_key": "intake_owner",
          "label": "开发承接人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "intake_owner",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 0
          }
        },
        {
          "field_key": "impl_org",
          "label": "开发实施方",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:org",
          "multiple": 0,
          "native_column": "impl_org",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 0
          }
        },
        {
          "field_key": "impl_system",
          "label": "开发实施系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 0,
          "native_column": "impl_system",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 0
          }
        },
        {
          "field_key": "plan_start",
          "label": "计划开始时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "plan_start",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 1
          }
        },
        {
          "field_key": "plan_end",
          "label": "计划结束时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "plan_end",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 70,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 1
          }
        },
        {
          "field_key": "actual_start",
          "label": "实际开始时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "actual_start",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 80,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 1
          }
        },
        {
          "field_key": "actual_end",
          "label": "实际完成时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "actual_end",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 90,
          "is_builtin": 1,
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 1
          }
        },
        {
          "field_key": "impact_analysis",
          "label": "影响性分析",
          "field_kind": "component",
          "input_type": "component",
          "source_key": "",
          "multiple": 0,
          "native_column": "",
          "component_key": "impact_analysis",
          "section_key": "impact",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 100,
          "is_builtin": 1
        }
      ],
      "deliverables": [
        {
          "deliverable_key": "builtin_1",
          "label": "概要设计",
          "input_mode": "both",
          "visible": 1,
          "sort": 0,
          "layout_mode": "left",
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 0
          }
        },
        {
          "deliverable_key": "builtin_2",
          "label": "详细设计",
          "input_mode": "both",
          "visible": 1,
          "sort": 10,
          "layout_mode": "left",
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 0
          }
        },
        {
          "deliverable_key": "builtin_3",
          "label": "代码走查",
          "input_mode": "both",
          "visible": 1,
          "sort": 20,
          "layout_mode": "left"
        },
        {
          "deliverable_key": "builtin_4",
          "label": "单元测试报告",
          "input_mode": "both",
          "visible": 1,
          "sort": 30,
          "layout_mode": "left"
        },
        {
          "deliverable_key": "builtin_5",
          "label": "编码检查表",
          "input_mode": "both",
          "visible": 1,
          "sort": 40,
          "layout_mode": "left",
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 1
          },
          "templates": [
            {
              "template_mode": "custom",
              "handler_key": "dev.coding-checklist",
              "version_no": 0,
              "enabled": 1
            }
          ]
        },
        {
          "deliverable_key": "builtin_6",
          "label": "技术方案确认单",
          "input_mode": "both",
          "visible": 1,
          "sort": 50,
          "layout_mode": "left",
          "rules": {
            "开发承接": 0,
            "开发设计": 0,
            "开发实施": 0,
            "单元测试": 0,
            "开发完成": 1
          },
          "templates": [
            {
              "template_mode": "custom",
              "handler_key": "dev.tech-solution-confirmation",
              "version_no": 0,
              "enabled": 1
            }
          ]
        }
      ]
    },
    {
      "scope_key": "release",
      "sections": [
        {
          "section_key": "basic",
          "title": "基本信息",
          "sort": 10,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "signoff",
          "title": "评审会签",
          "sort": 20,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "release_info",
          "title": "投产信息",
          "sort": 30,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "deliverables",
          "title": "交付件",
          "sort": 40,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 0
        },
        {
          "section_key": "extension",
          "title": "扩展信息",
          "sort": 50,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "artifacts",
          "title": "关联制品情况",
          "sort": 60,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        }
      ],
      "fields": [
        {
          "field_key": "owner",
          "label": "投产负责人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "owner",
          "component_key": "",
          "section_key": "release_info",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 0,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "待投产": 0,
            "已投产": 0,
            "已取消": 0
          }
        },
        {
          "field_key": "status",
          "label": "投产状态",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:process_status",
          "multiple": 0,
          "native_column": "status",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 0,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "待投产": 0,
            "已投产": 0,
            "已取消": 0
          }
        },
        {
          "field_key": "review_signoff",
          "label": "评审会签",
          "field_kind": "component",
          "input_type": "component",
          "source_key": "",
          "multiple": 0,
          "native_column": "",
          "component_key": "release_signoff",
          "section_key": "signoff",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "待投产": 0,
            "已投产": 0,
            "已取消": 0
          }
        },
        {
          "field_key": "related_artifacts",
          "label": "关联制品情况",
          "field_kind": "component",
          "input_type": "component",
          "source_key": "",
          "multiple": 0,
          "native_column": "",
          "component_key": "release_artifacts",
          "section_key": "artifacts",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "待投产": 0,
            "已投产": 0,
            "已取消": 0
          }
        },
        {
          "field_key": "release_point",
          "label": "申请投产点",
          "field_kind": "component",
          "input_type": "component",
          "source_key": "",
          "multiple": 0,
          "native_column": "",
          "component_key": "release_point",
          "section_key": "release_info",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "待投产": 0,
            "已投产": 0,
            "已取消": 0
          }
        },
        {
          "field_key": "approval_overview",
          "label": "审批对象概览",
          "field_kind": "component",
          "input_type": "component",
          "source_key": "",
          "multiple": 0,
          "native_column": "",
          "component_key": "approval_overview",
          "section_key": "basic",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "待投产": 0,
            "已投产": 0,
            "已取消": 0
          }
        }
      ],
      "deliverables": [
        {
          "deliverable_key": "builtin_1",
          "label": "投产变更方案",
          "input_mode": "both",
          "visible": 1,
          "sort": 0,
          "layout_mode": "left",
          "rules": {
            "待评审": 0,
            "待投产": 0,
            "已投产": 1,
            "已取消": 1
          },
          "templates": [
            {
              "template_mode": "custom",
              "handler_key": "release.change-plan",
              "version_no": 0,
              "enabled": 1
            }
          ]
        },
        {
          "deliverable_key": "builtin_2",
          "label": "投产变更控制表",
          "input_mode": "both",
          "visible": 1,
          "sort": 10,
          "layout_mode": "left",
          "rules": {
            "待评审": 0,
            "待投产": 0,
            "已投产": 1,
            "已取消": 1
          },
          "templates": [
            {
              "template_mode": "custom",
              "handler_key": "release.change-control",
              "version_no": 0,
              "enabled": 1
            }
          ]
        }
      ]
    },
    {
      "scope_key": "release_apply",
      "sections": [
        {
          "section_key": "references",
          "title": "关联需求/工单",
          "sort": 10,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "content",
          "title": "变更内容",
          "sort": 20,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "change",
          "title": "变更明细",
          "sort": 30,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "deliverables",
          "title": "交付件",
          "sort": 40,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 0
        },
        {
          "section_key": "extension",
          "title": "扩展信息",
          "sort": 50,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "artifacts",
          "title": "交付制品",
          "sort": 60,
          "collapsed": 1,
          "is_builtin": 1,
          "layout_mode": "full",
          "show_title": 1
        }
      ],
      "fields": [
        {
          "field_key": "change_code",
          "label": "变更编号",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "change_code",
          "component_key": "",
          "section_key": "change",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 0,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "评审同意": 0,
            "评审拒绝": 0,
            "评审撤销": 0,
            "应急审批": 0
          }
        },
        {
          "field_key": "ref_codes",
          "label": "关联需求/工单",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "ref_codes",
          "component_key": "",
          "section_key": "references",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "待评审": 1,
            "评审同意": 1,
            "评审拒绝": 1,
            "评审撤销": 1,
            "应急审批": 1
          }
        },
        {
          "field_key": "release_point_id",
          "label": "计划投产点",
          "field_kind": "native",
          "input_type": "release_point",
          "source_key": "release_point",
          "multiple": 0,
          "native_column": "release_point_id",
          "component_key": "",
          "section_key": "change",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "待评审": 1,
            "评审同意": 1,
            "评审拒绝": 1,
            "评审撤销": 1,
            "应急审批": 1
          }
        },
        {
          "field_key": "change_system",
          "label": "变更系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 0,
          "native_column": "change_system",
          "component_key": "",
          "section_key": "change",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "待评审": 1,
            "评审同意": 1,
            "评审拒绝": 1,
            "评审撤销": 1,
            "应急审批": 1
          }
        },
        {
          "field_key": "change_content",
          "label": "变更内容",
          "field_kind": "native",
          "input_type": "textarea",
          "source_key": "",
          "multiple": 0,
          "native_column": "change_content",
          "component_key": "",
          "section_key": "content",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "待评审": 1,
            "评审同意": 1,
            "评审拒绝": 1,
            "评审撤销": 1,
            "应急审批": 1
          }
        },
        {
          "field_key": "impact_scope",
          "label": "影响范围",
          "field_kind": "native",
          "input_type": "textarea",
          "source_key": "",
          "multiple": 0,
          "native_column": "impact_scope",
          "component_key": "",
          "section_key": "content",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "评审同意": 0,
            "评审拒绝": 0,
            "评审撤销": 0,
            "应急审批": 0
          }
        },
        {
          "field_key": "impl_org",
          "label": "实施机构",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:org",
          "multiple": 0,
          "native_column": "impl_org",
          "component_key": "",
          "section_key": "change",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "评审同意": 0,
            "评审拒绝": 0,
            "评审撤销": 0,
            "应急审批": 0
          }
        },
        {
          "field_key": "out_dept",
          "label": "变更负责部门（输出口径）",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:org",
          "multiple": 0,
          "native_column": "out_dept",
          "component_key": "",
          "section_key": "change",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 70,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "评审同意": 0,
            "评审拒绝": 0,
            "评审撤销": 0,
            "应急审批": 0
          }
        },
        {
          "field_key": "deploy_dept",
          "label": "变更负责部门（部署口径）",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:org",
          "multiple": 0,
          "native_column": "deploy_dept",
          "component_key": "",
          "section_key": "change",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 80,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "评审同意": 0,
            "评审拒绝": 0,
            "评审撤销": 0,
            "应急审批": 0
          }
        },
        {
          "field_key": "delivery_units",
          "label": "交付制品",
          "field_kind": "component",
          "input_type": "component",
          "source_key": "",
          "multiple": 0,
          "native_column": "",
          "component_key": "release_apply_artifacts",
          "section_key": "artifacts",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 90,
          "is_builtin": 1,
          "rules": {
            "待评审": 0,
            "评审同意": 0,
            "评审拒绝": 0,
            "评审撤销": 0,
            "应急审批": 0
          }
        }
      ],
      "deliverables": []
    },
    // 需求与测试范围：状态规则只通过字典状态值关联，初始化时不复制本地数据库 ID。
    {
      "scope_key": "requirement",
      "sections": [
        {
          "section_key": "basic",
          "title": "基本信息",
          "sort": 10,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "systems",
          "title": "实施机构及系统",
          "sort": 20,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "owners",
          "title": "相关负责人",
          "sort": 30,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "extension",
          "title": "扩展信息",
          "sort": 40,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "deliverables",
          "title": "交付件",
          "sort": 50,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 0
        }
      ],
      "fields": [
        {
          "field_key": "req_code",
          "label": "需求编号",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "req_code",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "propose_dept",
          "label": "提出部门",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:req_dept",
          "multiple": 0,
          "native_column": "propose_dept",
          "component_key": "",
          "section_key": "owners",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "implementation_org",
          "label": "实施机构",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:org",
          "multiple": 0,
          "native_column": "implementation_org",
          "component_key": "",
          "section_key": "systems",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "req_type",
          "label": "需求类型",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:req_type",
          "multiple": 0,
          "native_column": "req_type",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "main_systems",
          "label": "主责系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 1,
          "native_column": "main_systems",
          "component_key": "",
          "section_key": "systems",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "proposer",
          "label": "提出人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 1,
          "native_column": "proposer",
          "component_key": "",
          "section_key": "owners",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "release_point_id",
          "label": "计划投产点",
          "field_kind": "native",
          "input_type": "release_point",
          "source_key": "release_point",
          "multiple": 0,
          "native_column": "release_point_id",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "collab_dev_systems",
          "label": "协同改造系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 1,
          "native_column": "collab_dev_systems",
          "component_key": "",
          "section_key": "systems",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "yn_owner",
          "label": "云南农信业务负责人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "yn_owner",
          "component_key": "",
          "section_key": "owners",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "propose_time",
          "label": "提出时间",
          "field_kind": "native",
          "input_type": "datetime",
          "source_key": "",
          "multiple": 0,
          "native_column": "propose_time",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "collab_test_systems",
          "label": "协同测试系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 1,
          "native_column": "collab_test_systems",
          "component_key": "",
          "section_key": "systems",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "jk_owner",
          "label": "建信金科业务负责人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "jk_owner",
          "component_key": "",
          "section_key": "owners",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "issue_no",
          "label": "OA编号/工单编号",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "issue_no",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "receiver",
          "label": "需求接收人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "receiver",
          "component_key": "",
          "section_key": "owners",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "is_accounting",
          "label": "是否涉账",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "",
          "multiple": 0,
          "native_column": "is_accounting",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "registrar",
          "label": "录入人信息",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "registrar",
          "component_key": "",
          "section_key": "owners",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "title",
          "label": "需求标题",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "title",
          "component_key": "",
          "section_key": "basic",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 70,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "summary",
          "label": "需求概述",
          "field_kind": "native",
          "input_type": "textarea",
          "source_key": "",
          "multiple": 0,
          "native_column": "summary",
          "component_key": "",
          "section_key": "basic",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 80,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "priority",
          "label": "优先级",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "priority",
          "multiple": 0,
          "native_column": "priority",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
      "list_visible": 1,
      "filterable": 1,
          "dashboard_dimension": 1,
      "sort": 90,
          "is_builtin": 1,
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "workload",
          "label": "工作量(人天)",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "workload",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 100,
          "is_builtin": 1,
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "status",
          "label": "需求状态",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "",
          "multiple": 0,
          "native_column": "status",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 110,
          "is_builtin": 1,
          "rules": {
            "需求登记": 1,
            "需求分析": 1,
            "分析完成": 1
          }
        }
      ],
      "deliverables": [
        {
          "deliverable_key": "builtin_1",
          "label": "需求说明书",
          "input_mode": "both",
          "visible": 1,
          "sort": 0,
          "layout_mode": "right",
          "rules": {
            "需求登记": 0,
            "需求分析": 0,
            "分析完成": 1
          }
        }
      ]
    },
    {
      "scope_key": "test.NFT",
      "sections": [
        {
          "section_key": "task",
          "title": "基本信息",
          "sort": 10,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "schedule",
          "title": "排期",
          "sort": 20,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "deliverables",
          "title": "交付件",
          "sort": 30,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 0
        },
        {
          "section_key": "extension",
          "title": "扩展信息",
          "sort": 40,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        }
      ],
      "fields": [
        {
          "field_key": "task_name",
          "label": "测试任务名称",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "task_name",
          "component_key": "",
          "section_key": "task",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "status",
          "label": "测试状态",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "",
          "multiple": 0,
          "native_column": "status",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "impl_system",
          "label": "测试实施系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 0,
          "native_column": "impl_system",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "owner",
          "label": "测试负责人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "owner",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "intake_owner",
          "label": "测试承接人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "intake_owner",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "impl_org",
          "label": "测试实施方",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:org",
          "multiple": 0,
          "native_column": "impl_org",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "plan_start",
          "label": "计划开始时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "plan_start",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "plan_end",
          "label": "计划结束时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "plan_end",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "actual_start",
          "label": "实际开始时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "actual_start",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 70,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "actual_end",
          "label": "实际完成时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "actual_end",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 80,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        }
      ],
      "deliverables": [
        {
          "deliverable_key": "builtin_1",
          "label": "测试方案",
          "input_mode": "both",
          "visible": 1,
          "sort": 0,
          "layout_mode": "left"
        },
        {
          "deliverable_key": "builtin_2",
          "label": "测试报告",
          "input_mode": "both",
          "visible": 1,
          "sort": 10,
          "layout_mode": "left"
        }
      ]
    },
    {
      "scope_key": "test.SEC",
      "sections": [
        {
          "section_key": "task",
          "title": "基本信息",
          "sort": 10,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "schedule",
          "title": "排期",
          "sort": 20,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "deliverables",
          "title": "交付件",
          "sort": 30,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 0
        },
        {
          "section_key": "extension",
          "title": "扩展信息",
          "sort": 30,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        }
      ],
      "fields": [
        {
          "field_key": "task_name",
          "label": "测试任务名称",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "task_name",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "status",
          "label": "测试状态",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "",
          "multiple": 0,
          "native_column": "status",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "impl_system",
          "label": "测试实施系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 0,
          "native_column": "impl_system",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "owner",
          "label": "测试负责人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "owner",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "impl_org",
          "label": "测试实施方",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:org",
          "multiple": 0,
          "native_column": "impl_org",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "plan_start",
          "label": "计划开始时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "plan_start",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "plan_end",
          "label": "计划结束时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "plan_end",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "actual_start",
          "label": "实际开始时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "actual_start",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 70,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "actual_end",
          "label": "实际完成时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "actual_end",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 80,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        }
      ],
      "deliverables": [
        {
          "deliverable_key": "builtin_1",
          "label": "测试方案",
          "input_mode": "both",
          "visible": 1,
          "sort": 0,
          "layout_mode": "left"
        },
        {
          "deliverable_key": "builtin_2",
          "label": "测试报告",
          "input_mode": "both",
          "visible": 1,
          "sort": 10,
          "layout_mode": "left"
        }
      ]
    },
    {
      "scope_key": "test.SIT",
      "sections": [
        {
          "section_key": "task",
          "title": "基本信息",
          "sort": 10,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "coverage",
          "title": "测试覆盖性分析",
          "sort": 50,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "schedule",
          "title": "排期",
          "sort": 40,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "deliverables",
          "title": "交付件",
          "sort": 40,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 0
        },
        {
          "section_key": "extension",
          "title": "扩展信息",
          "sort": 50,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        }
      ],
      "fields": [
        {
          "field_key": "task_name",
          "label": "测试任务名称",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "task_name",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "status",
          "label": "测试状态",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "",
          "multiple": 0,
          "native_column": "status",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "impl_system",
          "label": "测试实施系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 0,
          "native_column": "impl_system",
          "component_key": "",
          "section_key": "task",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "owner",
          "label": "测试负责人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "owner",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "impl_org",
          "label": "测试实施方",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:org",
          "multiple": 0,
          "native_column": "impl_org",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "plan_start",
          "label": "计划开始时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "plan_start",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "plan_end",
          "label": "计划结束时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "plan_end",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "actual_start",
          "label": "实际开始时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "actual_start",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 70,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "actual_end",
          "label": "实际完成时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "actual_end",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 80,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "coverage_analysis",
          "label": "测试覆盖性分析",
          "field_kind": "component",
          "input_type": "component",
          "source_key": "",
          "multiple": 0,
          "native_column": "",
          "component_key": "coverage_analysis",
          "section_key": "coverage",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 90,
          "is_builtin": 1
        }
      ],
      "deliverables": [
        {
          "deliverable_key": "builtin_1",
          "label": "测试方案",
          "input_mode": "both",
          "visible": 1,
          "sort": 0,
          "layout_mode": "left"
        },
        {
          "deliverable_key": "builtin_2",
          "label": "测试报告",
          "input_mode": "both",
          "visible": 1,
          "sort": 10,
          "layout_mode": "left"
        }
      ]
    },
    {
      "scope_key": "test.UAT",
      "sections": [
        {
          "section_key": "task",
          "title": "基本信息",
          "sort": 10,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "schedule",
          "title": "排期",
          "sort": 20,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "deliverables",
          "title": "交付件",
          "sort": 30,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 0
        },
        {
          "section_key": "extension",
          "title": "扩展信息",
          "sort": 40,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        }
      ],
      "fields": [
        {
          "field_key": "task_name",
          "label": "测试任务名称",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "task_name",
          "component_key": "",
          "section_key": "task",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "status",
          "label": "测试状态",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "",
          "multiple": 0,
          "native_column": "status",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "impl_system",
          "label": "测试实施系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 0,
          "native_column": "impl_system",
          "component_key": "",
          "section_key": "task",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "owner",
          "label": "测试负责人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "owner",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "impl_org",
          "label": "测试实施方",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:org",
          "multiple": 0,
          "native_column": "impl_org",
          "component_key": "",
          "section_key": "task",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 0
          }
        },
        {
          "field_key": "plan_start",
          "label": "计划开始时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "plan_start",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "plan_end",
          "label": "计划结束时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "plan_end",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "actual_start",
          "label": "实际开始时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "actual_start",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 70,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        },
        {
          "field_key": "actual_end",
          "label": "实际完成时间",
          "field_kind": "native",
          "input_type": "date",
          "source_key": "",
          "multiple": 0,
          "native_column": "actual_end",
          "component_key": "",
          "section_key": "schedule",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 80,
          "is_builtin": 1,
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        }
      ],
      "deliverables": [
        {
          "deliverable_key": "builtin_1",
          "label": "测试方案",
          "input_mode": "both",
          "visible": 1,
          "sort": 0,
          "layout_mode": "left"
        },
        {
          "deliverable_key": "builtin_2",
          "label": "测试报告",
          "input_mode": "both",
          "visible": 1,
          "sort": 10,
          "layout_mode": "left",
          "rules": {
            "测试承接": 0,
            "测试方案": 0,
            "测试实施": 0,
            "测试报告": 0,
            "测试完成": 1
          }
        }
      ]
    },
    {
      "scope_key": "ticket",
      "sections": [
        {
          "section_key": "basic",
          "title": "基本信息",
          "sort": 10,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 1
        },
        {
          "section_key": "systems",
          "title": "实施机构及系统",
          "sort": 20,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "owners",
          "title": "相关负责人",
          "sort": 30,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "extension",
          "title": "扩展信息",
          "sort": 40,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "right",
          "show_title": 1
        },
        {
          "section_key": "deliverables",
          "title": "交付件",
          "sort": 50,
          "collapsed": 0,
          "is_builtin": 1,
          "layout_mode": "left",
          "show_title": 0
        }
      ],
      "fields": [
        {
          "field_key": "ticket_code",
          "label": "工单编号",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "ticket_code",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "status",
          "label": "工单状态",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "",
          "multiple": 0,
          "native_column": "status",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "propose_dept",
          "label": "提出部门",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:req_dept",
          "multiple": 0,
          "native_column": "propose_dept",
          "component_key": "",
          "section_key": "owners",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "implementation_org",
          "label": "实施机构",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:org",
          "multiple": 0,
          "native_column": "implementation_org",
          "component_key": "",
          "section_key": "systems",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 10,
          "is_builtin": 1,
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "ticket_type",
          "label": "工单类型",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "dict:ticket_type",
          "multiple": 0,
          "native_column": "ticket_type",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "main_systems",
          "label": "主责系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 1,
          "native_column": "main_systems",
          "component_key": "",
          "section_key": "systems",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "proposer",
          "label": "提出人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 1,
          "native_column": "proposer",
          "component_key": "",
          "section_key": "owners",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 20,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "release_point_id",
          "label": "计划投产点",
          "field_kind": "native",
          "input_type": "release_point",
          "source_key": "release_point",
          "multiple": 0,
          "native_column": "release_point_id",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 1,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "collab_dev_systems",
          "label": "协同改造系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 1,
          "native_column": "collab_dev_systems",
          "component_key": "",
          "section_key": "systems",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "yn_owner",
          "label": "云南农信工单负责人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "yn_owner",
          "component_key": "",
          "section_key": "owners",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 30,
          "is_builtin": 1,
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "propose_time",
          "label": "提出时间",
          "field_kind": "native",
          "input_type": "datetime",
          "source_key": "",
          "multiple": 0,
          "native_column": "propose_time",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 0,
          "dashboard_dimension": 1,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "collab_test_systems",
          "label": "协同测试系统",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "system",
          "multiple": 1,
          "native_column": "collab_test_systems",
          "component_key": "",
          "section_key": "systems",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "jk_owner",
          "label": "建信金科工单负责人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "jk_owner",
          "component_key": "",
          "section_key": "owners",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 40,
          "is_builtin": 1,
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "issue_no",
          "label": "OA编号/工单编号",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "issue_no",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "receiver",
          "label": "需求接收人",
          "field_kind": "native",
          "input_type": "person",
          "source_key": "person",
          "multiple": 0,
          "native_column": "receiver",
          "component_key": "",
          "section_key": "owners",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 50,
          "is_builtin": 1,
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "is_accounting",
          "label": "是否涉账",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "",
          "multiple": 0,
          "native_column": "is_accounting",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 0,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "registrar",
          "label": "录入人信息",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "registrar",
          "component_key": "",
          "section_key": "owners",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 60,
          "is_builtin": 1,
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "title",
          "label": "工单标题",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "title",
          "component_key": "",
          "section_key": "basic",
          "column_span": 24,
          "visible": 1,
          "list_visible": 1,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 70,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "summary",
          "label": "工单详情",
          "field_kind": "native",
          "input_type": "textarea",
          "source_key": "",
          "multiple": 0,
          "native_column": "summary",
          "component_key": "",
          "section_key": "basic",
          "column_span": 24,
          "visible": 1,
          "list_visible": 0,
          "filterable": 0,
          "dashboard_dimension": 0,
          "sort": 80,
          "is_builtin": 1,
          "rules": {
            "工单登记": 1,
            "工单分析": 1,
            "分析完成": 1
          }
        },
        {
          "field_key": "priority",
          "label": "优先级",
          "field_kind": "native",
          "input_type": "select",
          "source_key": "priority",
          "multiple": 0,
          "native_column": "priority",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
      "list_visible": 1,
      "filterable": 1,
          "dashboard_dimension": 1,
      "sort": 90,
          "is_builtin": 1,
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        },
        {
          "field_key": "workload",
          "label": "工作量(人天)",
          "field_kind": "native",
          "input_type": "text",
          "source_key": "",
          "multiple": 0,
          "native_column": "workload",
          "component_key": "",
          "section_key": "basic",
          "column_span": 12,
          "visible": 1,
          "list_visible": 1,
          "filterable": 1,
          "dashboard_dimension": 0,
          "sort": 100,
          "is_builtin": 1,
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        }
      ],
      "deliverables": [
        {
          "deliverable_key": `deliverable_${['be8b8a3a', '815a4c31', '94af60fe', 'c2342bf5'].join('')}`,
          "label": "需求说明书",
          "input_mode": "both",
          "visible": 1,
          "sort": 0,
          "layout_mode": "left",
          "rules": {
            "工单登记": 0,
            "工单分析": 0,
            "分析完成": 0
          }
        }
      ]
    }
  ]
};

function withIntakeOwner(scope) {
  if (scope.scope_key !== 'dev' && !scope.scope_key.startsWith('test.')) return scope;
  if (scope.fields.some((field) => field.field_key === 'intake_owner')) return scope;
  const ownerIndex = scope.fields.findIndex((field) => field.field_key === 'owner');
  if (ownerIndex < 0) return scope;
  const owner = scope.fields[ownerIndex];
  return {
    ...scope,
    fields: [
      ...scope.fields.slice(0, ownerIndex + 1),
      {
        ...owner,
        field_key: 'intake_owner',
        label: scope.scope_key === 'dev' ? '开发承接人' : '测试承接人',
        native_column: 'intake_owner',
        sort: 20,
      },
      ...scope.fields.slice(ownerIndex + 1),
    ],
  };
}

// 本地“输入项配置”是新库的初始布局事实源；此处记录已由管理员确认的展示顺序和宽度。
// 仅影响全新库及缺失字段补齐，不会覆盖既有环境中的管理员布局。
const CURRENT_LOCAL_LAYOUT_OVERRIDES = {
  'test.SEC': {
    sections: { extension: { sort: 40 } },
    fields: {
      task_name: { column_span: 24 },
      owner: { sort: 40 },
      impl_org: { sort: 30 },
    },
  },
  'test.SIT': {
    sections: { coverage: { sort: 20 }, schedule: { sort: 30 } },
    fields: {
      task_name: { column_span: 24 },
      impl_system: { column_span: 12 },
      owner: { sort: 40 },
      impl_org: { sort: 30 },
    },
  },
  'test.UAT': {
    fields: {
      impl_system: { column_span: 12, sort: 50 },
      owner: { sort: 40 },
      impl_org: { sort: 30 },
    },
  },
};

function withCurrentLocalLayout(scope) {
  const overrides = CURRENT_LOCAL_LAYOUT_OVERRIDES[scope.scope_key] || {};
  const merge = (items, values = {}) => items
    .map((item) => ({ ...item, ...(values[item.field_key || item.section_key] || {}) }))
    .sort((left, right) => left.sort - right.sort);
  return {
    ...scope,
    sections: merge(scope.sections, overrides.sections),
    fields: merge(scope.fields, overrides.fields),
  };
}

export const LOCAL_STAGE_CONTENT_SEED = Object.freeze({
  ...RAW_LOCAL_STAGE_CONTENT_SEED,
  scopes: RAW_LOCAL_STAGE_CONTENT_SEED.scopes.map(withIntakeOwner).map(withCurrentLocalLayout),
});

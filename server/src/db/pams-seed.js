/**
 * 文件：db/pams-seed.js
 * 用途：PAMS 子系统默认字典、设置、角色映射和权限配置初始化。
 */

import { all as radarAll } from './index.js';
import { pamsGet, pamsRun, pamsTx } from './pams.js';

const PAMS_ROLES = [
  ['SUPER_ADMIN', '超级管理员', '/dashboard'],
  ['ADMIN', '管理员', '/dashboard'],
  ['ISSUE_MANAGER', '问题管理人员', '/dashboard'],
  ['JK_BIZ', '金科业务人员', '/cases'],
  ['NX_BIZ', '农信业务人员', '/report'],
  ['JK_TECH', '金科技术人员', '/my-issues'],
  ['NX_TECH', '农信技术人员', '/my-issues'],
  ['PENDING', '待审核账户', '/pending'],
  ['GUEST', '访客', '/report'],
];

const DEFAULT_ROLE_MAP = new Map([
  ['超级管理员', ['SUPER_ADMIN', '超级管理员']],
  ['管理员', ['ADMIN', '管理员']],
  ['问题管理', ['ISSUE_MANAGER', '问题管理人员']],
  ['金科业务', ['JK_BIZ', '金科业务人员']],
  ['农信业务', ['NX_BIZ', '农信业务人员']],
  ['金科开发', ['JK_TECH', '金科技术人员']],
  ['金科测试', ['JK_TECH', '金科技术人员']],
  ['金科运维', ['JK_TECH', '金科技术人员']],
  ['农信开发', ['NX_TECH', '农信技术人员']],
  ['农信测试', ['NX_TECH', '农信技术人员']],
  ['农信运维', ['NX_TECH', '农信技术人员']],
]);

const DICTS = [
  ['issue_status', [
    ['提出', '提出', 10, 1], ['已查明原因', '已查明原因', 20, 0], ['处理中', '处理中', 30, 0],
    ['待验证', '待验证', 40, 0], ['重现', '重现', 50, 0], ['已解决', '已解决', 60, 0],
  ]],
  ['issue_category', [
    ['未分类', '未分类', 0, 1], ['金科技术', '金科技术', 10, 0], ['农信技术', '农信技术', 20, 0],
    ['农信业务', '农信业务', 30, 0], ['无效案例', '无效案例', 40, 0], ['工单问题', '工单问题', 50, 0],
    ['延后需求', '延后需求', 60, 0], ['新增需求', '新增需求', 70, 0],
  ]],
  ['issue_round', [
    ['第一轮', '第一轮', 10, 0], ['第二轮', '第二轮', 20, 1], ['第三轮', '第三轮', 30, 0],
    ['第四轮', '第四轮', 40, 0], ['第五轮', '第五轮', 50, 0],
  ]],
  ['issue_urgency', [['高', '高', 10, 0], ['中', '中', 20, 1], ['低', '低', 30, 0]]],
  ['issue_handling_method', [
    ['换版', '换版', 10, 0], ['修数', '修数', 20, 0], ['调参', '调参', 30, 0],
    ['解释', '解释', 40, 0], ['其它', '其它', 50, 1],
  ]],
  ['issue_tag', [
    ['项目组共性问题', '项目组共性问题', 10, 0],
    ['柜员共性问题', '柜员共性问题', 20, 0],
    ['客户共性问题', '客户共性问题', 30, 0],
  ]],
  ['issue_detailed_classification', [
    ['未分类', '未分类', 0, 1],
    ['金科-指令任务', '金科-指令任务', 10, 0], ['金科-迁移版本', '金科-迁移版本', 20, 0],
    ['金科-数据质量', '金科-数据质量', 30, 0], ['金科-应用配置', '金科-应用配置', 40, 0],
    ['金科-版本部署', '金科-版本部署', 50, 0], ['金科-程序代码', '金科-程序代码', 60, 0],
    ['金科-环境网络', '金科-环境网络', 70, 0], ['金科-安全合规', '金科-安全合规', 80, 0],
    ['金科-操作理解', '金科-操作理解', 90, 0], ['金科-业务参数', '金科-业务参数', 100, 0],
    ['金科-沟通协调', '金科-沟通协调', 110, 0], ['金科-其它问题', '金科-其它问题', 120, 0],
    ['农信-指令任务', '农信-指令任务', 130, 0], ['农信-迁移版本', '农信-迁移版本', 140, 0],
    ['农信-数据质量', '农信-数据质量', 150, 0], ['农信-应用配置', '农信-应用配置', 160, 0],
    ['农信-版本部署', '农信-版本部署', 170, 0], ['农信-程序代码', '农信-程序代码', 180, 0],
    ['农信-环境网络', '农信-环境网络', 190, 0], ['农信-安全合规', '农信-安全合规', 200, 0],
    ['农信-操作理解', '农信-操作理解', 210, 0], ['农信-业务参数', '农信-业务参数', 220, 0],
    ['农信-沟通协调', '农信-沟通协调', 230, 0], ['农信-其它问题', '农信-其它问题', 240, 0],
    ['工单阻塞问题', '工单阻塞问题', 300, 0], ['工单急迫需求', '工单急迫需求', 310, 0],
    ['工单优化需求', '工单优化需求', 320, 0], ['工单操作理解', '工单操作理解', 330, 0],
    ['延后承诺需求', '延后承诺需求', 340, 0], ['新增需求', '新增需求', 350, 0],
  ]],
];

const AI_SETTINGS = [
  ['openai_api_url', 'http://ai.guantools.top:3001/v1', 'AI API URL (OpenAI compatible)'],
  ['openai_api_token', '', 'AI API authentication token'],
  ['openai_model', 'gemini-2.5-flash', 'AI model name to use'],
  ['issue_detail_qrcode_enabled', 'false', '是否显示问题详情二维码'],
  ['issue_id_template', 'NX{YYYY}{MM}{DD}{SEQ3}', '问题编号生成规则模板'],
  ['openai_prompt_single', '', '单问题分析默认提示词模板'],
  ['openai_prompt_summary', '', '批量总结分析默认提示词模板'],
  ['openai_prompt_production', '', '生成投产问题报告默认提示词模板'],
  ['openai_prompt_quick_report', '', '问题快报默认提示词模板'],
  ['openai_prompt_quick_daily', '', '快捷日报默认提示词模板'],
];

function roleFlags(allowed) {
  return Object.fromEntries(PAMS_ROLES.map(([key]) => [key, allowed.includes(key)]));
}

function defaultPermissions() {
  const allStaff = ['SUPER_ADMIN', 'ADMIN', 'ISSUE_MANAGER', 'JK_BIZ', 'NX_BIZ', 'JK_TECH', 'NX_TECH'];
  const adminAndManager = ['SUPER_ADMIN', 'ADMIN', 'ISSUE_MANAGER'];
  const adminOnly = ['SUPER_ADMIN', 'ADMIN'];
  return {
    menus: {
      dashboard: roleFlags(adminAndManager),
      report: roleFlags([...allStaff, 'GUEST']),
      'report-tracker': roleFlags([...adminAndManager, 'JK_TECH', 'NX_TECH']),
      'report-ticket': roleFlags([...adminAndManager, 'JK_TECH', 'NX_TECH']),
      'my-issues': roleFlags([...allStaff, 'GUEST']),
      issues: roleFlags(adminAndManager),
      'major-issues': roleFlags([...adminAndManager, 'JK_BIZ', 'NX_BIZ']),
      faq: roleFlags([...allStaff, 'GUEST']),
      itsm: roleFlags(adminOnly),
      kongming: roleFlags(adminOnly),
      'business-ticket': roleFlags(adminOnly),
      'problem-report': roleFlags(adminAndManager),
      analyst: roleFlags(adminAndManager),
      config: roleFlags(adminOnly),
    },
    pages: {
      '/newissues': roleFlags([...allStaff, 'GUEST']),
      '/itsmdetail': roleFlags(adminOnly),
      '/kongmingdetail': roleFlags(adminOnly),
      '/business-ticketdetail': roleFlags(adminOnly),
    },
    features: {
      'issues:batch': roleFlags(adminAndManager),
      'issues:export': roleFlags(adminAndManager),
      'major-issues:batch': roleFlags(adminAndManager),
      'major-issues:export': roleFlags(adminAndManager),
      'itsm:batch': roleFlags(adminOnly),
      'itsm:export': roleFlags(adminOnly),
      'kongming:batch': roleFlags(adminOnly),
      'kongming:export': roleFlags(adminOnly),
      'business-ticket:batch': roleFlags(adminOnly),
      'business-ticket:export': roleFlags(adminOnly),
      'config:permissions:edit': roleFlags(adminOnly),
    },
    allowedDetailedCategories: Object.fromEntries(PAMS_ROLES.map(([key]) => [key, null])),
    initialPages: {},
  };
}

function seedDict(dictCode, itemKey, itemValue, sortOrder, isDefault = 0) {
  pamsRun(
    `INSERT INTO sys_dict (dict_code, item_key, item_value, sort_order, is_system, is_default_val)
     VALUES (?,?,?,?,1,?)
     ON CONFLICT(dict_code, item_key) DO UPDATE SET
       item_value=excluded.item_value,
       sort_order=excluded.sort_order,
       is_default_val=COALESCE(sys_dict.is_default_val, excluded.is_default_val)`,
    dictCode, itemKey, itemValue, sortOrder, isDefault,
  );
}

export function runPamsSeed() {
  pamsTx(() => {
    for (const [key, value, home] of PAMS_ROLES) {
      seedDict('user_role', key, value, PAMS_ROLES.findIndex(([r]) => r === key) * 10 + 10, 0);
      pamsRun(
        "UPDATE sys_dict SET description = ? WHERE dict_code = 'user_role' AND item_key = ?",
        JSON.stringify({ home }),
        key,
      );
    }

    for (const [dictCode, items] of DICTS) {
      for (const [key, value, sort, isDefault] of items) seedDict(dictCode, key, value, sort, isDefault);
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    for (const [key, value, desc] of AI_SETTINGS) {
      if (!pamsGet('SELECT setting_id FROM sys_ai_settings WHERE setting_key = ?', key)) {
        pamsRun(
          'INSERT INTO sys_ai_settings (setting_key, setting_value, description, updated_at) VALUES (?,?,?,?)',
          key, value, desc, now,
        );
      }
    }

    if (!pamsGet("SELECT key FROM pams_permission_config WHERE key = 'permissions'")) {
      pamsRun(
        'INSERT INTO pams_permission_config (key, value) VALUES (?,?)',
        'permissions',
        JSON.stringify(defaultPermissions()),
      );
    }

    const roles = radarAll('SELECT id, code, name FROM role ORDER BY id');
    for (const role of roles) {
      const [pamsKey, pamsName] = DEFAULT_ROLE_MAP.get(role.code) || ['ISSUE_MANAGER', '问题管理人员'];
      pamsRun(
        `INSERT INTO pams_role_mapping (radar_role_id, radar_role_code, radar_role_name, pams_role_key, pams_role_name)
         VALUES (?,?,?,?,?)
         ON CONFLICT(radar_role_code) DO UPDATE SET
           radar_role_id=excluded.radar_role_id,
           radar_role_name=excluded.radar_role_name`,
        role.id, role.code, role.name, pamsKey, pamsName,
      );
    }
  });

  console.log('[PAMS] 数据库与默认配置已就绪');
}

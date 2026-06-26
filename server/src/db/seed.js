/**
 * 文件：db/seed.js
 * 用途：写入平台初始数据——超级管理员、角色、权限矩阵默认值、各类字典初值
 *       （流程状态/版本类型/投产状态/需求类型/机构/板块）、所属系统清单、平台配置与编号规则。
 * 作者：hengguan
 * 说明：全部操作幂等：仅当目标数据不存在时才插入，可安全重复执行。
 */

import { db, get, run, tx, all } from './index.js';
import { hashPassword } from '../lib/password.js';
import { config } from '../config.js';
import { DEFAULT_REQUIRED_FIELD_CONFIG, REQUIRED_FIELDS_CONFIG_KEY } from '../lib/required-fields.js';

// 角色定义（角色标识、名称、是否内置、是否会签角色）
// 会签角色（signoff:1）：安全/架构/机构/项目/测试/配置负责人——投产评审会签由这 6 个角色完成。
const ROLES = [
  { code: '金科业务', name: '金科业务' },
  { code: '农信业务', name: '农信业务' },
  { code: '金科开发', name: '金科开发' },
  { code: '农信开发', name: '农信开发' },
  { code: '金科测试', name: '金科测试' },
  { code: '农信测试', name: '农信测试' },
  { code: '金科运维', name: '金科运维' },
  { code: '农信运维', name: '农信运维' },
  { code: '安全负责人', name: '安全负责人', signoff: 1 },
  { code: '架构负责人', name: '架构负责人', signoff: 1 },
  { code: '机构负责人', name: '机构负责人', signoff: 1 },
  { code: '项目负责人', name: '项目负责人', signoff: 1 },
  { code: '测试负责人', name: '测试负责人', signoff: 1 },
  { code: '配置负责人', name: '配置负责人', signoff: 1 },
  { code: '管理员', name: '管理员' },
  { code: '超级管理员', name: '超级管理员', builtin: 1 },
];

// 会签角色标识集合（投产评审会签）
const SIGNOFF_ROLE_CODES = ROLES.filter((r) => r.signoff).map((r) => r.code);

// 模块 -> 该模块支持的全部操作键
const MODULE_ACTIONS = {
  dashboard: ['view', 'manage'],
  overview: ['view'],
  requirement: ['view', 'create', 'edit', 'delete', 'import', 'export'],
  ticket: ['view', 'create', 'edit', 'delete', 'import', 'export'],
  issue: ['view', 'sync', 'delete'],
  dev: ['view', 'create', 'edit', 'delete', 'import', 'export', 'dev.intake'],
  test: ['view', 'create', 'edit', 'delete', 'import', 'export', 'test.intake'],
  release: ['view', 'edit', 'export', 'release.signoff', 'release.register'],
  release_apply: ['view', 'create', 'edit', 'delete', 'import', 'export'],
  user: ['view', 'create', 'edit', 'delete', 'import', 'export'],
  settings: ['view', 'create', 'edit', 'delete', 'import', 'export', 'settings.permission.edit'],
};

// 业务主链路模块（非管理类角色默认可见）
const CHAIN_MODULES = ['dashboard', 'overview', 'requirement', 'ticket', 'issue', 'dev', 'test', 'release', 'release_apply'];

// 流程状态字典：[阶段, 属性值, 显示值, 排序, 是否终态]
const PROCESS_STATUS = [
  ['需求', '需求登记', '需求登记', 1, 'initial'],
  ['需求', '需求分析', '需求分析', 2, 'in-progress'],
  ['需求', '分析完成', '分析完成', 3, 'final'],
  ['工单', '工单登记', '工单登记', 4, 'initial'],
  ['工单', '工单分析', '工单分析', 5, 'in-progress'],
  ['工单', '分析完成', '分析完成', 6, 'final'],
  ['开发', '开发承接', '开发承接', 7, 'initial'],
  ['开发', '开发设计', '开发设计', 8, 'in-progress'],
  ['开发', '开发实施', '开发实施', 9, 'in-progress'],
  ['开发', '单元测试', '单元测试', 10, 'in-progress'],
  ['开发', '开发完成', '开发完成', 11, 'final'],
  ['测试', '测试承接', '测试承接', 12, 'initial'],
  ['测试', '测试方案', '测试方案', 13, 'in-progress'],
  ['测试', '测试实施', '测试实施', 14, 'in-progress'],
  ['测试', '测试报告', '测试报告', 15, 'in-progress'],
  ['测试', '测试完成', '测试完成', 16, 'final'],
  ['投产', '待评审', '待评审', 17, 'in-progress'],
  ['投产', '评审通过', '评审通过', 18, 'in-progress'],
  ['投产', '已上线', '已上线', 19, 'final'],
  ['评审', '未签署', '未签署', 20, 'in-progress'],
  ['评审', '已签署', '已签署', 21, 'final'],
  ['评审', '已驳回', '已驳回', 22, 'in-progress'],
];

// 投产版本类型
const VERSION_TYPE = [['常规版本', 1], ['应急版本', 2], ['重大版本', 3]];
// 投产状态
const RELEASE_STATUS = [['待投产', 1], ['已投产', 2], ['已取消', 3]];
// 需求类型（默认值，可在系统设置中增删）
const REQ_TYPE = [
  ['新增监管需求', 1],
  ['新增优化需求', 2],
  ['延期需求', 3],
  ['急迫需求', 4]
];
// 工单类型
const TICKET_TYPE = [
  ['工单急迫需求', 1],
  ['工单阻塞问题', 2],
  ['延后承诺需求', 3],
];
// 评审状态（投产评审会签）：待评审为默认，评审同意/拒绝自动推导，评审撤销/应急审批手动设置
const REVIEW_STATUS = [['待评审', 1], ['评审同意', 2], ['评审拒绝', 3], ['评审撤销', 4], ['应急审批', 5]];
// 制品类型（投产申请）：镜像制品 / 二进制制品 / 介质库文件 / 无制品
const ARTIFACT_TYPE = [['镜像制品', 1], ['二进制制品', 2], ['介质库文件', 3], ['无制品', 4]];
// 摆渡状态（投产申请）：未摆渡（默认）/ 待发送 / 已摆渡 / 摆渡失败
const FERRY_STATUS = [['未摆渡', 1], ['待发送', 2], ['已摆渡', 3], ['摆渡失败', 4]];

// 机构（实施机构 / 组织机构共用）：[属性值, 显示值, 排序]
const ORGS = [
  ['智能云事业部', '智能云', 1], ['北京事业群', '北京', 2], ['上海事业群', '上海', 3],
  ['广州事业群', '广州', 4], ['深圳事业群', '深圳', 5], ['成都事业群', '成都', 6],
  ['厦门事业群', '厦门', 7], ['武汉事业群', '武汉', 8], ['基础技术中心', '基础', 9],
  ['大数据中心', '大数据', 10], ['交付事业部', '交付', 11], ['实施调度中心', '实调', 12],
  ['云南农信', '农信', 13], ['建信金科', '金科', 14],
];

// 业务板块
const SECTORS = [
  ['对公金融板块', '对公', 1], ['对私金融板块', '对私', 2], ['信贷管理板块', '信贷', 3],
  ['渠道运营板块', '渠运', 4], ['计划财务板块', '计财', 5], ['风险管理板块', '风险', 6],
  ['技术系统', '技术', 7],
];

// 需求部门：[属性值, 排序]
const REQ_DEPTS = [
  ['风险管理板块', 1],
  ['计划财务板块', 2],
  ['渠道运营板块', 3],
  ['信贷管理板块', 4],
  ['对私金融板块', 5],
  ['对公金融板块', 6],
];

// 所属系统清单：[系统编号, 系统名称, 所属机构, 所属板块, 排序]
const SYSTEMS = [
  ['YN0320', '反电诈账户风险监测系统', '云南农信', '保留系统', 1],
  ['TA2310', '文件传输', '基础技术中心', '技术系统', 2],
  ['YN0010', '财务管理系统', '云南农信', '技术系统', 3],
  ['W0741Y-BASS', '监管应用-BASS_集中银行账户报送', '交付事业部', '计划财务板块', 4],
  ['YP9001', '公共综合管理报表P9', '交付事业部', '风险管理板块', 5],
  ['TA2320', '消息中心', '上海事业群', '技术系统', 6],
  ['YN0020', 'OA系统', '云南农信', '技术系统', 7],
  ['WP4011', '企业服务总线', '上海事业群', '技术系统', 8],
  ['YN0030', '移动资金稽核系统', '云南农信', '技术系统', 9],
  ['TA2300', '企业服务总线-服务目录', '上海事业群', '技术系统', 10],
  ['YN0040', '资金管理平台', '云南农信', '技术系统', 11],
  ['TF0201', 'C框架', '上海事业群', '技术系统', 12],
  ['YN0050', '第三方存管系统', '云南农信', '技术系统', 13],
  ['W01812', '存款-对公', '上海事业群', '对公金融板块', 14],
  ['YN0060', '理财平台', '云南农信', '技术系统', 15],
  ['WP5018', 'P5-存款信息报送', '上海事业群', '对私金融板块', 16],
  ['YN0070', '规费实征数据获取系统', '云南农信', '技术系统', 17],
  ['W11433', '定价管理', '上海事业群', '计划财务板块', 18],
  ['YN0170', '高管驾驶舱', '云南农信', '技术系统', 19],
  ['W11430', '定价管理-计算引擎_OLTP', '上海事业群', '计划财务板块', 20],
  ['YN0180', '惠民惠农一卡通平台', '云南农信', '技术系统', 21],
  ['W06011', '合约管理', '上海事业群', '渠道运营板块', 22],
  ['YN0151', '银电互联系统', '云南农信', '技术系统', 23],
  ['W0611Z', '客户结算', '上海事业群', '计划财务板块', 24],
  ['YN0152', '代缴燃气费', '云南农信', '技术系统', 25],
  ['W06113', '主机产品服务平台', '上海事业群', '技术系统', 26],
  ['YN0153', '云南省财政非税收入电子化收缴系统', '云南农信', '技术系统', 27],
  ['W0611Y', '主机联机事务处理框架', '上海事业群', '技术系统', 28],
  ['YN0154', '住建部公积金系统', '云南农信', '技术系统', 29],
  ['W03310', '支付结算-P6', '上海事业群', '渠道运营板块', 30],
  ['YN0155', '维修基金系统', '云南农信', '技术系统', 31],
  ['W03380', '票交所直连系统', '上海事业群', '渠道运营板块', 32],
  ['YN0156', '代缴水费', '云南农信', '技术系统', 33],
  ['W03329', '新一代支付密码子系统', '上海事业群', '渠道运营板块', 34],
  ['YN0157', '商品房预售资金监管系统', '云南农信', '技术系统', 35],
  ['WP201B', '员工渠道-代理业务管理领域', '北京事业群', '渠道运营板块', 36],
  ['WP5014', 'P5-重要客户、客户ERP、代理保险领域', '北京事业群', '对私金融板块', 37],
  ['TA2160', '即时通信', '成都事业群', '技术系统', 38],
  ['W00415', '分布式客户信息管理（对公）系统', '成都事业群', '渠道运营板块', 39],
  ['W00410', '对公客户信息查询子系统', '成都事业群', '渠道运营板块', 40],
  ['W00414', '对公客户联网核查子系统', '成都事业群', '渠道运营板块', 41],
  ['W00426', '分布式客户信息管理（对私）系统', '成都事业群', '渠道运营板块', 42],
  ['W00428', '公民联网核查身份子系统', '成都事业群', '渠道运营板块', 43],
  ['W08660', '机构管理.企业操作员管理', '武汉事业群', '渠道运营板块', 44],
  ['W40910', '人工智能-生产运营项目', '武汉事业群', '技术系统', 45],
  ['WP901C', '运营管理领域计算子系统', '武汉事业群', '渠道运营板块', 46],
  ['W02016', '新一代个贷服务整合子系统', '深圳事业群', '信贷管理板块', 47],
  ['W0201F', '零售贷款作业服务', '深圳事业群', '信贷管理板块', 48],
  ['W0201C', '零售贷款账务核心', '深圳事业群', '信贷管理板块', 49],
  ['W0201D', '零售贷款资金组合', '深圳事业群', '信贷管理板块', 50],
  ['W0201G', '零售贷款数据及报表', '深圳事业群', '信贷管理板块', 51],
  ['WP3016', 'P3-对公信贷领域', '厦门事业群', '信贷管理板块', 52],
  ['P2002A', 'P2-对公信贷领域', '厦门事业群', '信贷管理板块', 53],
  ['W10534', '总账系统', '大数据中心', '计划财务板块', 54],
  ['W10012', '反洗钱清单监测', '交付事业部', '风险管理板块', 55],
  ['W10010', '反洗钱', '交付事业部', '风险管理板块', 56],
  ['WP901B', '反洗钱计算子系统', '交付事业部', '风险管理板块', 57],
  ['W10410', '计划预算', '大数据中心', '计划财务板块', 58],
  ['W10611', '新一代管理会计', '大数据中心', '计划财务板块', 59],
  ['W09420', '中央风险计量引擎', '大数据中心', '风险管理板块', 60],
];

// 平台配置默认值（key, value, 说明）
const APP_CONFIG = [
  ['platform.name', '日常需求研发流程管理', '平台名称'],
  ['platform.shortName', 'RADAR', '平台英文简称'],
  ['platform.fullName', 'Requirement Agile Delivery & Acceleration Resource', '平台英文全称'],
  ['platform.copyright', '© 2026 RADAR · 日常需求研发流程管理', '版权信息'],
  ['platform.themeColor', '#2F54EB', '主题色（靛蓝）'],
  ['code.requirement', 'RC_{投产窗口}_{序号}', '需求编号规则'],
  ['code.ticket', 'TK_{投产窗口}_{序号}', '工单编号规则'],
  ['code.dev', 'RW_{需求编号}_{序号}', '开发任务编号规则'],
  ['code.test.SIT', 'SIT_{需求编号}_{序号}', '应用组装测试任务编号规则'],
  ['code.test.UAT', 'UAT_{需求编号}_{序号}', '用户测试任务编号规则'],
  ['code.test.NFT', 'NFT_{需求编号}_{序号}', '非功能测试任务编号规则'],
  ['code.test.SEC', 'SEC_{需求编号}_{序号}', '安全测试任务编号规则'],
  ['code.release_apply', '{版本年月}-10bg{序号}', '投产申请变更编号规则'],
  ['release.signoffRoles', '["安全负责人","架构负责人","机构负责人","项目负责人","测试负责人","配置负责人"]', '投产评审会签角色（JSON 数组）'],
  ['appearance.preset', 'sky', '外观主题预设（默认清新蓝）'],
  [REQUIRED_FIELDS_CONFIG_KEY, JSON.stringify(DEFAULT_REQUIRED_FIELD_CONFIG), '字段必填项配置（JSON）'],
  ['security.password.complexity', 'true', '启用密码复杂度校验'],
  ['security.password.minLength', '8', '密码最小长度'],
  ['security.password.expireDays', '90', '密码有效期（天）'],
  ['security.lockout.enabled', 'true', '启用登录失败锁定'],
  ['security.lockout.maxAttempts', '5', '最大密码错误尝试次数'],
  ['security.lockout.durationMinutes', '15', '账号锁定时长（分钟）'],
];

/**
 * 插入字典项（不存在才插）。
 */
function seedDict(category, attrValue, displayValue, sort, extra) {
  let exists = null;
  if (category === 'process_status' && extra?.stage) {
    const rows = all(
      'SELECT id, extra FROM dict_item WHERE category = ? AND attr_value = ?',
      category, attrValue,
    );
    exists = rows.find((r) => {
      try {
        const parsed = r.extra ? JSON.parse(r.extra) : {};
        return parsed.stage === extra.stage;
      } catch {
        return false;
      }
    });
  } else {
    exists = get(
      'SELECT id FROM dict_item WHERE category = ? AND attr_value = ?',
      category, attrValue,
    );
  }
  if (!exists) {
    run(
      'INSERT INTO dict_item (category, attr_value, display_value, sort, extra) VALUES (?,?,?,?,?)',
      category, attrValue, displayValue, sort, extra ? JSON.stringify(extra) : null,
    );
  }
}

/**
 * 为指定角色授予某模块的若干操作权限。
 */
function grant(roleId, moduleKey, actions) {
  for (const action of actions) {
    run(
      `INSERT INTO permission (role_id, module_key, action_key, allowed) VALUES (?,?,?,1)
       ON CONFLICT(role_id, module_key, action_key) DO UPDATE SET allowed = 1`,
      roleId, moduleKey, action,
    );
  }
}

/**
 * 执行全部初始化数据写入。
 */
export function runSeed() {
  tx(() => {
    // 1) 平台配置
    for (const [key, value, remark] of APP_CONFIG) {
      if (!get('SELECT key FROM app_config WHERE key = ?', key)) {
        run('INSERT INTO app_config (key, value, remark) VALUES (?,?,?)', key, value, remark);
      }
    }

    // 2) 字典
    for (const [stage, attr, disp, sort, stateType] of PROCESS_STATUS) {
      seedDict('process_status', attr, disp, sort, { stage, stateType, isTerminal: stateType === 'final' });
    }
    for (const [attr, sort] of VERSION_TYPE) seedDict('version_type', attr, attr, sort);
    for (const [attr, sort] of RELEASE_STATUS) seedDict('release_status', attr, attr, sort);
    for (const [attr, sort] of REQ_TYPE) seedDict('req_type', attr, attr, sort);
    for (const [attr, sort] of TICKET_TYPE) seedDict('ticket_type', attr, attr, sort);
    for (const [attr, sort] of REVIEW_STATUS) seedDict('review_status', attr, attr, sort);
    for (const [attr, sort] of ARTIFACT_TYPE) seedDict('artifact_type', attr, attr, sort);
    for (const [attr, sort] of FERRY_STATUS) seedDict('ferry_status', attr, attr, sort);
    for (const [attr, disp, sort] of ORGS) seedDict('org', attr, disp, sort);
    for (const [attr, disp, sort] of SECTORS) seedDict('sector', attr, disp, sort);
    for (const [attr, sort] of REQ_DEPTS) seedDict('req_dept', attr, attr, sort);

    // 3) 所属系统
    for (const [code, name, org, sector, sort] of SYSTEMS) {
      if (!get('SELECT id FROM system WHERE sys_code = ?', code)) {
        run(
          'INSERT INTO system (sys_code, sys_name, org, sector, sort) VALUES (?,?,?,?,?)',
          code, name, org, sector, sort,
        );
      }
    }

    // 4) 角色
    const roleIdByCode = {};
    for (const r of ROLES) {
      let row = get('SELECT id FROM role WHERE code = ?', r.code);
      if (!row) {
        const res = run(
          'INSERT INTO role (name, code, default_home, is_builtin, is_signoff_role) VALUES (?,?,?,?,?)',
          r.name, r.code, '仪表盘', r.builtin ? 1 : 0, r.signoff ? 1 : 0,
        );
        row = { id: res.lastInsertRowid };
      }
      roleIdByCode[r.code] = row.id;
    }
    // 4b) 同步会签角色标识：以 ROLES 定义为准（仅影响内置角色，自定义角色不受影响）。
    //     早期迁移 0002 将金科侧业务/开发/测试/运维标记为会签角色，此处统一归位到 6 个负责人角色。
    for (const r of ROLES) {
      run('UPDATE role SET is_signoff_role = ? WHERE code = ?', r.signoff ? 1 : 0, r.code);
    }

    // 5) 权限矩阵默认值
    // 管理员 / 超级管理员：全部权限
    for (const code of ['管理员', '超级管理员']) {
      for (const [mod, actions] of Object.entries(MODULE_ACTIONS)) {
        grant(roleIdByCode[code], mod, actions);
      }
    }
    // 业务/开发/测试/运维角色：主链路模块默认可见，并按职责授予功能权限
    const dutyMap = {
      requirement: ['金科业务', '农信业务'],
      ticket: ['金科业务', '农信业务'],
      dev: ['金科开发', '农信开发'],
      test: ['金科测试', '农信测试', '金科业务', '农信业务'], // UAT 涉及业务
      release: ['金科运维', '农信运维'],
      release_apply: ['金科运维', '农信运维'],
    };
    const nonAdminRoles = ROLES.filter((r) => !['管理员', '超级管理员'].includes(r.code));
    for (const r of nonAdminRoles) {
      const rid = roleIdByCode[r.code];
      // 所有主链路模块可见
      for (const mod of CHAIN_MODULES) grant(rid, mod, ['view']);
      // 按职责授予写权限
      for (const [mod, roleCodes] of Object.entries(dutyMap)) {
        if (roleCodes.includes(r.code)) grant(rid, mod, MODULE_ACTIONS[mod]);
      }
      // 会签角色：授予投产审批的签署权限（仅本角色可签署对应会签项）
      if (r.signoff) grant(rid, 'release', ['view', 'release.signoff']);
    }

    // 6) 超级管理员用户
    if (!get('SELECT id FROM user WHERE phone = ?', config.superAdmin.phone)) {
      const res = run(
        'INSERT INTO user (phone, name, org, password_hash, status, is_super, password_changed_at) VALUES (?,?,?,?,?,1,datetime(\'now\',\'localtime\'))',
        config.superAdmin.phone,
        config.superAdmin.name,
        '建信金科',
        hashPassword(config.superAdmin.password),
        '启用',
      );
      run(
        'INSERT INTO user_role (user_id, role_id) VALUES (?,?)',
        res.lastInsertRowid, roleIdByCode['超级管理员'],
      );
    }

    // 7) 自动迁移/升级历史状态数据，将已有流程状态自动打标为对应的类别
    const rows = all("SELECT id, attr_value, extra FROM dict_item WHERE category = 'process_status'");
    for (const r of rows) {
      let extra = {};
      try { extra = r.extra ? JSON.parse(r.extra) : {}; } catch {}
      if (!extra.stateType) {
        if (['需求登记', '开发承接', '测试承接'].includes(r.attr_value)) {
          extra.stateType = 'initial';
        } else if (['需求完成', '分析完成', '开发完成', '测试完成', '已上线', '已签署'].includes(r.attr_value)) {
          extra.stateType = 'final';
        } else {
          extra.stateType = 'in-progress';
        }
        extra.isTerminal = extra.stateType === 'final';
        run('UPDATE dict_item SET extra = ? WHERE id = ?', JSON.stringify(extra), r.id);
      }
    }
  });

  console.log('[初始化] 种子数据已就绪');
}

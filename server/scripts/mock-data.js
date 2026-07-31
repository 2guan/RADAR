/**
 * 文件：server/scripts/mock-data.js
 * 说明：本脚本独立运行（node scripts/mock-data.js），用于重置演示环境。会删除除超级管理员外的全部业务数据，请谨慎执行。
 *       数据特征：
 *         - 问题清单使用仓库内固定的 20 条待验证问题快照，并与同编号工单一对一关联；
 *         - 需求、工单通过 release_apply.ref_codes 进入投产审批清单；问题仅作为工单来源与问题清单数据；
 *         - 评审状态覆盖待评审/评审同意/评审拒绝/应急审批/评审撤销；
 *         - 编号、偏差率、终态附件、投产制品和过程留痕均按平台规则生成，便于逐项验证。
 * 用途：生成可演示/可验证的全链路测试模拟数据。先确保库表与基础种子（角色/字典/系统/会签配置）就绪，
 *       再清空现有业务与人员数据，灌入：20+ 用户、12 个投产点、120 个需求、200+ 开发任务、
 *       SIT/UAT/NFT/SEC 测试任务、投产审批（会签）、投产申请、问题清单及关联关系与过程留痕。
 * 作者：hengguan
 */

import { db, get, all, run, tx, closeDb } from '../src/platform/persistence/engine/index.js';
import path from 'node:path';
import { config } from '../src/platform/runtime/config.js';
import { runMigrations } from '../src/platform/persistence/migrate.js';
import { runSeed } from '../src/bootstrap/seed.js';
import { hashPassword } from '../src/platform/auth/index.js';
import { parseJsonArray, parseJsonObject, logger } from '../src/platform/runtime/index.js';
import { auditCreate, auditUpdate } from '../src/platform/audit/index.js';
import { generateRequirementCode } from '../src/modules/requirements/index.js';
import { generateDevTaskCode, generateTestTaskCode, calcDeviation } from '../src/modules/development/index.js';
import { generateReleaseApplyCode } from '../src/modules/release/applications/release-apply/index.js';

// ---------------------------------------------------------------------------
// 确定性随机数（mulberry32），保证每次生成结果一致，便于复现与对照验证
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function rng() {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260616);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const pickN = (arr, n) => {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
};
const uniq = (arr) => [...new Set((arr || []).filter(Boolean))];
/** 在 base 日期(YYYY-MM-DD)上偏移 days 天，返回 YYYY-MM-DD */
function shift(base, days) {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
/** YYYYMMDD -> YYYY-MM-DD */
const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

// ---------------------------------------------------------------------------
// 演示人员清单：[手机号, 姓名, 所属机构, 角色标识数组]。
// 角色数组与用户角色关系一一对应；含「超级管理员」的账号以 is_super=1 建号。
// ---------------------------------------------------------------------------
const USERS = [
  ['18015884321', '耿俊辉', '交付', ['架构管理']],
  ['18733585536', '申永增', '北京', ['金科开发', '金科运维', '机构负责人']],
  ['18201699022', '田振', '交付', ['金科运维', '配置管理员']],
  ['18918688502', '杨青', '交付', ['金科业务']],
  ['13668758491', '孙雪峰', '农信', ['农信业务']],
  ['15126311088', '崔晓林', '农信', ['农信业务']],
  ['15808709229', '贺婵', '农信', ['农信业务']],
  ['15087190584', '王鲁', '农信', ['农信业务']],
  ['18787458157', '陈洁', '农信', ['农信测试']],
  ['13888920605', '陈旭', '农信', ['农信测试']],
  ['18261598684', '盛赛荣', '交付', ['架构管理']],
  ['15818723430', '王晓坤', '交付', ['管理员']],
  ['13308236171', '曹志学', '成都', ['管理员']],
  ['18601250615', '薛潇', '交付', ['超级管理员']],
  ['15037691731', '肖乃峰', '交付', ['金科业务', '金科开发', '金科测试', '金科运维', '安全管理', '超级管理员']],
  ['13574870755', '彭景华', '交付', ['金科业务', '测试管理']],
  ['18918688309', '忻健', '交付', ['项目管理', '测试管理']],
  ['13706969866', '吴刚', '交付', ['项目管理']],
  ['18918689016', '胡伟钢', '上海', ['机构负责人']],
  ['18820995661', '胡霆', '深圳', ['机构负责人']],
  ['13708487153', '鲁志兵', '农信', ['机构负责人']],
  ['18313983383', '王冲生', '农信', ['农信运维', '配置管理员']],
  ['18910053279', '王卫东', '交付', ['配置管理员']],
  ['15810107688', '王凯', '交付', ['金科运维']],
  ['18965810392', '张京', '厦门', ['金科业务', '金科开发', '机构负责人']],
  ['18959228330', '李河杰', '大数据', ['金科开发']],
  ['18652954495', '杨锡明', '交付', ['项目管理']],
  ['13811931599', '詹同宇', '交付', ['金科开发']],
  ['18918688029', '郭劲松', '交付', ['项目管理']],
  ['13881954314', '李彪', '交付', ['金科业务', '金科测试']],
  ['15108711537', '李昶霖', '农信', ['农信运维']],
  ['18687112956', '谢恩宏', '农信', ['测试管理']],
  ['18918688193', '李通', '交付', ['测试管理']],
  ['admin', '超级管理员', '金科', ['超级管理员']],
];

// 演示账号统一密码：仅用于 mock/演示环境，禁止用于任何真实账号或生产环境。
export const MOCK_ACCOUNT_PASSWORD = 'Radar@2026';

// 演示投产窗口：用于为需求、工单、投产审批与投产申请建立可追踪的计划关联。
// 字段依次为 YYYYMMDD、版本类型、是否默认、是否归档；脚本每次覆盖时会重建该基准数据。
const RELEASE_POINTS = [
  ['20260116', '常规版本', 0, 1], ['20260220', '常规版本', 0, 0], ['20260320', '重大版本', 0, 0],
  ['20260417', '常规版本', 0, 0], ['20260515', '常规版本', 0, 0], ['20260619', '常规版本', 1, 0],
  ['20260717', '应急版本', 0, 0], ['20260821', '常规版本', 0, 0], ['20260918', '常规版本', 0, 0],
  ['20261016', '重大版本', 0, 0], ['20261120', '常规版本', 0, 0], ['20261218', '常规版本', 0, 0],
];

function normalizeIssue(row, idx = 0) {
  const code = String(row.issue_code || row.code || '').trim();
  if (!code) return null;
  const cls = row.detailed_classification || row.cls || '金科-应用配置';
  const status = row.status || pick(['提出', '处理中', '待验证', '已解决']);
  const system = String(row.system || '').trim() || 'W00000';
  const summary = String(row.summary || `${system}${cls}处理`).trim();
  return {
    code,
    system,
    cls,
    status,
    work_order_no: row.work_order_no || (cls.includes('工单') ? `ZHQQ_202607${String(idx + 1).padStart(2, '0')}_001` : null),
    urgency: row.urgency || pick(['中', '高', '紧急']),
    round: row.round || `第${(idx % 3) + 1}轮`,
    summary,
    details: row.details || `${system}生产环境出现${cls}，具体表现：${summary.slice(0, 90)}。请按问题闭环流程完成分析、修复、验证与投产关联。`,
    category: row.category || '生产问题',
    business_group: row.business_group || '云南农信',
    module: row.module || '业务系统',
    tracker_name: row.tracker_name || null,
    tracker_org: row.tracker_org || '云南农信',
    reporter_name: row.reporter_name || null,
    reporter_org: row.reporter_org || '云南农信',
    handler_name: row.handler_name || null,
    handler_org: row.handler_org || '建信金科',
    root_cause: row.root_cause || null,
    solution: row.solution || null,
    release_status: row.release_status || null,
    synced_at: row.synced_at || '2026-07-13 09:00:00',
  };
}

export const MOCK_ISSUE_SNAPSHOT = [
  // 前半组：覆盖不同系统、处理方式与分类，供问题列表和工单关联演示。
  {
    "code": "NX20260721015",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "厦门事业群",
    "module": "对公金融板块",
    "system": "客户管理与维护-对公",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-应用配置",
    "summary": "管护权分配**",
    "details": "管护权分配时，查询辖**",
    "release_status": "未评审"
  },
  {
    "code": "NX20260721010",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "交付事业部",
    "module": "计划财务板块",
    "system": "监管应用-BASS_集中银行账户报送",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-批量问题-业务操作",
    "summary": "BASS-**",
    "details": "问题现象：\nbass**",
    "release_status": "36"
  },
  {
    "code": "NX20260720014",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "大数据中心",
    "module": "风险管理板块",
    "system": "反欺诈运营管理",
    "work_order_no": "ZHQQ_20260716_008",
    "status": "待验证",
    "category": "工单问题",
    "cls": "工单阻塞问题",
    "summary": "反欺诈系统**",
    "details": "反欺诈系统近一个月经**",
    "release_status": "36"
  },
  {
    "code": "NX20260717013",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "深圳事业群",
    "module": "信贷管理板块",
    "system": "P2-个人贷款领域",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-应用配置",
    "summary": "个贷贷款账**",
    "details": "个人贷款账户2615**",
    "release_status": "36"
  },
  {
    "code": "NX20260716007",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "深圳事业群",
    "module": "信贷管理板块",
    "system": "新一代个人贷款",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-应用配置",
    "summary": "个贷新增删**",
    "details": "问题拆分，原问题单N**",
    "release_status": "已摆渡"
  },
  {
    "code": "NX20260715009",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "交付事业部",
    "module": "计划财务板块",
    "system": "监管应用-BASS_集中银行账户报送",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-批量问题-其他",
    "summary": "bass **",
    "details": "BASS 当前无预警**",
    "release_status": "36"
  },
  {
    "code": "NX20260714012",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "交付事业部",
    "module": "计划财务板块",
    "system": "监管应用-PBOC_人行金融统计",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-应用配置",
    "summary": "3324报**",
    "details": "3324报表：发生额**",
    "release_status": "36"
  },
  {
    "code": "NX20260714003",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "成都事业群",
    "module": "渠道运营板块",
    "system": "智慧柜员机",
    "work_order_no": "ZHQQ_20260710_005",
    "status": "待验证",
    "category": "工单问题",
    "cls": "工单阻塞问题",
    "summary": "智慧柜员机**",
    "details": "智慧柜员机票箱进行清**",
    "release_status": "36"
  },
  {
    "code": "NX20260714002",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "厦门事业群",
    "module": "信贷管理板块",
    "system": "对公信贷-合同支用",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-应用配置",
    "summary": "合同支用提**",
    "details": "一个信贷资料管理系统**",
    "release_status": "已摆渡"
  },
  {
    "code": "NX20260713013",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "深圳事业群",
    "module": "信贷管理板块",
    "system": "零售贷款账务核心",
    "work_order_no": "ZHQQ_20260710_010",
    "status": "待验证",
    "category": "工单问题",
    "cls": "工单阻塞问题",
    "summary": "bbi岗普**",
    "details": "bbi岗普惠贴息报表**",
    "release_status": "未评审"
  },
  // 后半组：保留批量、应用配置与工单阻塞等不同问题形态。
  {
    "code": "NX20260713002",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "深圳事业群",
    "module": "信贷管理板块",
    "system": "新一代个人贷款",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-批量问题",
    "summary": "7月10新**",
    "details": "作业流名称：XCPL**",
    "release_status": "36"
  },
  {
    "code": "NX20260709019",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "深圳事业群",
    "module": "信贷管理板块",
    "system": "新一代个人贷款",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-应用配置",
    "summary": "个人贷款借**",
    "details": "个人贷款借据编号06**",
    "release_status": "36"
  },
  {
    "code": "NX20260709012",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "大数据中心",
    "module": "计划财务板块",
    "system": "大额风险暴露管理",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-批量问题-数据库问题",
    "summary": "0707-**",
    "details": "0707-0707大**",
    "release_status": "36"
  },
  {
    "code": "NX20260709011",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "交付事业部",
    "module": "计划财务板块",
    "system": "监管应用",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-批量问题-数据库问题",
    "summary": "0701-**",
    "details": "0701-0707监**",
    "release_status": "36"
  },
  {
    "code": "NX20260709004",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "深圳事业群",
    "module": "信贷管理板块",
    "system": "新一代个人贷款",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-批量问题",
    "summary": "7月8日新**",
    "details": "作业流名称：CRED**",
    "release_status": "36"
  },
  {
    "code": "NX20260708001",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "成都事业群",
    "module": "对私金融板块",
    "system": "P2-业务咨询领域",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-应用配置",
    "summary": "我的客户，**",
    "details": "\n【问题现象描述】进**",
    "release_status": "已摆渡"
  },
  {
    "code": "NX20260707008",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "厦门事业群",
    "module": "信贷管理板块",
    "system": "对公信贷-业务审批",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-应用配置",
    "summary": "对公信贷业**",
    "details": "1.展期，期限调整，**",
    "release_status": "已摆渡"
  },
  {
    "code": "NX20260707007",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "厦门事业群",
    "module": "信贷管理板块",
    "system": "授信管理-对公",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-应用配置",
    "summary": "授信管理对**",
    "details": "1.展期，期限调整，**",
    "release_status": "已摆渡"
  },
  {
    "code": "NX20260707004",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "厦门事业群",
    "module": "信贷管理板块",
    "system": "对公信贷-押品管理流程",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-批量问题",
    "summary": "7月6日对**",
    "details": "作业流名称：MPP_**",
    "release_status": "已摆渡"
  },
  {
    "code": "NX20260707003",
    "round": "投产",
    "urgency": "中",
    "handling_method": "换版",
    "business_group": "厦门事业群",
    "module": "风险管理板块",
    "system": "不良资产智能处置平台",
    "work_order_no": "36",
    "status": "待验证",
    "category": "金科技术",
    "cls": "金科-应用配置",
    "summary": "不良资产管**",
    "details": "1、修改对公催收-对**",
    "release_status": "已摆渡"
  }
];

/**
 * 读取仓库内固定问题快照，避免 mock 运行依赖本地问题表中的当前数据。
 * 快照必须保持 20 条且问题编号唯一，以便与工单建立稳定的一对一关联。
 */
function loadMockIssueSnapshot() {
  const issues = MOCK_ISSUE_SNAPSHOT.map((row, index) => normalizeIssue(row, index)).filter(Boolean);
  const codes = new Set(issues.map((issue) => issue.code));
  if (issues.length !== 20 || codes.size !== 20 || issues.some((issue) => issue.status !== '待验证')) {
    throw new Error('静态问题快照必须包含 20 条编号唯一的待验证问题');
  }
  return issues;
}
const REQ_TOPICS = [
  '客户查询页面优化', '规则配置能力改造', '对账任务处理优化', '报表统计口径调整',
  '消息通知模板维护', '批处理性能优化', '系统参数配置变更', '接口字段校验完善',
  '流程状态展示优化', '权限校验缺陷修复', '数据导入能力完善', '版本信息维护',
];
const DEV_ACTIONS = ['接口改造', '数据迁移', '规则配置', '页面重构', '批处理优化', '报文适配', '性能调优', '缺陷修复'];

// ---------------------------------------------------------------------------
// 业务参与方机构（用于实施方/部门口径）
// ---------------------------------------------------------------------------
const IMPL_ORGS = ['上海事业群', '北京事业群', '成都事业群', '深圳事业群', '武汉事业群', '厦门事业群', '大数据中心', '交付事业部', '基础技术中心'];
const ANALYSIS_WORKLOADS = ['1 人日', '2 人日', '3 人日', '5 人日', '8 人日'];

function registrationTime(date, index) {
  const hour = 8 + (index % 9);
  const minute = (index * 17) % 60;
  return `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// 清空业务/人员数据（保留字典、系统、角色、权限、超级管理员、仪表盘及全部流程配置）。
async function wipe() {
  const tables = [
    'release_signoff', 'release_system', 'release_task', 'release_apply_reference', 'release_apply',
    'test_task', 'dev_task', 'requirement', 'ticket', 'issue',
    'attachment', 'audit_log', 'saved_filter', 'login_fail_tracker',
  ];
  for (const t of tables) await run(`DELETE FROM ${t}`);
  // 公共内容填写值随演示业务数据重置；内置字段、业务组件与分区元数据由 seed 保留。
  await run('DELETE FROM stage_field_value');
  await run('DELETE FROM content_config_revision');
  // 输入项、分区、状态规则、交付件及模板都是系统设置配置，不属于 Mock 业务数据。
  // 不能按“是否内置”删除，否则自定义交付件或扩展字段会在重建后丢失。
  // 删除除引导超管(admin)外的全部演示人员，保证可重复执行；user_role 随级联删除。
  await run('DELETE FROM user WHERE phone <> ?', config.superAdmin.phone);
  // release_point 被需求/投产申请引用，需在其后清空
  await run('DELETE FROM release_point');
}

/**
 * 为演示环境建立公共交付件凭证样例。
 * Mock 只使用现有内置交付件，不能新增定义、规则或模板，从而保持系统设置配置不变。
 */
async function seedStageDeliverableDemo() {
  const reviewer = await get('SELECT id, name, phone FROM user WHERE status = ? ORDER BY id LIMIT 1', '启用');
  const applies = await all('SELECT id FROM release_apply ORDER BY id LIMIT 6');
  const designDocument = await get(`SELECT id, label FROM deliverable_definition
    WHERE scope_key = ? AND deliverable_key = ? AND deleted_at IS NULL`, 'dev', 'builtin_1');
  const builtinApplyProof = await get(`SELECT id, label FROM deliverable_definition
    WHERE scope_key = ? AND deliverable_key = ? AND deleted_at IS NULL`, 'release_apply', 'builtin_1');
  const demoDev = await get('SELECT id FROM dev_task WHERE status <> ? ORDER BY id LIMIT 1', '开发完成');
  if (demoDev && designDocument) await run(`INSERT INTO attachment (entity_type, entity_id, field_key, kind, path_text, deliverable_id, uploader)
    VALUES (?,?,?,?,?,?,?)`, 'dev', demoDev.id, designDocument.label, 'path', '/mock/design-document.md', designDocument.id, reviewer?.name || '系统初始化');
  const demoApply = applies[0];
  if (demoApply && builtinApplyProof) await run(`INSERT INTO attachment (entity_type, entity_id, field_key, kind, filename, stored_path, size, deliverable_id, uploader)
    VALUES (?,?,?,?,?,?,?,?,?)`, 'release_apply', demoApply.id, builtinApplyProof.label, 'file', 'mock-ferry-proof.txt', 'mock/ferry-proof.txt', 128, builtinApplyProof.id, reviewer?.name || '系统初始化');
}

export async function runMock() {
  await runMigrations();
  await runSeed();
  const issuePool = loadMockIssueSnapshot();

  await tx(async () => {
    await wipe();

    // ----------------------------------------------------------------------
    // 1) 用户（按演示名单及多角色关系建号；密码由本地演示环境显式配置）
    // ----------------------------------------------------------------------
    const pwd = hashPassword(MOCK_ACCOUNT_PASSWORD);
    const roleId = {};
    for (const r of await all('SELECT id, code FROM role')) roleId[r.code] = r.id;
    const usersByRole = {}; // roleCode -> [name]
    for (const [phone, name, org, roleCodes] of USERS) {
      if (!Array.isArray(roleCodes) || !roleCodes.length) throw new Error(`未配置角色：${phone}`);
      for (const roleCode of roleCodes) {
        if (!roleId[roleCode]) throw new Error(`角色不存在：${roleCode}（手机号 ${phone}）`);
      }
      const isSuper = roleCodes.includes('超级管理员') ? 1 : 0;
      // wipe 会保留配置中的引导超管；名单若包含同手机号（如 admin），则复用并刷新其资料/角色。
      const existing = await get('SELECT id FROM user WHERE phone = ?', phone);
      const userId = existing?.id || (await run(
        `INSERT INTO user (phone, name, org, password_hash, status, is_super, password_changed_at)
         VALUES (?,?,?,?,?,?,datetime('now','localtime'))`,
        phone, name, org, pwd, '启用', isSuper,
      )).lastInsertRowid;
      if (existing) {
        await run(
          `UPDATE user
              SET name = ?, org = ?, password_hash = ?, status = ?, is_super = ?,
                  password_changed_at = datetime('now','localtime'), updated_at = datetime('now','localtime')
            WHERE id = ?`,
          name, org, pwd, '启用', isSuper, userId,
        );
        await run('DELETE FROM user_role WHERE user_id = ?', userId);
      }
      for (const roleCode of roleCodes) {
        await run('INSERT INTO user_role (user_id, role_id) VALUES (?,?)', userId, roleId[roleCode]);
        (usersByRole[roleCode] ||= []).push(name);
      }
    }
    // 按角色取一名人员；该角色无人时回退到任意可用人员，保证字段不为空
    const anyUser = USERS[0][1];
    const pickUser = (code) => {
      const arr = usersByRole[code];
      return arr && arr.length ? pick(arr) : anyUser;
    };

    // ----------------------------------------------------------------------
    // 2) 投产点
    // ----------------------------------------------------------------------
    const rpIds = [];
    for (let i = 0; i < RELEASE_POINTS.length; i++) {
      const [date, vt, def, arch] = RELEASE_POINTS[i];
      const res = await run(
        `INSERT INTO release_point (release_date, version_type, remark, is_default, is_archived)
         VALUES (?,?,?,?,?)`,
        date, vt, `${date.slice(0, 4)}年${date.slice(4, 6)}月投产窗口`, def, arch,
      );
      rpIds.push({ id: res.lastInsertRowid, date });
    }
    await run(
      `INSERT INTO release_point (release_date, version_type, remark, is_default, is_archived)
       VALUES (?,?,?,?,?)`,
      '投产点待定', '常规版本', '系统内置投产点', 0, 0,
    );

    // 系统主数据
    const systems = await all('SELECT sys_code, sys_name, org, sector FROM system');
    const sysByCode = {};
    for (const s of systems) sysByCode[s.sys_code] = s;
    const sysCodes = systems.map((s) => s.sys_code);
    const implementationOrgs = (await all('SELECT attr_value FROM dict_item WHERE category = ? ORDER BY sort, id', 'org'))
      .map((row) => row.attr_value)
      .filter(Boolean);
    const activePeople = (await all('SELECT name FROM user WHERE status = ? ORDER BY id', '启用'))
      .map((row) => row.name)
      .filter(Boolean);
    if (!implementationOrgs.length || !activePeople.length) {
      throw new Error('Mock 数据缺少实施机构字典或启用人员，无法生成需求/工单分析字段');
    }

    // ----------------------------------------------------------------------
    // 3) 需求画像分配（共 120 个）
    //    profiles: released / approving / advanced / nftsec / sit / dev / analysis / register
    // ----------------------------------------------------------------------
    const specs = [];
    const addSpec = (profile, count, winRange) => {
      for (let i = 0; i < count; i++) {
        const w = winRange[i % winRange.length];
        specs.push({ profile, rp: rpIds[w] });
      }
    };
    addSpec('released', 10, [0, 1, 2, 3, 4]);        // 已上线/评审同意
    addSpec('approving', 12, [4, 5]);                // 投产审批进行中（待评审/拒绝/应急/撤销）
    addSpec('advanced', 38, [3, 4, 5, 6, 7]);        // 完成开发+SIT，未发起投产审批
    addSpec('nftsec', 12, [4, 5, 6, 7]);             // 完成开发+SIT，需 NFT/SEC（部分完成）
    addSpec('sit', 12, [5, 6, 7, 8]);                // 开发完成，SIT 进行中
    addSpec('dev', 18, [6, 7, 8, 9]);                // 开发进行中
    addSpec('analysis', 8, [9, 10, 11]);             // 需求分析
    addSpec('register', 10, [10, 11]);               // 需求登记

    // 终态需求（分析完成）：released/approving/advanced/nftsec/sit/dev 均为分析完成
    const REQ_DONE = new Set(['released', 'approving', 'advanced', 'nftsec', 'sit', 'dev']);

    const reqs = []; // { code, spec, main_systems, rp, ... }
    let devCount = 0;
    let testCount = 0;

    for (const [reqIndex, spec] of specs.entries()) {
      const main = pickN(sysCodes, 1 + Math.floor(rng() * 2));
      const collabDev = rng() < 0.3 ? pickN(sysCodes.filter((c) => !main.includes(c)), 1) : [];
      const collabTest = rng() < 0.25 ? pickN(sysCodes.filter((c) => !main.includes(c)), 1) : [];
      const code = await generateRequirementCode(spec.rp.date);
      const topic = pick(REQ_TOPICS);
      const reqStatus = REQ_DONE.has(spec.profile) ? '分析完成'
        : (spec.profile === 'analysis' ? '需求分析' : '需求登记');
      const proposeTime = shift(ymd(spec.rp.date), -60 - Math.floor(rng() * 60));
      const issueNo = `OA${proposeTime.replaceAll('-', '')}${String(reqIndex + 1).padStart(3, '0')}`;
      const implementationOrg = implementationOrgs[reqIndex % implementationOrgs.length];
      const receiver = activePeople[(reqIndex * 7) % activePeople.length];
      const workload = ANALYSIS_WORKLOADS[reqIndex % ANALYSIS_WORKLOADS.length];
      const res = await run(
        `INSERT INTO requirement
           (req_code, title, summary, status, req_type, propose_dept, proposer, yn_owner, jk_owner,
            propose_time, main_systems, collab_dev_systems, collab_test_systems,
            release_point_id, issue_no, implementation_org, receiver, workload, registrar, register_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        code, `${sysByCode[main[0]].sys_name}${topic}`,
        `针对${sysByCode[main[0]].sys_name}的${topic}，覆盖相关业务规则与接口改造，确保${spec.rp.date.slice(0, 6)}投产窗口如期交付。`,
        reqStatus,
        pick(['新增需求', '已有功能的需求变更', '缺陷修复', '紧急变更']),
        pick(['云南农信', '智能云事业部', '大数据中心']),
        JSON.stringify([pickUser('农信业务')]), pickUser('农信业务'), pickUser('金科业务'),
        proposeTime,
        JSON.stringify(main), JSON.stringify(collabDev), JSON.stringify(collabTest),
        spec.rp.id, issueNo, implementationOrg, receiver, workload,
        pickUser('农信业务'), registrationTime(shift(proposeTime, 2), reqIndex),
      );
      const reqId = res.lastInsertRowid;
      await auditCreate('requirement', reqId, code, '系统初始化');
      // 终态需求：需求说明书附件（路径）
      if (reqStatus === '分析完成') {
        await run(`INSERT INTO attachment (entity_type, entity_id, field_key, kind, path_text, uploader)
             VALUES ('requirement', ?, '需求说明书', 'path', ?, ?)`,
          reqId, `\\\\nas\\需求\\${code}\\需求说明书.docx`, pickUser('农信业务'));
      }
      reqs.push({ id: reqId, code, spec, main, rp: spec.rp });
    }

    // ----------------------------------------------------------------------
    // 4) 开发任务（≥200）
    // ----------------------------------------------------------------------
    /** 创建一条开发任务 */
    async function makeDev(req, status, idx) {
      const impl = req.main[idx % req.main.length];
      const sys = sysByCode[impl];
      const window = ymd(req.rp.date);
      const isDone = status === '开发完成';
      const planStart = shift(window, -45);
      const planEnd = shift(window, -20);
      // 完成的任务带实际起止与偏差率；进行中的仅有实际开始
      const actualStart = shift(planStart, Math.floor(rng() * 4));
      const actualEnd = isDone ? shift(planEnd, Math.floor(rng() * 9) - 3) : null;
      const code = await generateDevTaskCode(req.code);
      const res = await run(
        `INSERT INTO dev_task
           (req_code, task_code, task_name, content, status, owner, impl_system, impl_org,
            plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        req.code, code, `${sys.sys_name}${pick(DEV_ACTIONS)}`,
        `${sys.sys_name}（${impl}）${pick(DEV_ACTIONS)}相关开发实施。`,
        status, pickUser(rng() < 0.5 ? '金科开发' : '农信开发'), impl, sys.org,
        planStart, planEnd, actualStart, actualEnd,
        isDone ? calcDeviation(planStart, planEnd, actualEnd) : null,
        pickUser('金科开发'), shift(planStart, -3),
      );
      const devId = res.lastInsertRowid;
      await auditCreate('dev', devId, code, '系统初始化');
      if (isDone) {
        await run(`INSERT INTO attachment (entity_type, entity_id, field_key, kind, path_text, uploader)
             VALUES ('dev', ?, ?, 'path', ?, ?)`,
          devId, pick(['概要设计', '详细设计', '代码走查', '单元测试报告']),
          `\\\\nas\\开发\\${code}\\设计文档.docx`, pickUser('金科开发'));
      }
      devCount++;
    }

    const DEV_INPROGRESS = ['开发设计', '开发实施', '单元测试'];
    for (const req of reqs) {
      const p = req.spec.profile;
      if (['released', 'approving', 'advanced', 'nftsec', 'sit'].includes(p)) {
        // 开发完成：2~3 个开发任务
        const n = 2 + (rng() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) await makeDev(req, '开发完成', i);
      } else if (p === 'dev') {
        // 开发进行中：1~2 个任务，状态随机分布在开发中各阶段
        const n = 1 + (rng() < 0.6 ? 1 : 0);
        for (let i = 0; i < n; i++) await makeDev(req, pick(DEV_INPROGRESS), i);
      }
      // analysis / register：暂无开发任务
    }

    // ----------------------------------------------------------------------
    // 5) 测试任务（SIT/UAT/NFT/SEC）
    // ----------------------------------------------------------------------
    const TEST_INPROGRESS = ['测试方案', '测试实施', '测试报告'];
    /** 创建一条测试任务 */
    async function makeTest(req, testType, status) {
      const impl = req.main[0];
      const sys = sysByCode[impl];
      const window = ymd(req.rp.date);
      const isDone = status === '测试完成';
      const planStart = shift(window, -18);
      const planEnd = shift(window, -5);
      const actualStart = shift(planStart, Math.floor(rng() * 3));
      const actualEnd = isDone ? shift(planEnd, Math.floor(rng() * 7) - 2) : null;
      const code = await generateTestTaskCode(testType, req.code);
      const ownerRole = testType === 'UAT' ? (rng() < 0.5 ? '农信业务' : '金科业务')
        : (rng() < 0.5 ? '金科测试' : '农信测试');
      const res = await run(
        `INSERT INTO test_task
           (req_code, task_code, task_name, test_type, status, owner, impl_system, impl_org, impl_agency,
            plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        req.code, code, `${sys.sys_name}${testType}测试`, testType, status,
        pickUser(ownerRole), impl, sys.org, pick(IMPL_ORGS),
        planStart, planEnd, actualStart, actualEnd,
        isDone ? calcDeviation(planStart, planEnd, actualEnd) : null,
        pickUser('测试管理'), shift(planStart, -2),
      );
      const testId = res.lastInsertRowid;
      await auditCreate('test', testId, code, '系统初始化');
      if (isDone) {
        await run(`INSERT INTO attachment (entity_type, entity_id, field_key, kind, path_text, uploader)
             VALUES ('test', ?, ?, 'path', ?, ?)`,
          testId, pick(['测试方案', '测试报告']), `\\\\nas\\测试\\${code}\\测试报告.docx`, pickUser('金科测试'));
      }
      testCount++;
    }

    for (const req of reqs) {
      const p = req.spec.profile;
      if (['released', 'approving', 'advanced', 'nftsec'].includes(p)) {
        await makeTest(req, 'SIT', '测试完成');             // 应用组装测试完成
      } else if (p === 'sit') {
        await makeTest(req, 'SIT', pick(TEST_INPROGRESS));  // SIT 进行中
      }
      // UAT：投产审批相关 + 部分 advanced 需求
      if (['released', 'approving'].includes(p)) {
        await makeTest(req, 'UAT', '测试完成');
      } else if (p === 'advanced' && rng() < 0.3) {
        await makeTest(req, 'UAT', pick([...TEST_INPROGRESS, '测试完成']));
      }
      // NFT/SEC：10% 需求，部分完成部分进行中
      if (p === 'nftsec') {
        await makeTest(req, 'NFT', rng() < 0.5 ? '测试完成' : pick(TEST_INPROGRESS));
        await makeTest(req, 'SEC', rng() < 0.5 ? '测试完成' : pick(TEST_INPROGRESS));
      }
    }

    // ----------------------------------------------------------------------
    // 6) 投产审批（会签）—— 22 个需求覆盖全部评审状态
    // ----------------------------------------------------------------------
    const signRoles = await all('SELECT id, name FROM role WHERE is_signoff_role = 1 ORDER BY id');
    /** 创建投产任务 + 9 个会签项；signedPlan 决定每个会签项结果 */
    async function makeReleaseTask(code, entityType, releasePointId, relStatus, reviewStatus, signResults, signedDate) {
      if (await get(
        'SELECT id FROM release_task WHERE req_code = ? AND release_point_id = ?',
        code, releasePointId,
      )) return null;
      const res = await run(
        `INSERT INTO release_task (req_code, release_point_id, entity_type, status, review_status, owner, registrar, register_time)
         VALUES (?,?,?,?,?,?,?,?)`,
        code, releasePointId, entityType, relStatus, reviewStatus, pickUser(rng() < 0.5 ? '金科运维' : '农信运维'),
        pickUser('项目管理'), signedDate,
      );
      const rtId = res.lastInsertRowid;
      await auditCreate('release', rtId, code, '系统初始化');
      for (const [i, role] of signRoles.entries()) {
        const result = signResults[i] || '未签署';
        const signer = result === '未签署' ? null : pickUser(role.name);
        const signed = result !== '未签署';
        const conclusion = result === '已驳回' ? '存在投产风险，需补充回退方案' : (result === '已签署' ? '同意投产' : null);
        const signerUser = signed ? await get('SELECT id FROM user WHERE name = ?', signer) : null;
        await run(
          `INSERT INTO release_signoff
             (release_task_id, role_id, role_name, signer_user_id, signer_name, result, conclusion, sign_time)
           VALUES (?,?,?,?,?,?,?,?)`,
          rtId, role.id, role.name,
          signerUser?.id || null,
          signed ? signer : null, result,
          conclusion,
          signed ? `${signedDate} 10:00:00` : null,
        );
        if (signed) {
          await auditUpdate('release', rtId, role.name, signer,
            { result: '未签署', conclusion: null },
            { result, conclusion },
            {
              result: `会签-${role.name}-签署状态`,
              conclusion: `会签-${role.name}-签署意见`,
            });
        }
      }
      return rtId;
    }

    const allSigned = signRoles.map(() => '已签署');
    const approvalReqs = reqs.filter((r) => ['released', 'approving'].includes(r.spec.profile));
    let ai = 0;
    for (const req of approvalReqs) {
      const window = ymd(req.rp.date);
      const signedDate = shift(window, -3);
      if (req.spec.profile === 'released') {
        // 评审同意：前 8 个已投产(已上线)，后 2 个评审通过待投产
        const relStatus = ai < 8 ? '已投产' : '待投产';
        await makeReleaseTask(req.code, 'requirement', req.rp.id, relStatus, '评审同意', allSigned, signedDate);
      } else {
        // approving 12 个：5 待评审 / 3 评审拒绝 / 2 应急审批 / 2 评审撤销
        const k = approvalReqs.filter((r) => r.spec.profile === 'released').length; // 偏移
        const j = ai - k;
        let reviewStatus; let results;
        if (j < 5) {
          reviewStatus = '待评审';
          results = signRoles.map((_, i) => (i < 3 ? '已签署' : '未签署'));
        } else if (j < 8) {
          reviewStatus = '评审拒绝';
          results = signRoles.map((_, i) => (i === 2 ? '已驳回' : (i < 2 ? '已签署' : '未签署')));
        } else if (j < 10) {
          reviewStatus = '应急审批'; // 手动状态，不被自动逻辑覆盖
          results = signRoles.map((_, i) => (i < 2 ? '已签署' : '未签署'));
        } else {
          reviewStatus = '评审撤销'; // 手动状态
          results = signRoles.map(() => '未签署');
        }
        await makeReleaseTask(req.code, 'requirement', req.rp.id, '待评审', reviewStatus, results, signedDate);
      }
      ai++;
    }

    // ----------------------------------------------------------------------
    // 7) 问题清单（仅使用虚构演示样例）
    // ----------------------------------------------------------------------
    const HANDLING = ['版本修复', '热修补丁', '配置调整', '数据修复'];
    const ROOT_CAUSES = [
      '边界场景处理逻辑缺失，未对极值进行校验',
      '接口参数映射错误，源字段与目标字段对应关系有误',
      '批处理任务并发控制缺失，导致重复写入',
      '配置项未同步至生产环境，开发与生产参数不一致',
      '第三方数据报送口径变更，本地逻辑未同步更新',
    ];
    const SOLUTIONS = [
      '修正处理逻辑并补充单元测试覆盖边界场景',
      '修复字段映射关系，完善接口联调测试',
      '增加幂等控制机制，确保批处理唯一性',
      '同步配置项至生产环境并建立配置检查机制',
      '对齐最新报送口径，完成回归测试后上线',
    ];
    for (let i = 0; i < issuePool.length; i++) {
      const issue = issuePool[i];
      const isSolved = ['已解决', '待验证'].includes(issue.status);
      const createDate = shift('2026-06-01', i);
      await run(
        `INSERT INTO issue
           (issue_code, round, urgency, handling_method, business_group, module, system, work_order_no,
            create_time, plan_resolve_time, status, category, detailed_classification, summary, details,
            tracker_name, tracker_org, reporter_name, reporter_org, handler_name, handler_org,
            is_major, is_common, root_cause, solution, release_status, synced_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        issue.code, issue.round, issue.urgency, issue.handling_method || pick(HANDLING),
        issue.business_group, issue.module, issue.system, issue.work_order_no,
        createDate, shift(createDate, 14 + (i % 7)),
        issue.status, issue.category, issue.cls,
        issue.summary,
        issue.details,
        issue.tracker_name || pickUser('机构负责人'), issue.tracker_org,
        issue.reporter_name || pickUser('农信业务'), issue.reporter_org,
        issue.handler_name || pickUser('金科开发'), issue.handler_org,
        issue.urgency === '紧急' ? 1 : 0,
        i % 5 === 0 ? 1 : 0,
        issue.root_cause || (isSolved ? ROOT_CAUSES[i % ROOT_CAUSES.length] : null),
        issue.solution || (isSolved ? SOLUTIONS[i % SOLUTIONS.length] : null),
        issue.release_status || (isSolved ? '待发版' : null),
        issue.synced_at,
      );
    }

    // ----------------------------------------------------------------------
    // 8) 工单分析（20 条，与静态问题快照按编号一对一关联）
    // ----------------------------------------------------------------------
    const ticketIssuePool = issuePool;
    const TICKET_PROFILE_PLAN = [
      'released', 'released',
      'sit', 'sit', 'sit', 'sit', 'sit',
      'dev', 'dev', 'dev', 'dev', 'dev',
      'analysis', 'analysis', 'analysis', 'analysis',
      'register', 'register', 'register', 'register',
    ];
    const TICKET_STATUS = {
      released: '分析完成', sit: '分析完成', dev: '分析完成',
      analysis: '工单分析', register: '工单登记',
    };
    const TICKET_RELEASE_POINT_INDEX = {
      released: [3, 4],
      sit: [5, 6],
      dev: [6, 7],
      analysis: [7, 8],
      register: [8, 9],
    };
    function issueSystemCode(issue) {
      const raw = String(issue?.system || '').trim();
      if (raw && sysByCode[raw]) return raw;
      const byName = raw ? systems.find((s) => s.sys_name === raw) : null;
      return byName?.sys_code || pick(sysCodes);
    }

    const tickets = [];
    for (let i = 0; i < ticketIssuePool.length; i++) {
      const linkedIssue = ticketIssuePool[i];
      const profile = TICKET_PROFILE_PLAN[i % TICKET_PROFILE_PLAN.length];
      const winList = TICKET_RELEASE_POINT_INDEX[profile];
      const tspec = {
        profile,
        rp: rpIds[winList[i % winList.length]],
        type: linkedIssue.cls || '工单阻塞问题',
        isAccounting: i % 7 === 0 ? '是' : '否',
      };
      const code = linkedIssue.code;
      const tStatus = TICKET_STATUS[tspec.profile];
      const main = [issueSystemCode(linkedIssue)];
      const proposeTime = shift(ymd(tspec.rp.date), -40 - Math.floor(rng() * 20));
      const implementationOrg = implementationOrgs[(i + 5) % implementationOrgs.length];
      const receiver = activePeople[(i * 7 + 3) % activePeople.length];
      const workload = ANALYSIS_WORKLOADS[(i + 2) % ANALYSIS_WORKLOADS.length];
      await run(
        `INSERT INTO ticket
           (ticket_code, title, summary, status, ticket_type, is_accounting,
            propose_dept, proposer, yn_owner, jk_owner, propose_time,
            main_systems, collab_dev_systems, collab_test_systems,
            release_point_id, issue_no, implementation_org, receiver, workload, registrar, register_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        code,
        linkedIssue.summary.slice(0, 50).trimEnd() + (linkedIssue.summary.length > 50 ? '…' : ''),
        linkedIssue.details || linkedIssue.summary,
        tStatus, tspec.type, tspec.isAccounting,
        '云南农信', JSON.stringify([pickUser('农信业务')]),
        pickUser('农信业务'), pickUser('金科业务'),
        proposeTime,
        JSON.stringify(main), JSON.stringify([]), JSON.stringify([]),
        tspec.rp.id, linkedIssue.code, implementationOrg, receiver, workload,
        pickUser('农信业务'), registrationTime(shift(proposeTime, 1), i),
      );
      const ticketId = (await get('SELECT id FROM ticket WHERE ticket_code = ?', code)).id;
      await auditCreate('ticket', ticketId, code, '系统初始化');
      tickets.push({ id: ticketId, code, spec: tspec, main, rp: tspec.rp, issueCode: linkedIssue.code });

      // 开发任务（released/sit/dev 各有）
      if (['released', 'sit', 'dev'].includes(tspec.profile)) {
        const devStatus = tspec.profile === 'dev' ? pick(['开发设计', '开发实施', '单元测试']) : '开发完成';
        const devCode = await generateDevTaskCode(code);
        const window = ymd(tspec.rp.date);
        const planStart = shift(window, -40);
        const planEnd = shift(window, -18);
        const actualStart = shift(planStart, Math.floor(rng() * 3));
        const actualEnd = devStatus === '开发完成' ? shift(planEnd, Math.floor(rng() * 6) - 2) : null;
        const sys = sysByCode[main[0]];
        await run(
          `INSERT INTO dev_task
             (req_code, task_code, task_name, content, status, owner, impl_system, impl_org,
              plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          code, devCode,
          `${sys.sys_name}${linkedIssue.cls}修复`,
          `${sys.sys_name}（${main[0]}）${linkedIssue.cls}：${linkedIssue.summary.slice(0, 40)}相关修复实施。`,
          devStatus, pickUser('金科开发'), main[0], sys.org,
          planStart, planEnd, actualStart, actualEnd,
          devStatus === '开发完成' ? calcDeviation(planStart, planEnd, actualEnd) : null,
          pickUser('金科开发'), shift(planStart, -2),
        );
        devCount++;
      }

      // 测试任务（released/sit）
      if (['released', 'sit'].includes(tspec.profile)) {
        const testStatus = tspec.profile === 'released' ? '测试完成' : pick(['测试方案', '测试实施']);
        const testCode = await generateTestTaskCode('SIT', code);
        const window = ymd(tspec.rp.date);
        const planStart = shift(window, -16);
        const planEnd = shift(window, -4);
        const actualStart = shift(planStart, Math.floor(rng() * 3));
        const actualEnd = testStatus === '测试完成' ? shift(planEnd, Math.floor(rng() * 5) - 1) : null;
        const sys = sysByCode[main[0]];
        await run(
          `INSERT INTO test_task
             (req_code, task_code, task_name, test_type, status, owner, impl_system, impl_org, impl_agency,
              plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          code, testCode,
          `${sys.sys_name}工单问题修复SIT验证`,
          'SIT', testStatus,
          pickUser('金科测试'), main[0], sys.org, pick(IMPL_ORGS),
          planStart, planEnd, actualStart, actualEnd,
          testStatus === '测试完成' ? calcDeviation(planStart, planEnd, actualEnd) : null,
          pickUser('测试管理'), shift(planStart, -1),
        );
        testCount++;
      }

      // 投产审批（released）
      if (tspec.profile === 'released') {
        await makeReleaseTask(code, 'ticket', tspec.rp.id, '已投产', '评审同意', allSigned, shift(ymd(tspec.rp.date), -3));
      }
    }

    // ----------------------------------------------------------------------
    // 9) 投产申请——仅引用需求/工单编号；不模拟纯问题投产场景
    // ----------------------------------------------------------------------
    const ARTIFACTS = ['镜像制品', '二进制制品', '介质库文件', '无制品'];
    const FERRY = ['未摆渡', '待发送', '已摆渡', '摆渡失败'];
    /** 评审状态派生（取最弱）——与 release-apply 路由一致 */
    const REVIEW_RANK = { 评审拒绝: 0, 评审撤销: 1, 待评审: 2, 应急审批: 3, 评审同意: 4 };
    async function deriveReview(refCodes, releasePointId) {
      let weakest = null; let weakestRank = Infinity;
      for (const c of refCodes) {
        const rt = await get(
          'SELECT review_status FROM release_task WHERE req_code = ? AND release_point_id = ?',
          c, releasePointId,
        );
        if (!rt?.review_status) continue;
        const rank = REVIEW_RANK[rt.review_status] ?? 2;
        if (rank < weakestRank) { weakestRank = rank; weakest = rt.review_status; }
      }
      return weakest;
    }
    /** 生成 1~2 组交付制品 */
    function makeUnits(sysCode) {
      const n = 1 + (rng() < 0.4 ? 1 : 0);
      const out = [];
      for (let i = 0; i < n; i++) {
        const at = pick(ARTIFACTS);
        out.push({
          artifact_type: at,
          delivery_unit: at === '无制品'
            ? `${sysCode}-no-artifact`
            : `${sysCode}-${pick(['app', 'svc', 'batch'])}-v${2 + i}.${Math.floor(rng() * 9)}.0`,
          new_version: `V${2 + i}.${Math.floor(rng() * 9)}.${Math.floor(rng() * 9)}`,
          ferry_status: pick(FERRY),
        });
      }
      return out;
    }
    async function makeApply(refCodes, rp, changeSys) {
      const refs = uniq(refCodes);
      const code = await generateReleaseApplyCode(rp.date.slice(0, 6));
      const review = await deriveReview(refs, rp.id);
      const sys = sysByCode[changeSys] || pick(systems);
      const sysCode = sysByCode[changeSys] ? changeSys : sys.sys_code;
      const result = await run(
        `INSERT INTO release_apply
           (change_code, change_content, impact_scope, change_system, impl_org, delivery_units,
            ref_codes, review_status, out_dept, deploy_dept, release_point_id, registrar, register_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        code,
        `${sys.sys_name}${pick(DEV_ACTIONS)}投产变更，关联：${refs.join('、')}`,
        `影响${sys.sys_name}及其上下游联机交易，变更窗口内需停机约 30 分钟`,
        sysCode, sys.org, JSON.stringify(makeUnits(sysCode)),
        JSON.stringify(refs), review,
        sys.out_dept || '建信金科', sys.deploy_dept || sys.org, rp.id, pickUser('配置管理员'), ymd(shift(ymd(rp.date), -2)),
      );
      const id = Number(result.lastInsertRowid);
      // 投产审批与版本概览读取索引读模型，不直接展开 ref_codes JSON；Mock 必须与正式写接口同步维护。
      for (const refCode of refs) {
        await run(
          'INSERT INTO release_apply_reference (release_apply_id, ref_code, release_point_id) VALUES (?,?,?)',
          id, refCode, rp.id,
        );
      }
      await auditCreate('release_apply', id, code, '系统初始化');
    }

    // 22 个投产审批需求各一个投产申请。
    for (const [idx, req] of approvalReqs.entries()) {
      await makeApply([req.code], req.rp, req.main[0]);
    }

    // 工单也通过投产申请进入审批清单；其中 released 工单已有审批，其他工单用于验证未发起/懒创建。
    // ticket.code 即问题编号，但在工作项表中按工单识别。
    const releaseTickets = tickets.filter((t) => ['released', 'sit', 'dev'].includes(t.spec.profile));
    for (const ticket of releaseTickets) {
      await makeApply([ticket.code], ticket.rp, ticket.main[0]);
    }

    // 另增 6 个 advanced 需求投产申请，丰富未发起审批的需求样例。
    const advancedReqs = reqs.filter((r) => r.spec.profile === 'advanced');
    for (let i = 0; i < 6; i++) {
      const req = advancedReqs[i];
      if (!req) continue;
      await makeApply([req.code], req.rp, req.main[0]);
    }

    // 仅保留公共交付件凭证样例；扩展字段由管理员在配置页自行创建。
    await seedStageDeliverableDemo();

    // ----------------------------------------------------------------------
    // 输出统计
    // ----------------------------------------------------------------------
    const applyRows = await all('SELECT ref_codes FROM release_apply');
    let requirementApplyRefs = 0;
    let ticketApplyRefs = 0;
    for (const row of applyRows) {
      for (const code of parseJsonArray(row.ref_codes)) {
        if (await get('SELECT 1 FROM requirement WHERE req_code = ?', code)) requirementApplyRefs++;
        else if (await get('SELECT 1 FROM ticket WHERE ticket_code = ?', code)) ticketApplyRefs++;
      }
    }

    const analysisMockFields = ['issue_no', 'implementation_org', 'receiver', 'workload', 'registrar', 'register_time'];
    for (const [table, codeColumn] of [['requirement', 'req_code'], ['ticket', 'ticket_code']]) {
      const rows = await all(`SELECT ${codeColumn} AS code, ${analysisMockFields.join(', ')} FROM ${table}`);
      const invalid = rows.find((row) => (
        analysisMockFields.some((field) => !String(row[field] || '').trim())
        || !implementationOrgs.includes(row.implementation_org)
        || !activePeople.includes(row.receiver)
        || /[\r\n]/.test(row.workload)
        || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(row.register_time)
      ));
      if (invalid) throw new Error(`Mock ${table} 分析字段未完整填充：${invalid.code}`);
    }

    const stat = {
      用户: (await get('SELECT COUNT(*) c FROM user')).c,
      会签角色: signRoles.map((r) => r.name).join('、'),
      投产点: (await get('SELECT COUNT(*) c FROM release_point')).c,
      需求: (await get('SELECT COUNT(*) c FROM requirement')).c,
      分析完成: (await get("SELECT COUNT(*) c FROM requirement WHERE status='分析完成'")).c,
      工单: (await get('SELECT COUNT(*) c FROM ticket')).c,
      开发任务: (await get('SELECT COUNT(*) c FROM dev_task')).c,
      测试任务: (await get('SELECT COUNT(*) c FROM test_task')).c,
      'SIT(应用组装)完成': (await get("SELECT COUNT(*) c FROM test_task WHERE test_type='SIT' AND status='测试完成'")).c,
      'NFT/SEC任务': (await get("SELECT COUNT(*) c FROM test_task WHERE test_type IN ('NFT','SEC')")).c,
      投产审批: (await get('SELECT COUNT(*) c FROM release_task')).c,
      投产审批实体分布: (await all("SELECT entity_type, COUNT(*) c FROM release_task GROUP BY entity_type"))
        .map((r) => `${r.entity_type}:${r.c}`).join('、'),
      会签记录: (await get('SELECT COUNT(*) c FROM release_signoff')).c,
      问题: (await get('SELECT COUNT(*) c FROM issue')).c,
      问题数据来源: '仓库内静态待验证问题快照（20 条）',
      投产申请: (await get('SELECT COUNT(*) c FROM release_apply')).c,
      投产申请需求引用: requirementApplyRefs,
      投产申请工单引用: ticketApplyRefs,
      评审状态分布: (await all("SELECT review_status, COUNT(*) c FROM release_task GROUP BY review_status"))
        .map((r) => `${r.review_status}:${r.c}`).join('、'),
    };
    logger.info('[模拟数据] 生成完成：');
    for (const [k, v] of Object.entries(stat)) logger.info(`  ${k}：${v}`);
  });
}

// 兼容从仓库根目录（node server/scripts/mock-data.js）和 server 目录直接执行。
if (process.argv[1] && path.basename(process.argv[1]) === 'mock-data.js') {
  try {
    await runMock();
    db.exec?.('PRAGMA wal_checkpoint(TRUNCATE);');
    logger.info('[模拟数据] 已写入数据库并完成检查点。');
  } finally {
    await closeDb();
  }
}

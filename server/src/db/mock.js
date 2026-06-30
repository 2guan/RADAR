/**
 * 文件：db/mock.js
 * 用途：生成可演示/可验证的全链路测试模拟数据。先确保库表与基础种子（角色/字典/系统/会签配置）就绪，
 *       再清空现有业务与人员数据，灌入：20+ 用户、12 个投产点、120 个需求、200+ 开发任务、
 *       SIT/UAT/NFT/SEC 测试任务、投产审批（会签）、投产申请、问题清单及关联关系与过程留痕。
 * 作者：hengguan
 * 说明：本脚本独立运行（node src/db/mock.js），用于重置演示环境。会删除除超级管理员外的全部业务数据，请谨慎执行。
 *       数据特征：
 *         - 60% 需求完成开发+应用组装测试(SIT)；其中 ~30% 已发起/完成投产审批（评审状态覆盖全部取值）；
 *         - 10% 需求需进行非功能(NFT)/安全(SEC)测试，部分完成、部分进行中；
 *         - ≥20 个投产申请关联了问题编号；编号、偏差率、终态附件等均按平台规则生成，便于逐项验证。
 */

import { db, get, all, run, tx } from './index.js';
import { config } from '../config.js';
import { runMigrations } from './migrate.js';
import { runSeed } from './seed.js';
import { hashPassword } from '../lib/password.js';
import { parseJsonArray } from '../lib/json.js';
import { calcDeviation } from '../lib/deviation.js';
import {
  genRequirementCode, genDevCode, genTestCode, genReleaseApplyCode, genTicketCode,
} from '../lib/code-gen.js';
import { auditCreate, auditUpdate } from '../lib/audit.js';

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
const pad3 = (n) => String(n).padStart(3, '0');
/** 在 base 日期(YYYY-MM-DD)上偏移 days 天，返回 YYYY-MM-DD */
function shift(base, days) {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
/** YYYYMMDD -> YYYY-MM-DD */
const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

// ---------------------------------------------------------------------------
// 人员清单（真实导入名单）：[手机号, 姓名, 角色标识, 所属机构]。
// 除既有 admin 超级管理员外的全部人员；其中「超级管理员」角色以 is_super=1 建号。
// ---------------------------------------------------------------------------
const USERS = [
  ['18918688193', '李通', '测试负责人', '交付事业部'],
  ['18687112956', '谢恩宏', '测试负责人', '云南农信'],
  ['15108711537', '李昶霖', '农信运维', '云南农信'],
  ['13881954314', '李彪', '金科测试', '交付事业部'],
  ['18918688029', '郭劲松', '项目负责人', '交付事业部'],
  ['13811931599', '詹同宇', '金科开发', '交付事业部'],
  ['18652954495', '杨锡明', '项目负责人', '交付事业部'],
  ['18959228330', '李河杰', '金科开发', '大数据中心'],
  ['18965810392', '张京', '金科开发', '厦门事业群'],
  ['15810107688', '王凯', '金科运维', '交付事业部'],
  ['18910053279', '王卫东', '配置负责人', '交付事业部'],
  ['18313983383', '王冲生', '农信运维', '云南农信'],
  ['13708487153', '鲁志兵', '机构负责人', '云南农信'],
  ['18820995661', '胡霆', '机构负责人', '深圳事业群'],
  ['18918689016', '胡伟钢', '机构负责人', '上海事业群'],
  ['13706969866', '吴刚', '项目负责人', '交付事业部'],
  ['18918688309', '忻健', '测试负责人', '交付事业部'],
  ['13574870755', '彭景华', '金科业务', '交付事业部'],
  ['15037691731', '肖乃峰', '安全负责人', '交付事业部'],
  ['18601250615', '薛潇', '超级管理员', '交付事业部'],
  ['13308236171', '曹志学', '管理员', '成都事业群'],
  ['15818723430', '王晓坤', '管理员', '交付事业部'],
  ['18261598684', '盛赛荣', '架构负责人', '交付事业部'],
  ['13888920605', '陈旭', '农信测试', '云南农信'],
  ['18787458157', '陈洁', '农信测试', '云南农信'],
  ['15087190584', '王鲁', '农信业务', '云南农信'],
  ['15808709229', '贺婵', '农信业务', '云南农信'],
  ['15126311088', '崔晓林', '农信业务', '云南农信'],
  ['13668758491', '孙雪峰', '农信业务', '云南农信'],
  ['18918688502', '杨青', '金科业务', '交付事业部'],
];

// 实际从 PAMS 同步的问题数据（含工单号，用于 issue 表与 release_apply 关联）
const REAL_ISSUES = [
  { code: 'NX20260626010', system: 'W10120', cls: '工单阻塞问题', status: '提出',   work_order_no: 'ZHQQ_202606025_004', urgency: '高',   round: '第1轮', summary: '非现场审计系统临时结果表、结果表限定为100万条，达到100万条后系统不再继续查询存储符合条件的结果，针对农信客户数量大、交易流水量大的特点，该限制导致建模过程中符合条件的数据大量丢失、建模结果不准确。' },
  { code: 'NX20260626009', system: 'W10120', cls: '工单阻塞问题', status: '提出',   work_order_no: 'ZHQQ_202606025_003', urgency: '高',   round: '第1轮', summary: 'python建模实验室，to_sql操作页面显示成功，但结果表无数据问题。（5月27日向金科反馈该问题、6月8日组会讨论，至今未解决）' },
  { code: 'NX20260626008', system: 'W10120', cls: '工单阻塞问题', status: '提出',   work_order_no: 'ZHQQ_202606025_002', urgency: '高',   round: '第1轮', summary: 'python建模实验室，投产演练实验室、工作空间脏数据清理问题。（5月26日向金科反馈该问题、6月8日组会讨论，至今未解决）' },
  { code: 'NX20260626007', system: '068-01', cls: '工单阻塞问题', status: '提出',   work_order_no: 'ZHQQ_202606025_001', urgency: '紧急', round: '第1轮', summary: '识别审计问题，发送审计对象确认后：1.审计对接岗领取任务后，"配合审计问题"列表未显示该问题，选择转派、转派回复都不会更新列表，直至点击"回复审计组"后，列表才会显示该问题。2.审计对接岗选择转派后审计岗发现无法确认转派任务。' },
  { code: 'NX20260625012', system: 'W06731', cls: '金科-应用配置', status: '提出',   work_order_no: 'ZHQQ_202606023_014', urgency: '紧急', round: '第1轮', summary: '审批进件面签"与后台通信发生错误"柜面无法办理对应交易。' },
  { code: 'NX20260625010', system: 'YP8003', cls: '金科-应用配置', status: '提出',   work_order_no: 'ZHQQ_202606023_002', urgency: '中',   round: '第2轮', summary: '社保卡制卡产生两条制卡数据导致制卡失败，需排查批量制卡逻辑中的重复写入问题。' },
  { code: 'NX20260625009', system: 'W06730', cls: '工单阻塞问题', status: '提出',   work_order_no: 'ZHQQ_202606023_001', urgency: '高',   round: '第1轮', summary: '同一客户同一天办理3笔协商分期还款均成功，欠款金额为0仍然可以办理分期，分期后形成溢缴款。' },
  { code: 'NX20260623022', system: 'W05810', cls: '工单阻塞问题', status: '提出',   work_order_no: 'ZHQQ_202606022_001', urgency: '高',   round: '第1轮', summary: '行社反馈，边贸网银界面，汇款信息查询打印功能中，查询出的交易明细显示的付款账号展示错误，当前展示的是清算账号，实际应展示付款账号。' },
  { code: 'NX20260623021', system: 'W08384', cls: '工单阻塞问题', status: '处理中', work_order_no: 'ZHQQ_202606023_004', urgency: '高',   round: '第2轮', summary: '人行反馈存在202603报送202604未报送的情况，经排查发现个贷存在放款日期与首次还款日期超过两个月的情况，以上情况需要征信系统兜底月末报送。' },
  { code: 'NX20260623014', system: 'WP1031', cls: '工单阻塞问题', status: '处理中', work_order_no: 'ZHQQ_202606022_001', urgency: '中',   round: '第1轮', summary: '界面展示账号有误，付款账号字段取值逻辑错误，部分联机交易返回清算账号代替客户账号展示。' },
  { code: 'NX20260622011', system: 'W08384', cls: '工单阻塞问题', status: '待验证', work_order_no: 'ZHQQ_202606017_009', urgency: '高',   round: '第2轮', summary: '对公贷款多记了一条贷款应计利息金额，造成征信报送时还款总金额与实际情况不一致。' },
  { code: 'NX20260622010', system: 'W08384', cls: '工单阻塞问题', status: '处理中', work_order_no: 'ZHQQ_202606017_008', urgency: '高',   round: '第2轮', summary: '个人贷款系统对非循环类贷款支持一次性放款和分次放款，而目前所有的数据均按照一次性放款进行报送D1账户，存在报送口径偏差。' },
  { code: 'NX20260622009', system: 'W08384', cls: '工单阻塞问题', status: '处理中', work_order_no: 'ZHQQ_202606017_007', urgency: '高',   round: '第2轮', summary: '征信非月度表现段还款金额、还款日期报送错误，影响个人征信数据准确性，需紧急修复。' },
  { code: 'NX20260622008', system: 'W08384', cls: '工单阻塞问题', status: '处理中', work_order_no: 'ZHQQ_202606017_006', urgency: '中',   round: '第2轮', summary: '个人贷款R1账户没有报送保证人信息，导致征信保证担保关系缺失，需补充保证人关联逻辑。' },
  { code: 'NX20260617017', system: 'W08384', cls: '工单阻塞问题', status: '已解决', work_order_no: 'ZHQQ_202606017_001', urgency: '紧急', round: '第1轮', summary: '调额审批进件岗-发起批量邀约调额进件时，出现"外呼【A0838Q001查询人行报告异常】"，导致批量进件中断，影响调额业务办理。' },
];
// 用于 release_apply 关联的问题编号列表（前10条）
const ISSUE_CODES = REAL_ISSUES.slice(0, 10).map((r) => r.code);

// 12 个投产点（投产窗口）：YYYYMMDD、版本类型、是否默认、是否归档
const RELEASE_POINTS = [
  ['20260116', '常规版本', 0, 1], ['20260220', '常规版本', 0, 0], ['20260320', '重大版本', 0, 0],
  ['20260417', '常规版本', 0, 0], ['20260515', '常规版本', 0, 0], ['20260619', '常规版本', 1, 0],
  ['20260717', '应急版本', 0, 0], ['20260821', '常规版本', 0, 0], ['20260918', '常规版本', 0, 0],
  ['20261016', '重大版本', 0, 0], ['20261120', '常规版本', 0, 0], ['20261218', '常规版本', 0, 0],
];

// 需求标题模板片段
const REQ_TOPICS = [
  '账户风险监测规则优化', '对公存款产品参数配置', '反洗钱可疑交易模型升级', '理财净值化估值引擎改造',
  '客户信息联网核查接口对接', '支付结算路由策略调整', '总账系统科目映射重构', '管理会计分摊规则扩展',
  '信贷额度审批流程优化', '第三方存管对账逻辑修复', '消息中心模板渠道扩展', '企业服务总线服务编排',
  '高管驾驶舱指标口径统一', '惠民惠农补贴发放对接', '票据直连报文格式适配', '定价管理计算引擎性能优化',
  '公积金缴存数据报送', '非税收入电子化收缴对接', '客户结算批量处理改造', '运营管理统计报表重构',
];
const DEV_ACTIONS = ['接口改造', '数据迁移', '规则配置', '页面重构', '批处理优化', '报文适配', '性能调优', '缺陷修复'];

// ---------------------------------------------------------------------------
// 业务参与方机构（用于实施方/部门口径）
// ---------------------------------------------------------------------------
const IMPL_ORGS = ['上海事业群', '北京事业群', '成都事业群', '深圳事业群', '武汉事业群', '厦门事业群', '大数据中心', '交付事业部', '基础技术中心'];

// 清空业务/人员数据（保留字典/系统/角色/权限/超级管理员）
async function wipe() {
  const tables = [
    'release_signoff', 'release_system', 'release_task', 'release_apply',
    'test_task', 'dev_task', 'requirement', 'ticket', 'issue',
    'attachment', 'audit_log', 'saved_filter', 'dashboard_chart',
  ];
  for (const t of tables) await run(`DELETE FROM ${t}`);
  // 删除除引导超管(admin)外的全部人员（含名单内的超管薛潇，保证可重复执行；user_role 随级联删除）
  await run('DELETE FROM user WHERE phone <> ?', config.superAdmin.phone);
  // release_point 被需求/投产申请引用，需在其后清空
  await run('DELETE FROM release_point');
}

export async function runMock() {
  await runMigrations();
  await runSeed();

  await tx(async () => {
    await wipe();

    // ----------------------------------------------------------------------
    // 1) 用户（导入真实名单 USERS；密码统一 Radar@2026；「超级管理员」角色以 is_super=1 建号）
    // ----------------------------------------------------------------------
    const pwd = hashPassword('Radar@2026');
    const roleId = {};
    for (const r of await all('SELECT id, code FROM role')) roleId[r.code] = r.id;
    const usersByRole = {}; // roleCode -> [name]
    for (const [phone, name, code, org] of USERS) {
      if (!roleId[code]) throw new Error(`角色不存在：${code}（手机号 ${phone}）`);
      const isSuper = code === '超级管理员' ? 1 : 0;
      const res = await run(
        `INSERT INTO user (phone, name, org, password_hash, status, is_super, password_changed_at)
         VALUES (?,?,?,?,?,?,datetime('now','localtime'))`,
        phone, name, org, pwd, '启用', isSuper,
      );
      await run('INSERT INTO user_role (user_id, role_id) VALUES (?,?)', res.lastInsertRowid, roleId[code]);
      (usersByRole[code] ||= []).push(name);
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

    for (const spec of specs) {
      const main = pickN(sysCodes, 1 + Math.floor(rng() * 2));
      const collabDev = rng() < 0.3 ? pickN(sysCodes.filter((c) => !main.includes(c)), 1) : [];
      const collabTest = rng() < 0.25 ? pickN(sysCodes.filter((c) => !main.includes(c)), 1) : [];
      const code = await genRequirementCode(spec.rp.date);
      const topic = pick(REQ_TOPICS);
      const reqStatus = REQ_DONE.has(spec.profile) ? '分析完成'
        : (spec.profile === 'analysis' ? '需求分析' : '需求登记');
      const proposeTime = shift(ymd(spec.rp.date), -60 - Math.floor(rng() * 60));
      const res = await run(
        `INSERT INTO requirement
           (req_code, title, summary, status, req_type, propose_dept, proposer, yn_owner, jk_owner,
            propose_time, main_systems, collab_dev_systems, collab_test_systems, release_point_id, registrar, register_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        code, `${sysByCode[main[0]].sys_name}${topic}`,
        `针对${sysByCode[main[0]].sys_name}的${topic}，覆盖相关业务规则与接口改造，确保${spec.rp.date.slice(0, 6)}投产窗口如期交付。`,
        reqStatus,
        pick(['新增需求', '已有功能的需求变更', '缺陷修复', '紧急变更']),
        pick(['云南农信', '智能云事业部', '大数据中心']),
        JSON.stringify([pickUser('农信业务')]), pickUser('农信业务'), pickUser('金科业务'),
        proposeTime,
        JSON.stringify(main), JSON.stringify(collabDev), JSON.stringify(collabTest),
        spec.rp.id, pickUser('农信业务'), shift(proposeTime, 2),
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
      const code = await genDevCode(req.code);
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
      const code = await genTestCode(testType, req.code);
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
        pickUser('测试负责人'), shift(planStart, -2),
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
    /** 创建投产任务 + 6 个会签项；signedPlan 决定每个会签项结果 */
    async function makeReleaseTask(code, entityType, relStatus, reviewStatus, signResults, signedDate) {
      const res = await run(
        `INSERT INTO release_task (req_code, entity_type, status, review_status, owner, registrar, register_time)
         VALUES (?,?,?,?,?,?,?)`,
        code, entityType, relStatus, reviewStatus, pickUser(rng() < 0.5 ? '金科运维' : '农信运维'),
        pickUser('项目负责人'), signedDate,
      );
      const rtId = res.lastInsertRowid;
      await auditCreate('release', rtId, code, '系统初始化');
      for (const [i, role] of signRoles.entries()) {
        const result = signResults[i] || '未签署';
        const signer = result === '未签署' ? null : pickUser(role.name);
        const signed = result !== '未签署';
        const signerUser = signed ? await get('SELECT id FROM user WHERE name = ?', signer) : null;
        await run(
          `INSERT INTO release_signoff
             (release_task_id, role_id, role_name, signer_user_id, signer_name, result, conclusion, sign_time)
           VALUES (?,?,?,?,?,?,?,?)`,
          rtId, role.id, role.name,
          signerUser?.id || null,
          signed ? signer : null, result,
          result === '已驳回' ? '存在投产风险，需补充回退方案' : (result === '已签署' ? '同意投产' : null),
          signed ? `${signedDate} 10:00:00` : null,
        );
        if (signed) {
          await auditUpdate('release', rtId, role.name, signer, { r: '未签署' }, { r: result }, { r: `会签-${role.name}` });
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
        await makeReleaseTask(req.code, 'requirement', relStatus, '评审同意', allSigned, signedDate);
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
        await makeReleaseTask(req.code, 'requirement', '待投产', reviewStatus, results, signedDate);
      }
      ai++;
    }

    // ----------------------------------------------------------------------
    // 7) 问题清单（15 条，使用 PAMS 实际同步数据，补充完整明细字段）
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
    for (let i = 0; i < REAL_ISSUES.length; i++) {
      const issue = REAL_ISSUES[i];
      const isSolved = ['已解决', '待验证'].includes(issue.status);
      const createDate = shift('2026-06-01', i);
      await run(
        `INSERT INTO issue
           (issue_code, round, urgency, handling_method, business_group, module, system, work_order_no,
            create_time, plan_resolve_time, status, category, detailed_classification, summary, details,
            tracker_name, tracker_org, reporter_name, reporter_org, handler_name, handler_org,
            is_major, is_common, root_cause, solution, release_status, synced_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        issue.code, issue.round, issue.urgency, pick(HANDLING),
        '云南农信', '业务系统', issue.system, issue.work_order_no,
        createDate, shift(createDate, 14 + (i % 7)),
        issue.status, '生产问题', issue.cls,
        issue.summary,
        `${issue.system}生产环境出现${issue.cls}，具体表现：${issue.summary.slice(0, 60)}。已提交工单${issue.work_order_no}，待建信金科排查处理。`,
        pickUser('机构负责人'), '云南农信',
        pickUser('农信业务'), '云南农信',
        pickUser('金科开发'), '建信金科',
        issue.urgency === '紧急' ? 1 : 0,
        i % 5 === 0 ? 1 : 0,
        isSolved ? ROOT_CAUSES[i % ROOT_CAUSES.length] : null,
        isSolved ? SOLUTIONS[i % SOLUTIONS.length] : null,
        isSolved ? '待发版' : null,
        '2026-06-14 18:00:00',
      );
    }

    // ----------------------------------------------------------------------
    // 8) 工单分析（10 条，关联实际问题编号，含开发/测试任务）
    // ----------------------------------------------------------------------
    const TICKET_TYPES = ['工单阻塞问题', '工单急迫需求', '延后承诺需求'];
    // 工单画像：released/sit/dev/analysis - 对应全链路进度
    const TICKET_SPECS = [
      { profile: 'released', rp: rpIds[4], issueIdx: 14, type: '工单阻塞问题', isAccounting: '否' }, // 已上线
      { profile: 'released', rp: rpIds[3], issueIdx: 11, type: '工单阻塞问题', isAccounting: '是' }, // 已上线涉账
      { profile: 'sit',      rp: rpIds[5], issueIdx: 8,  type: '工单阻塞问题', isAccounting: '否' }, // 测试中
      { profile: 'sit',      rp: rpIds[5], issueIdx: 9,  type: '工单急迫需求', isAccounting: '否' }, // 测试中
      { profile: 'dev',      rp: rpIds[6], issueIdx: 4,  type: '工单阻塞问题', isAccounting: '否' }, // 开发中
      { profile: 'dev',      rp: rpIds[6], issueIdx: 5,  type: '工单急迫需求', isAccounting: '是' }, // 开发中涉账
      { profile: 'dev',      rp: rpIds[7], issueIdx: 6,  type: '工单阻塞问题', isAccounting: '否' }, // 开发中
      { profile: 'analysis', rp: rpIds[7], issueIdx: 0,  type: '工单阻塞问题', isAccounting: '否' }, // 工单分析
      { profile: 'analysis', rp: rpIds[8], issueIdx: 1,  type: '延后承诺需求', isAccounting: '否' }, // 工单分析
      { profile: 'register', rp: rpIds[8], issueIdx: 3,  type: '工单阻塞问题', isAccounting: '否' }, // 工单登记
    ];
    const TICKET_DONE = new Set(['released', 'sit', 'dev']);
    const TICKET_STATUS = {
      released: '分析完成', sit: '分析完成', dev: '分析完成',
      analysis: '工单分析', register: '工单登记',
    };

    for (const tspec of TICKET_SPECS) {
      const linkedIssue = REAL_ISSUES[tspec.issueIdx];
      const code = await genTicketCode(tspec.rp.date);
      const tStatus = TICKET_STATUS[tspec.profile];
      const main = pickN(sysCodes, 1);
      const proposeTime = shift(ymd(tspec.rp.date), -40 - Math.floor(rng() * 20));
      await run(
        `INSERT INTO ticket
           (ticket_code, title, summary, status, ticket_type, is_accounting,
            propose_dept, proposer, yn_owner, jk_owner, propose_time,
            main_systems, collab_dev_systems, collab_test_systems,
            release_point_id, issue_no, registrar, register_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        code,
        linkedIssue.summary.slice(0, 50).trimEnd() + (linkedIssue.summary.length > 50 ? '…' : ''),
        linkedIssue.summary,
        tStatus, tspec.type, tspec.isAccounting,
        '云南农信', JSON.stringify([pickUser('农信业务')]),
        pickUser('农信业务'), pickUser('金科业务'),
        proposeTime,
        JSON.stringify(main), JSON.stringify([]), JSON.stringify([]),
        tspec.rp.id, linkedIssue.code,
        pickUser('农信业务'), shift(proposeTime, 1),
      );
      const ticketId = (await get('SELECT id FROM ticket WHERE ticket_code = ?', code)).id;
      await auditCreate('ticket', ticketId, code, '系统初始化');

      // 开发任务（released/sit/dev 各有）
      if (['released', 'sit', 'dev'].includes(tspec.profile)) {
        const devStatus = tspec.profile === 'dev' ? pick(['开发设计', '开发实施', '单元测试']) : '开发完成';
        const devCode = await genDevCode(code);
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
        const testCode = await genTestCode('SIT', code);
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
          pickUser('测试负责人'), shift(planStart, -1),
        );
        testCount++;
      }

      // 投产审批（released）
      if (tspec.profile === 'released') {
        await makeReleaseTask(code, 'ticket', '已投产', '评审同意', allSigned, shift(ymd(tspec.rp.date), -3));
      }
    }

    // ----------------------------------------------------------------------
    // 9) 投产申请（≥20 个关联问题）—— 引用需求/问题编号
    // ----------------------------------------------------------------------
    const ARTIFACTS = ['镜像制品', '二进制制品', '介质库文件', '无制品'];
    const FERRY = ['未摆渡', '待发送', '已摆渡', '摆渡失败'];
    /** 评审状态派生（取最弱）——与 release-apply 路由一致 */
    const REVIEW_RANK = { 评审拒绝: 0, 评审撤销: 1, 待评审: 2, 应急审批: 3, 评审同意: 4 };
    async function deriveReview(refCodes) {
      let weakest = null; let weakestRank = Infinity;
      for (const c of refCodes) {
        const rt = await get('SELECT review_status FROM release_task WHERE req_code = ?', c);
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
          delivery_unit: at === '无制品' ? null : `${sysCode}-${pick(['app', 'svc', 'batch'])}-v${2 + i}.${Math.floor(rng() * 9)}.0`,
          new_version: `V${2 + i}.${Math.floor(rng() * 9)}.${Math.floor(rng() * 9)}`,
          ferry_status: pick(FERRY),
        });
      }
      return out;
    }
    async function makeApply(refCodes, rp, changeSys) {
      const code = await genReleaseApplyCode(rp.date.slice(0, 6));
      const review = await deriveReview(refCodes);
      const sys = sysByCode[changeSys];
      await run(
        `INSERT INTO release_apply
           (change_code, change_content, impact_scope, change_system, impl_org, delivery_units,
            ref_codes, review_status, out_dept, deploy_dept, release_point_id, registrar, register_time)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        code,
        `${sys.sys_name}${pick(DEV_ACTIONS)}投产变更，关联：${refCodes.join('、')}`,
        `影响${sys.sys_name}及其上下游联机交易，变更窗口内需停机约 30 分钟`,
        changeSys, sys.org, JSON.stringify(makeUnits(changeSys)),
        JSON.stringify(refCodes), review,
        '建信金科', sys.org, rp.id, pickUser('配置负责人'), ymd(shift(ymd(rp.date), -2)),
      );
      const id = (await get('SELECT id FROM release_apply WHERE change_code = ?', code)).id;
      await auditCreate('release_apply', id, code, '系统初始化');
    }

    // 22 个投产审批需求各一个投产申请；关联问题编号（循环复用 ISSUE_CODES）
    for (const [idx, req] of approvalReqs.entries()) {
      const refs = [req.code];
      refs.push(ISSUE_CODES[idx % ISSUE_CODES.length]);
      await makeApply(refs, req.rp, req.main[0]);
    }
    // 另增 6 个仅含问题/或问题+advanced 需求的投产申请，丰富关联关系
    const advancedReqs = reqs.filter((r) => r.spec.profile === 'advanced');
    for (let i = 0; i < 6; i++) {
      const issue = ISSUE_CODES[(i + 13) % ISSUE_CODES.length];
      const req = advancedReqs[i];
      const refs = req ? [req.code, issue] : [issue];
      const rp = req ? req.rp : rpIds[5];
      await makeApply(refs, rp, req ? req.main[0] : pick(sysCodes));
    }

    // ----------------------------------------------------------------------
    // 输出统计
    // ----------------------------------------------------------------------
    const issueSet = new Set((await all('SELECT issue_code FROM issue')).map((r) => r.issue_code));
    const applyRows = await all('SELECT ref_codes FROM release_apply');
    const issueApplyCount = applyRows.filter((r) => {
      try {
        const refs = parseJsonArray(r.ref_codes);
        return Array.isArray(refs) && refs.some((code) => issueSet.has(code));
      } catch {
        return false;
      }
    }).length;

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
      会签记录: (await get('SELECT COUNT(*) c FROM release_signoff')).c,
      问题: (await get('SELECT COUNT(*) c FROM issue')).c,
      投产申请: (await get('SELECT COUNT(*) c FROM release_apply')).c,
      关联问题的投产申请: issueApplyCount,
      评审状态分布: (await all("SELECT review_status, COUNT(*) c FROM release_task GROUP BY review_status"))
        .map((r) => `${r.review_status}:${r.c}`).join('、'),
    };
    console.log('[模拟数据] 生成完成：');
    for (const [k, v] of Object.entries(stat)) console.log(`  ${k}：${v}`);
  });
}

// 直接运行：node src/db/mock.js
if (import.meta.url === `file://${process.argv[1]}`) {
  await runMock();
  db.exec?.('PRAGMA wal_checkpoint(TRUNCATE);');
  console.log('[模拟数据] 已写入数据库并完成检查点。');
}

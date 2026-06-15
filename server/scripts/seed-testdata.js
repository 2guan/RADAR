/**
 * 文件：scripts/seed-testdata.js
 * 用途：制造覆盖全流程、全场景的测试数据并写入数据库。
 *       数据量扩充：10个投产点，40个需求，80个开发任务，30个左右的应用组装测试与用户测试，10个左右的安全测试或非功能测试。
 *       三分之一的任务（13个需求）到达投产阶段。
 * 作者：hengguan
 * 运行：cd server && node scripts/seed-testdata.js
 * 说明：会先清空业务数据（需求/开发/测试/投产/附件/留痕 与测试人员），再重新灌入；
 *       保留管理员、字典、系统、角色、权限等基础配置。
 */

import { db, get, all, run, tx } from '../src/db/index.js';
import { hashPassword } from '../src/lib/password.js';
import { calcDeviation } from '../src/lib/deviation.js';

/** undefined -> null（SQLite 不能绑定 undefined） */
const nz = (v) => (v === undefined ? null : v);
/** 取系统所属机构 */
const sysOrg = (code) => get('SELECT org FROM system WHERE sys_code = ?', code)?.org || null;
/** 取系统名称 */
const sysName = (code) => get('SELECT sys_name FROM system WHERE sys_code = ?', code)?.sys_name || code;

/** 清空业务数据 */
function clearBusiness() {
  run('DELETE FROM release_signoff');
  run('DELETE FROM release_system');
  run('DELETE FROM release_task');
  run('DELETE FROM test_task');
  run('DELETE FROM dev_task');
  run('DELETE FROM requirement');
  run('DELETE FROM release_point');
  run('DELETE FROM attachment');
  run('DELETE FROM audit_log');
  run('DELETE FROM dashboard_chart');
  // 删除测试人员（手机号 138 开头），保留管理员
  const testUsers = all("SELECT id FROM user WHERE phone LIKE '138%'");
  for (const u of testUsers) {
    run('DELETE FROM user_role WHERE user_id = ?', u.id);
    run('DELETE FROM user WHERE id = ?', u.id);
  }
}

/** 新增投产点 */
function addReleasePoint(date, type, remark, isDefault) {
  const res = run(
    'INSERT INTO release_point (release_date, version_type, remark, is_default) VALUES (?,?,?,?)',
    date, type, remark, isDefault ? 1 : 0,
  );
  return res.lastInsertRowid;
}

/** 新增人员（带角色） */
function addUser(phone, name, org, roleCodes) {
  const res = run(
    'INSERT INTO user (phone, name, org, password_hash, status, password_changed_at) VALUES (?,?,?,?,?,datetime(\'now\',\'localtime\'))',
    phone, name, org, hashPassword('Radar@2026!'), '启用',
  );
  for (const code of roleCodes) {
    const role = get('SELECT id FROM role WHERE code = ?', code);
    if (role) run('INSERT INTO user_role (user_id, role_id) VALUES (?,?)', res.lastInsertRowid, role.id);
  }
  return res.lastInsertRowid;
}

/** 新增需求 */
function addReq(o) {
  const res = run(
    `INSERT INTO requirement
       (req_code, title, summary, status, req_type, propose_dept, proposer, yn_owner, jk_owner,
        propose_time, main_systems, collab_dev_systems, collab_test_systems, release_point_id, registrar, register_time)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    o.req_code, o.title, nz(o.summary), o.status, nz(o.req_type), nz(o.propose_dept), nz(o.proposer), nz(o.yn_owner), nz(o.jk_owner),
    nz(o.propose_time), JSON.stringify(o.main || []), JSON.stringify(o.collabDev || []), JSON.stringify(o.collabTest || []),
    o.rp, o.registrar || '超级管理员', o.register_time || o.propose_time,
  );
  return o.req_code;
}

/** 新增开发任务 */
function addDev(reqCode, seq, o) {
  const code = `RW_${reqCode}_${String(seq).padStart(3, '0')}`;
  const dev = calcDeviation(o.plan_start, o.plan_end, o.actual_end);
  run(
    `INSERT INTO dev_task
       (req_code, task_code, task_name, content, status, owner, impl_system, impl_org,
        plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    reqCode, code, o.task_name || `RW-${o.title || ''}-${sysName(o.impl_system)}`, o.content || '完成相应改造',
    o.status, o.owner, o.impl_system, sysOrg(o.impl_system),
    o.plan_start, o.plan_end, o.actual_start, o.actual_end, dev, '超级管理员', o.register_time,
  );
  return get('SELECT id FROM dev_task WHERE task_code = ?', code).id;
}

/** 新增测试任务 */
function addTest(type, reqCode, seq, o) {
  const code = `${type}_${reqCode}_${String(seq).padStart(3, '0')}`;
  const dev = calcDeviation(o.plan_start, o.plan_end, o.actual_end);
  run(
    `INSERT INTO test_task
       (req_code, task_code, task_name, test_type, status, owner, impl_system, impl_org, impl_agency,
        plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    reqCode, code, o.task_name || `${type}-${o.title || ''}-${sysName(o.impl_system)}`, type,
    o.status, o.owner, o.impl_system, sysOrg(o.impl_system), o.impl_agency || sysOrg(o.impl_system),
    o.plan_start, o.plan_end, o.actual_start, o.actual_end, dev, '超级管理员', o.register_time,
  );
  return get('SELECT id FROM test_task WHERE task_code = ?', code).id;
}

/** 发起投产并按指定签署结果/系统状态落库 */
function addRelease(reqCode, o) {
  const res = run(
    'INSERT INTO release_task (req_code, status, owner, registrar, register_time) VALUES (?,?,?,?,?)',
    reqCode, o.status, o.owner, '超级管理员', o.register_time,
  );
  const rtId = res.lastInsertRowid;
  // 会签项（按系统设置中打标的会签角色生成）
  const roles = all('SELECT id, name FROM role WHERE is_signoff_role = 1 ORDER BY id');
  for (const role of roles) {
    const r = (o.signoffs && o.signoffs[role.name]) || { result: '未签署' };
    run(
      `INSERT INTO release_signoff (release_task_id, role_id, role_name, signer_name, result, conclusion, sign_time)
       VALUES (?,?,?,?,?,?,?)`,
      rtId, role.id, role.name, r.signer || null, r.result, r.conclusion || null,
      r.result === '未签署' ? null : o.signTime || o.register_time,
    );
  }
  // 系统投产登记
  for (const s of o.systems || []) {
    run(
      'INSERT INTO release_system (release_task_id, system_code, impl_org, actual_release_time, status) VALUES (?,?,?,?,?)',
      rtId, s.code, sysOrg(s.code), s.time || null, s.status,
    );
  }
  return rtId;
}

/** 新增路径型附件 */
function addPath(entityType, entityId, field, path) {
  run(
    `INSERT INTO attachment (entity_type, entity_id, field_key, kind, path_text, uploader) VALUES (?,?,?, 'path', ?, ?)`,
    entityType, entityId, field, path, '超级管理员',
  );
}

// 40个金融科技业务需求模版
const REQ_TEMPLATES = [
  { title: "跨行资金清算系统性能优化", summary: "优化跨行资金清算系统高并发下的交易延迟，改造数据库索引与缓存机制。" },
  { title: "反洗钱风险评级模型升级", summary: "基于最新监管要求升级反洗钱风险等级评估规则，支持动态权重调整。" },
  { title: "企业网银跨国支付通道接入", summary: "对接境外代理行ISO20022标准报文，支持多种外币跨境支付清算。" },
  { title: "零售信贷审批流程风控改造", summary: "引入多源征信数据及风控引擎，实现个贷线上审批秒级授信。" },
  { title: "手机银行活体检测安全升级", summary: "升级人脸识别SDK，增加动作活体与静默防伪检测以提升交易安全。" },
  { title: "资产管理系统合同电子签章", summary: "集成第三方电子合同签章服务，实现全流程线上无纸化签约与取证。" },
  { title: "智能客服多轮对话意图识别", summary: "引入NLP深度学习模型，优化智能机器人多轮对话中的意图理解精度。" },
  { title: "大额存单线上认购功能开发", summary: "新增企业及个人大额存单在线购买、转让与提前支取功能。" },
  { title: "信用卡核心额度调控系统改造", summary: "支持根据客户授信评级及临时消费需求进行智能额度调整与风控控制。" },
  { title: "普惠金融小微企业画像分析", summary: "利用多维经营数据构建小微企业信用评估画像，辅助普惠贷款决策。" },
  { title: "实时反欺诈交易拦截引擎", summary: "在支付网关层引入实时欺诈交易行为特征分析，拦截高风险可疑交易。" },
  { title: "数字人民币钱包代发工资", summary: "扩展企业网银功能，支持通过数字人民币对公钱包一键群发员工工资。" },
  { title: "综合报表系统监管数据报送", summary: "按照金监总局最新1104非现场监管报表要求，改造明细数据归集口径。" },
  { title: "柜面系统身份证联网核查升级", summary: "对接公安部最新接口，支持港澳台同胞居住证联网核查与信息录入。" },
  { title: "同业拆借交易前后台一体化", summary: "打通前台交易系统与后台账务清算，实现国债拆借交易直通式处理(STP)。" },
  { title: "小额快捷支付免密限额动态微调", summary: "允许用户在手机银行自助设置不同支付场景的免签免密单笔/单日限额。" },
  { title: "智能投顾组合一键调仓优化", summary: "优化量化策略引擎，支持根据市场波动对理财组合进行一键自动重平衡。" },
  { title: "电子对账单自动推送与解析", summary: "开发企业账单自动分析导出工具，支持PDF、CSV格式通过邮件及微信推送。" },
  { title: "理财代销系统境外产品接入", summary: "改造理财代销模块，支持对接QDII等跨境理财产品的净值同步与申赎。" },
  { title: "网贷业务征信二代接口升级", summary: "对接人行二代征信报告标准，优化征信报告自动解析与段落数据入库。" },
  { title: "企业授信额度拆分与共享控制", summary: "支持集团企业客户在子孙公司间进行授信额度的灵活调配与强控管理。" },
  { title: "柜台排队叫号系统与微信预约联动", summary: "微信小程序预约网点排号，柜面服务系统实时关联预约信息优先叫号。" },
  { title: "开放银行API网关安全鉴权", summary: "引入OAuth2.0及国密算法签名，提升面向商户侧开放API的接入安全性。" },
  { title: "信贷抵质押物价值智能估值", summary: "引入第三方房地产与车辆评估数据，实现抵押物价值的每日自动重估。" },
  { title: "直销银行存款产品秒杀模块", summary: "高并发抢购场景下的小额特色存款系统优化，防超卖与队列限流机制。" },
  { title: "企业薪税服务平台增值开发", summary: "为代发工资企业免费提供个税专项附加扣除申报及薪酬管理辅助工具。" },
  { title: "智能催收自动外呼语音交互", summary: "集成智能语音呼叫系统，对逾期客户进行首期自动提醒与催收录音解析。" },
  { title: "外汇结售汇汇率动态报价改造", summary: "对接外汇交易中心实时牌价，优化结售汇模块的前台报价点差加成逻辑。" },
  { title: "信用卡账单分期营销规则推荐", summary: "利用用户消费轨迹与分期意愿进行实时计算，主动下发短信/弹窗分期邀请。" },
  { title: "核心存款系统多维度计费引擎", summary: "支持按日限额、超额累进等多元化对公账户管理服务费自动计扣。" },
  { title: "微信小程序零钱通理财互通", summary: "支持通过手机银行快速开立微信端合作理财账户，实现资金实时划转。" },
  { title: "数字档案馆电子凭证防篡改", summary: "利用区块链或数字水印技术，对导出的电子回单、结清证明进行防伪标识。" },
  { title: "清算报文清分效率多线程升级", summary: "对支付前置模块进行多线程并发重构，大幅降低批量报文解析时间。" },
  { title: "个人外汇网银限额超额预警", summary: "对于个人年度5万美元结售汇限额临界客户，在交易前进行弹窗提示。" },
  { title: "供应链金融应收账款流转", summary: "基于核心企业信用，支持上游供应商对应收账款凭证进行拆分与流转融资。" },
  { title: "智能运营排班管理系统", summary: "根据网点历史业务量预测曲线，自动推荐网点柜员弹性排班方案。" },
  { title: "存贷款联动质押融资开发", summary: "支持将未到期定期存单在线一键质押申请等额消费贷款，资金秒级到账。" },
  { title: "小微债权资产包证券化系统", summary: "开发资产证券化管理工具，支持债权筛选、包资产现金流智能预测。" },
  { title: "手机银行无障碍大字版改造", summary: "针对老年客户优化手机银行UI排版，支持语音播报与一键求助呼叫柜员。" },
  { title: "个人征信报告异常查询实时拦截", summary: "对柜员异常高频查询征信报告行为进行实时审计拦截，防止客户信息泄露。" }
];

function main() {
  tx(() => {
    clearBusiness();

    // 确保会签角色打标正确（修正由于基础种子数据运行在迁移后导致的 is_signoff_role 未打标问题）
    run("UPDATE role SET is_signoff_role = 1 WHERE code IN ('金科业务', '金科开发', '金科测试', '金科运维')");

    // ===== 1. 十个投产点 =====
    const releasePointsData = [
      { date: '20260815', type: '常规版本', remark: '8月常规投产窗口', isDefault: true },
      { date: '20260920', type: '应急版本', remark: '9月应急修复窗口', isDefault: false },
      { date: '20261110', type: '重大版本', remark: '11月重大版本窗口', isDefault: false },
      { date: '20261215', type: '常规版本', remark: '12月常规投产窗口', isDefault: false },
      { date: '20270120', type: '应急版本', remark: '1月应急修复窗口', isDefault: false },
      { date: '20270215', type: '常规版本', remark: '2月常规投产窗口', isDefault: false },
      { date: '20270320', type: '重大版本', remark: '3月重大版本窗口', isDefault: false },
      { date: '20270415', type: '常规版本', remark: '4月常规投产窗口', isDefault: false },
      { date: '20270520', type: '应急版本', remark: '5月应急修复窗口', isDefault: false },
      { date: '20270615', type: '常规版本', remark: '6月常规投产窗口', isDefault: false }
    ];
    const rps = [];
    for (const item of releasePointsData) {
      rps.push(addReleasePoint(item.date, item.type, item.remark, item.isDefault));
    }

    // ===== 2. 人员定义（16人，覆盖各角色、各机构，保证数据关联） =====
    function addTestUser(phone, name, org, roleCodes) {
      const id = addUser(phone, name, org, roleCodes);
      return { id, phone, name, org, roleCodes };
    }

    const developers = [
      addTestUser('13800000001', '张三', '上海事业群', ['金科开发']),
      addTestUser('13800000006', '钱七', '深圳事业群', ['农信开发']),
      addTestUser('13800000009', '吴十', '广州事业群', ['农信开发']),
      addTestUser('13800000011', '王十二', '厦门事业群', ['农信开发']),
      addTestUser('13800000013', '林十四', '大数据中心', ['金科开发']),
      addTestUser('13800000015', '高十六', '交付事业部', ['金科开发'])
    ];

    const testers = [
      addTestUser('13800000002', '李四', '上海事业群', ['金科测试']),
      addTestUser('13800000007', '孙八', '成都事业群', ['农信测试']),
      addTestUser('13800000010', '郑十一', '北京事业群', ['农信测试']),
      addTestUser('13800000012', '陈十三', '武汉事业群', ['农信测试']),
      addTestUser('13800000014', '徐十五', '大数据中心', ['金科测试']),
      addTestUser('13800000016', '梁十七', '交付事业部', ['金科测试'])
    ];

    const businessOwners = [
      addTestUser('13800000003', '王五', '建信金科', ['金科业务']),
      addTestUser('13800000005', '朱俊杰', '云南农信', ['农信业务']),
      addTestUser('13800000008', '周九', '建信金科', ['金科业务', '金科测试'])
    ];

    const opsOwners = [
      addTestUser('13800000004', '赵六', '建信金科', ['金科运维'])
    ];

    // ===== 3. 查询系统，按机构分组以便做关联 =====
    const allSystems = all('SELECT sys_code, sys_name, org, sector FROM system');
    const systemsByOrg = {};
    for (const s of allSystems) {
      if (!systemsByOrg[s.org]) {
        systemsByOrg[s.org] = [];
      }
      systemsByOrg[s.org].push(s);
    }
    const getSystemForOrg = (org) => {
      const list = systemsByOrg[org] || allSystems;
      return list[Math.floor(Math.random() * list.length)];
    };

    // ===== 4. 循环生成40个需求，及其关联的开发/测试/投产任务 =====
    let devTaskCount = 0;
    let testSITUATCount = 0;
    let testSECNFTCount = 0;

    for (let i = 0; i < 40; i++) {
      const rpId = rps[i % 10];
      const rpDate = releasePointsData[i % 10].date;
      const tpl = REQ_TEMPLATES[i];
      
      const bizOwner = businessOwners[i % businessOwners.length];
      const proposer = bizOwner.name;
      const proposeDept = bizOwner.org;
      const ynOwner = bizOwner.name;
      const jkOwner = businessOwners[(i + 1) % businessOwners.length].name;
      
      // 主责任开发人员与主责系统，确保人员和系统机构一致
      const primaryDev = developers[i % developers.length];
      const sys1 = getSystemForOrg(primaryDev.org);
      
      // 协同开发人员与协同系统
      const secondaryDev = developers[(i + 1) % developers.length];
      const sys2 = getSystemForOrg(secondaryDev.org);
      
      let collabDev = [];
      if (i < 30 && sys2.sys_code !== sys1.sys_code) {
        collabDev = [sys2.sys_code];
      }

      // 阶段划分：
      // 0-12 (13个): 投产阶段 (已投产或待评审，SIT/UAT/开发全完结)
      // 13-17 (5个): 测试阶段 (开发完结，SIT/UAT测试中)
      // 18-33 (16个): 开发阶段 (开发设计/实施中，无测试)
      // 34-39 (6个): 需求阶段 (需求分析/登记中，部分有待评估的开发任务)
      
      let reqStatus = '需求完成';
      if (i >= 34) {
        reqStatus = (i % 2 === 0) ? '需求分析' : '需求登记';
      }

      const reqCode = `RC_${rpDate}_${String(i + 1).padStart(3, '0')}`;
      addReq({
        req_code: reqCode,
        title: tpl.title,
        summary: tpl.summary,
        status: reqStatus,
        req_type: ['新增需求', '已有功能的需求变更', '缺陷修复', '紧急变更'][i % 4],
        propose_dept: proposeDept,
        proposer: proposer,
        yn_owner: ynOwner,
        jk_owner: jkOwner,
        propose_time: '2026-06-01',
        main: [sys1.sys_code],
        collabDev: collabDev,
        collabTest: [],
        rp: rpId
      });

      const reqRow = get("SELECT id FROM requirement WHERE req_code = ?", reqCode);
      addPath('requirement', reqRow.id, '需求说明书', `\\\\fileserver\\specs\\${tpl.title}需求说明书.docx`);

      // ------------------ 投产阶段 (13个) ------------------
      if (i >= 0 && i <= 12) {
        // 1. 开发任务：每个需求2个开发任务 (全完成)
        const d1 = addDev(reqCode, 1, {
          title: tpl.title,
          status: '开发完成',
          owner: primaryDev.name,
          impl_system: sys1.sys_code,
          plan_start: '2026-06-15',
          plan_end: '2026-07-05',
          actual_start: '2026-06-16',
          actual_end: '2026-07-08',
          register_time: '2026-06-15'
        });
        devTaskCount++;
        addPath('dev', d1, '概要设计', `\\\\fileserver\\dev\\${sys1.sys_code}_概要设计.docx`);
        addPath('dev', d1, '单元测试报告', `\\\\fileserver\\dev\\${sys1.sys_code}_单测报告.pdf`);

        const d2TargetSys = collabDev.length ? collabDev[0] : sys1.sys_code;
        const d2 = addDev(reqCode, 2, {
          title: tpl.title,
          status: '开发完成',
          owner: secondaryDev.name,
          impl_system: d2TargetSys,
          plan_start: '2026-06-15',
          plan_end: '2026-07-05',
          actual_start: '2026-06-15',
          actual_end: '2026-07-04',
          register_time: '2026-06-15'
        });
        devTaskCount++;
        addPath('dev', d2, '概要设计', `\\\\fileserver\\dev\\${d2TargetSys}_概要设计.docx`);

        // 2. 测试任务：1 SIT + 1 UAT (全完成)
        const tester1 = testers[i % testers.length];
        const tSIT = addTest('SIT', reqCode, 1, {
          title: tpl.title,
          status: '测试完成',
          owner: tester1.name,
          impl_system: sys1.sys_code,
          plan_start: '2026-07-09',
          plan_end: '2026-07-18',
          actual_start: '2026-07-09',
          actual_end: '2026-07-19',
          register_time: '2026-07-09'
        });
        testSITUATCount++;
        addPath('test', tSIT, 'SIT测试报告', `\\\\fileserver\\test\\SIT_${reqCode}_测试报告.pdf`);

        const tUAT = addTest('UAT', reqCode, 1, {
          title: tpl.title,
          status: '测试完成',
          owner: bizOwner.name,
          impl_system: sys1.sys_code,
          plan_start: '2026-07-26',
          plan_end: '2026-08-02',
          actual_start: '2026-07-26',
          actual_end: '2026-08-01',
          register_time: '2026-07-26'
        });
        testSITUATCount++;
        addPath('test', tUAT, 'UAT验收报告', `\\\\fileserver\\test\\UAT_${reqCode}_验收报告.pdf`);

        // 3. 安全或非功能测试：前5个配置NFT，第6-10个配置SEC (10个任务)
        if (i < 5) {
          const tNFT = addTest('NFT', reqCode, 1, {
            title: tpl.title,
            status: '测试完成',
            owner: testers[(i + 2) % testers.length].name,
            impl_system: sys1.sys_code,
            plan_start: '2026-07-20',
            plan_end: '2026-07-25',
            actual_start: '2026-07-20',
            actual_end: '2026-07-25',
            register_time: '2026-07-20'
          });
          testSECNFTCount++;
          addPath('test', tNFT, 'NFT性能报告', `\\\\fileserver\\test\\NFT_${reqCode}_性能报告.pdf`);
        } else if (i >= 5 && i < 10) {
          const tSEC = addTest('SEC', reqCode, 1, {
            title: tpl.title,
            status: '测试完成',
            owner: testers[(i + 3) % testers.length].name,
            impl_system: sys1.sys_code,
            plan_start: '2026-07-20',
            plan_end: '2026-07-25',
            actual_start: '2026-07-20',
            actual_end: '2026-07-25',
            register_time: '2026-07-20'
          });
          testSECNFTCount++;
          addPath('test', tSEC, '安全扫描报告', `\\\\fileserver\\test\\SEC_${reqCode}_安全报告.pdf`);
        }

        // 4. 投产任务：9个已投产，4个待投产
        const isReleased = (i < 9);
        const relStatus = isReleased ? '已投产' : '待投产';
        const opsOwner = opsOwners[0];

        let signoffs = {};
        if (isReleased) {
          signoffs = {
            金科业务: { result: '已签署', signer: bizOwner.name, conclusion: '业务验收通过，同意投产' },
            金科开发: { result: '已签署', signer: primaryDev.name, conclusion: '开发自测通过，投产包已验证' },
            金科测试: { result: '已签署', signer: tester1.name, conclusion: 'SIT/UAT测试通过，测试报告已盖章' },
            金科运维: { result: '已签署', signer: opsOwner.name, conclusion: '运维配置就绪，同意发布' }
          };
        } else {
          if (i === 9) { // 驳回案例
            signoffs = {
              金科业务: { result: '已签署', signer: bizOwner.name, conclusion: '同意投产' },
              金科开发: { result: '已签署', signer: primaryDev.name, conclusion: '开发完成' },
              金科测试: { result: '已驳回', signer: tester1.name, conclusion: '发现遗留安全漏洞，需要修复' },
              金科运维: { result: '未签署' }
            };
          } else { // 签署中案例
            signoffs = {
              金科业务: { result: '已签署', signer: bizOwner.name, conclusion: '同意投产' },
              金科开发: { result: '已签署', signer: primaryDev.name, conclusion: '开发完成' },
              金科测试: { result: '未签署' },
              金科运维: { result: '未签署' }
            };
          }
        }

        const systemsRel = [{ code: sys1.sys_code, status: relStatus, time: isReleased ? rpDate : null }];
        if (collabDev.length) {
          systemsRel.push({ code: collabDev[0], status: relStatus, time: isReleased ? rpDate : null });
        }

        addRelease(reqCode, {
          status: relStatus,
          owner: opsOwner.name,
          register_time: '2026-08-05',
          signTime: isReleased ? '2026-08-06' : null,
          signoffs: signoffs,
          systems: systemsRel
        });
      }
      // ------------------ 测试阶段 (5个) ------------------
      else if (i >= 13 && i <= 17) {
        // 1. 开发任务：每个需求2个开发任务 (全完成)
        addDev(reqCode, 1, {
          title: tpl.title,
          status: '开发完成',
          owner: primaryDev.name,
          impl_system: sys1.sys_code,
          plan_start: '2026-06-15',
          plan_end: '2026-07-05',
          actual_start: '2026-06-16',
          actual_end: '2026-07-08',
          register_time: '2026-06-15'
        });
        devTaskCount++;

        const d2TargetSys = collabDev.length ? collabDev[0] : sys1.sys_code;
        addDev(reqCode, 2, {
          title: tpl.title,
          status: '开发完成',
          owner: secondaryDev.name,
          impl_system: d2TargetSys,
          plan_start: '2026-06-15',
          plan_end: '2026-07-05',
          actual_start: '2026-06-15',
          actual_end: '2026-07-04',
          register_time: '2026-06-15'
        });
        devTaskCount++;

        // 2. 测试任务：共计 4 个 SIT/UAT 任务以凑满30个测试
        const tester1 = testers[i % testers.length];
        if (i === 13) {
          // SIT完成
          addTest('SIT', reqCode, 1, {
            title: tpl.title,
            status: '测试完成',
            owner: tester1.name,
            impl_system: sys1.sys_code,
            plan_start: '2026-07-09',
            plan_end: '2026-07-18',
            actual_start: '2026-07-09',
            actual_end: '2026-07-19',
            register_time: '2026-07-09'
          });
          testSITUATCount++;
        } else if (i === 14 || i === 15) {
          // SIT进行中
          addTest('SIT', reqCode, 1, {
            title: tpl.title,
            status: '测试实施',
            owner: tester1.name,
            impl_system: sys1.sys_code,
            plan_start: '2026-07-09',
            plan_end: '2026-07-18',
            actual_start: '2026-07-09',
            actual_end: null,
            register_time: '2026-07-09'
          });
          testSITUATCount++;
        } else if (i === 16) {
          // UAT进行中
          addTest('UAT', reqCode, 1, {
            title: tpl.title,
            status: '测试实施',
            owner: bizOwner.name,
            impl_system: sys1.sys_code,
            plan_start: '2026-07-26',
            plan_end: '2026-08-02',
            actual_start: '2026-07-26',
            actual_end: null,
            register_time: '2026-07-26'
          });
          testSITUATCount++;
        }
        // i === 17 不生成测试任务（表示刚完成开发还未接测试）
      }
      // ------------------ 开发阶段 (16个) ------------------
      else if (i >= 18 && i <= 33) {
        // 共计 36 个开发任务
        // 12个需求(18-29)各2个 = 24个开发任务
        // 4个需求(30-33)各3个 = 12个开发任务
        const numTasks = (i >= 30) ? 3 : 2;
        for (let d = 1; d <= numTasks; d++) {
          const devUser = developers[(i + d) % developers.length];
          const taskSys = (d === 1) ? sys1.sys_code : (d === 2 && collabDev.length ? collabDev[0] : sys1.sys_code);
          
          const devStatuses = ['开发设计', '开发实施', '单元测试'];
          const curStatus = devStatuses[(i + d) % devStatuses.length];
          const hasStarted = curStatus !== '开发设计';

          addDev(reqCode, d, {
            title: tpl.title,
            status: curStatus,
            owner: devUser.name,
            impl_system: taskSys,
            plan_start: '2026-09-25',
            plan_end: '2026-10-30',
            actual_start: hasStarted ? '2026-09-26' : null,
            actual_end: null,
            register_time: '2026-09-25'
          });
          devTaskCount++;
        }
      }
      // ------------------ 需求阶段 (6个) ------------------
      else {
        // 共计 8 个开发任务
        // 4个需求(34-37)各2个在开发承接状态 = 8个开发任务
        // 2个需求(38-39)没有开发任务
        if (i >= 34 && i <= 37) {
          for (let d = 1; d <= 2; d++) {
            const devUser = developers[(i + d) % developers.length];
            const taskSys = (d === 1) ? sys1.sys_code : sys2.sys_code;

            addDev(reqCode, d, {
              title: tpl.title,
              status: '开发承接',
              owner: devUser.name,
              impl_system: taskSys,
              plan_start: '2026-11-01',
              plan_end: '2026-11-20',
              actual_start: null,
              actual_end: null,
              register_time: '2026-10-28'
            });
            devTaskCount++;
          }
        }
      }
    }

    console.log(`[开发生成完毕] 开发任务总数: ${devTaskCount}`);
    console.log(`[测试生成完毕] 应用组装/用户测试任务总数: ${testSITUATCount}`);
    console.log(`[测试生成完毕] 安全/非功能测试任务总数: ${testSECNFTCount}`);
  });

  // 统计
  const c = (t) => get(`SELECT COUNT(*) AS c FROM ${t}`).c;
  console.log('[测试数据] 已写入：',
    `投产点 ${c('release_point')} / 人员 ${all("SELECT id FROM user WHERE phone LIKE '138%'").length} / 需求 ${c('requirement')} / 开发 ${c('dev_task')} / 测试 ${c('test_task')} / 投产 ${c('release_task')} / 会签 ${c('release_signoff')} / 系统投产 ${c('release_system')} / 附件 ${c('attachment')}`);
}

main();

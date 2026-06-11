/**
 * 文件：scripts/seed-testdata.js
 * 用途：制造覆盖全流程、全场景的测试数据并写入数据库。
 *       含 3 个投产点、多机构、多状态需求/开发/测试(SIT/UAT/NFT/SEC)/投产会签、附件。
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
    'INSERT INTO user (phone, name, org, password_hash, status) VALUES (?,?,?,?,?)',
    phone, name, org, hashPassword('123456'), '启用',
  );
  for (const code of roleCodes) {
    const role = get('SELECT id FROM role WHERE code = ?', code);
    if (role) run('INSERT INTO user_role (user_id, role_id) VALUES (?,?)', res.lastInsertRowid, role.id);
  }
  return res.lastInsertRowid;
}

/** 新增需求 */
function addReq(o) {
  run(
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

function main() {
  tx(() => {
    clearBusiness();

    // ===== 1. 三个投产点 =====
    const rp1 = addReleasePoint('20260815', '常规版本', '8月常规投产窗口', true);   // 当前默认窗口
    const rp2 = addReleasePoint('20260920', '应急版本', '9月应急修复窗口', false);
    const rp3 = addReleasePoint('20261110', '重大版本', '11月重大版本窗口', false);

    // ===== 2. 人员（覆盖各角色，供负责人/会签使用）=====
    addUser('13800000001', '张三', '上海事业群', ['金科开发']);
    addUser('13800000002', '李四', '上海事业群', ['金科测试']);
    addUser('13800000003', '王五', '建信金科', ['金科业务']);
    addUser('13800000004', '赵六', '建信金科', ['金科运维']);
    addUser('13800000005', '朱俊杰', '云南农信', ['农信业务']);
    addUser('13800000006', '钱七', '深圳事业群', ['农信开发']);
    addUser('13800000007', '孙八', '成都事业群', ['农信测试']);
    addUser('13800000008', '周九', '建信金科', ['金科业务', '金科测试']); // 一人多角色

    // ===== 3. 需求 + 各阶段任务 + 投产 =====

    // —— R1：完整闭环（已投产）——
    addReq({
      req_code: 'RC_20260815_001', title: '跨境支付模块优化', summary: '定义基于 SWIFT 标准的新版报文格式，优化大额跨境支付链路。',
      status: '需求完成', req_type: '已有功能的需求变更', propose_dept: '云南农信', proposer: '朱俊杰',
      yn_owner: '朱俊杰', jk_owner: '王五', propose_time: '2026-06-10', register_time: '2026-06-10',
      main: ['W02016', 'W0201F'], rp: rp1,
    });
    addPath('requirement', get("SELECT id FROM requirement WHERE req_code='RC_20260815_001'").id, '需求说明书', '\\\\fileserver\\specs\\跨境支付优化需求说明书.docx');
    const d1a = addDev('RC_20260815_001', 1, { title: '跨境支付模块优化', status: '开发完成', owner: '张三', impl_system: 'W02016', plan_start: '2026-06-15', plan_end: '2026-07-05', actual_start: '2026-06-16', actual_end: '2026-07-08', register_time: '2026-06-15' });
    const d1b = addDev('RC_20260815_001', 2, { title: '跨境支付模块优化', status: '开发完成', owner: '钱七', impl_system: 'W0201F', plan_start: '2026-06-15', plan_end: '2026-07-05', actual_start: '2026-06-15', actual_end: '2026-07-04', register_time: '2026-06-15' });
    addPath('dev', d1a, '概要设计', '\\\\fileserver\\dev\\W02016概要设计.docx');
    addPath('dev', d1a, '单元测试报告', '\\\\fileserver\\dev\\W02016单测报告.pdf');
    addPath('dev', d1b, '概要设计', '\\\\fileserver\\dev\\W0201F概要设计.docx');
    const t1sit = addTest('SIT', 'RC_20260815_001', 1, { title: '跨境支付模块优化', status: '测试完成', owner: '李四', impl_system: 'W02016', plan_start: '2026-07-09', plan_end: '2026-07-18', actual_start: '2026-07-09', actual_end: '2026-07-19', register_time: '2026-07-09' });
    addPath('test', t1sit, '测试方案', '\\\\fileserver\\test\\SIT测试方案.docx');
    addPath('test', t1sit, '测试报告', '\\\\fileserver\\test\\SIT测试报告.pdf');
    const t1nft = addTest('NFT', 'RC_20260815_001', 1, { title: '跨境支付模块优化', status: '测试完成', owner: '李四', impl_system: 'W02016', plan_start: '2026-07-20', plan_end: '2026-07-25', actual_start: '2026-07-20', actual_end: '2026-07-25', register_time: '2026-07-20' });
    addPath('test', t1nft, '测试报告', '\\\\fileserver\\test\\NFT性能报告.pdf');
    const t1uat = addTest('UAT', 'RC_20260815_001', 1, { title: '跨境支付模块优化', status: '测试完成', owner: '王五', impl_system: 'W02016', plan_start: '2026-07-26', plan_end: '2026-08-02', actual_start: '2026-07-26', actual_end: '2026-08-01', register_time: '2026-07-26' });
    addPath('test', t1uat, '测试报告', '\\\\fileserver\\test\\UAT验收报告.pdf');
    addRelease('RC_20260815_001', {
      status: '已投产', owner: '赵六', register_time: '2026-08-05', signTime: '2026-08-06',
      signoffs: {
        金科业务: { result: '已签署', signer: '王五', conclusion: '业务验收无异议' },
        金科开发: { result: '已签署', signer: '张三', conclusion: '开发交付完成' },
        金科测试: { result: '已签署', signer: '李四', conclusion: '测试全部通过' },
        金科运维: { result: '已签署', signer: '赵六', conclusion: '具备上线条件' },
      },
      systems: [
        { code: 'W02016', status: '已投产', time: '2026-08-15' },
        { code: 'W0201F', status: '已投产', time: '2026-08-15' },
      ],
    });
    run("UPDATE requirement SET status='需求完成' WHERE req_code='RC_20260815_001'");

    // —— R2：评审中（含驳回）——
    addReq({
      req_code: 'RC_20260815_002', title: '反洗钱清单规则升级', summary: '升级反洗钱名单匹配规则，提升命中准确率。',
      status: '需求完成', req_type: '已有功能的需求变更', propose_dept: '云南农信', proposer: '朱俊杰',
      yn_owner: '朱俊杰', jk_owner: '王五', propose_time: '2026-06-12', main: ['W10010'], rp: rp1,
    });
    addPath('requirement', get("SELECT id FROM requirement WHERE req_code='RC_20260815_002'").id, '需求说明书', '/specs/反洗钱规则升级.docx');
    addDev('RC_20260815_002', 1, { title: '反洗钱清单规则升级', status: '开发完成', owner: '钱七', impl_system: 'W10010', plan_start: '2026-06-18', plan_end: '2026-07-10', actual_start: '2026-06-18', actual_end: '2026-07-12', register_time: '2026-06-18' });
    addTest('SIT', 'RC_20260815_002', 1, { title: '反洗钱清单规则升级', status: '测试完成', owner: '李四', impl_system: 'W10010', plan_start: '2026-07-13', plan_end: '2026-07-22', actual_start: '2026-07-13', actual_end: '2026-07-22', register_time: '2026-07-13' });
    addTest('UAT', 'RC_20260815_002', 1, { title: '反洗钱清单规则升级', status: '测试完成', owner: '王五', impl_system: 'W10010', plan_start: '2026-07-23', plan_end: '2026-07-30', actual_start: '2026-07-23', actual_end: '2026-07-31', register_time: '2026-07-23' });
    addRelease('RC_20260815_002', {
      status: '待投产', owner: '赵六', register_time: '2026-08-02', signTime: '2026-08-03',
      signoffs: {
        金科业务: { result: '已签署', signer: '王五', conclusion: '同意上线' },
        金科开发: { result: '已签署', signer: '钱七', conclusion: '开发完成' },
        金科测试: { result: '已驳回', signer: '李四', conclusion: '回归用例存在 2 处遗留缺陷，需修复后重测' },
        金科运维: { result: '未签署' },
      },
      systems: [{ code: 'W10010', status: '待投产' }],
    });

    // —— R3：开发进行中 ——
    addReq({
      req_code: 'RC_20260815_003', title: '对公存款利率调整', summary: '按央行最新政策调整对公存款挂牌利率与计息规则。',
      status: '需求完成', req_type: '已有功能的需求变更', propose_dept: '云南农信', proposer: '朱俊杰',
      yn_owner: '朱俊杰', jk_owner: '周九', propose_time: '2026-06-20', main: ['W01812'], rp: rp1,
    });
    addDev('RC_20260815_003', 1, { title: '对公存款利率调整', status: '开发实施', owner: '张三', impl_system: 'W01812', plan_start: '2026-06-25', plan_end: '2026-07-20', actual_start: '2026-06-26', actual_end: null, register_time: '2026-06-25' });

    // —— R4：需求分析阶段 ——
    addReq({
      req_code: 'RC_20260815_004', title: '财务报表口径变更', summary: '调整月度财务报表的科目归集口径。',
      status: '需求分析', req_type: '新增需求', propose_dept: '云南农信', proposer: '朱俊杰',
      yn_owner: '朱俊杰', propose_time: '2026-07-01', main: ['YN0010'], rp: rp1,
    });

    // —— R5（RP2 应急版本）：含安全测试、测试进行中 ——
    addReq({
      req_code: 'RC_20260920_001', title: '零售贷款核心紧急补丁', summary: '修复零售贷款账务核心的对账偏差缺陷。',
      status: '需求完成', req_type: '缺陷修复', propose_dept: '云南农信', proposer: '朱俊杰',
      yn_owner: '朱俊杰', jk_owner: '王五', propose_time: '2026-08-20', main: ['W0201C'], collabTest: ['W0201D'], rp: rp2,
    });
    addPath('requirement', get("SELECT id FROM requirement WHERE req_code='RC_20260920_001'").id, '需求说明书', '/specs/零售贷款补丁.docx');
    addDev('RC_20260920_001', 1, { title: '零售贷款核心紧急补丁', status: '开发完成', owner: '钱七', impl_system: 'W0201C', plan_start: '2026-08-22', plan_end: '2026-08-30', actual_start: '2026-08-22', actual_end: '2026-08-29', register_time: '2026-08-22' });
    addTest('SIT', 'RC_20260920_001', 1, { title: '零售贷款核心紧急补丁', status: '测试完成', owner: '李四', impl_system: 'W0201C', plan_start: '2026-08-31', plan_end: '2026-09-05', actual_start: '2026-08-31', actual_end: '2026-09-05', register_time: '2026-08-31' });
    addTest('SEC', 'RC_20260920_001', 1, { title: '零售贷款核心紧急补丁', status: '测试实施', owner: '孙八', impl_system: 'W0201C', plan_start: '2026-09-06', plan_end: '2026-09-10', actual_start: '2026-09-06', actual_end: null, register_time: '2026-09-06' });
    addTest('UAT', 'RC_20260920_001', 1, { title: '零售贷款核心紧急补丁', status: '测试承接', owner: '王五', impl_system: 'W0201C', plan_start: '2026-09-11', plan_end: '2026-09-15', actual_start: null, actual_end: null, register_time: '2026-09-11' });

    // —— R6（RP2）：需求登记 ——
    addReq({
      req_code: 'RC_20260920_002', title: '总账系统结账流程优化', summary: '优化月末结账批量任务的并行度。',
      status: '需求登记', req_type: '新增需求', propose_dept: '云南农信', proposer: '朱俊杰',
      propose_time: '2026-08-25', main: ['W10534'], rp: rp2,
    });

    // —— R7（RP3 重大版本）：多系统拆分 + 协同系统 ——
    addReq({
      req_code: 'RC_20261110_001', title: 'P3 对公信贷领域重构', summary: '重构对公信贷领域核心模型，涉及多系统协同改造。',
      status: '需求分析', req_type: '新增需求', propose_dept: '云南农信', proposer: '朱俊杰',
      yn_owner: '朱俊杰', jk_owner: '周九', propose_time: '2026-09-15',
      main: ['WP3016'], collabDev: ['W02016'], collabTest: ['W0201C'], rp: rp3,
    });
    addDev('RC_20261110_001', 1, { title: 'P3 对公信贷领域重构', status: '开发承接', owner: '张三', impl_system: 'WP3016', plan_start: '2026-09-25', plan_end: '2026-10-30', actual_start: null, actual_end: null, register_time: '2026-09-25' });
    addDev('RC_20261110_001', 2, { title: 'P3 对公信贷领域重构', status: '开发承接', owner: '钱七', impl_system: 'W02016', plan_start: '2026-09-25', plan_end: '2026-10-30', actual_start: null, actual_end: null, register_time: '2026-09-25' });

    // —— R8（RP3）：需求登记 ——
    addReq({
      req_code: 'RC_20261110_002', title: '反洗钱计算子系统升级', summary: '升级反洗钱计算子系统的指标引擎。',
      status: '需求登记', req_type: '新增需求', propose_dept: '云南农信', proposer: '朱俊杰',
      propose_time: '2026-09-18', main: ['WP901B'], rp: rp3,
    });
  });

  // 统计
  const c = (t) => get(`SELECT COUNT(*) AS c FROM ${t}`).c;
  console.log('[测试数据] 已写入：',
    `投产点 ${c('release_point')} / 人员 ${all("SELECT id FROM user WHERE phone LIKE '138%'").length} / 需求 ${c('requirement')} / 开发 ${c('dev_task')} / 测试 ${c('test_task')} / 投产 ${c('release_task')} / 会签 ${c('release_signoff')} / 系统投产 ${c('release_system')} / 附件 ${c('attachment')}`);
}

main();

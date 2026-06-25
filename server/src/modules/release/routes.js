/**
 * 文件：modules/release/routes.js
 * 用途：投产审批模块接口。审批对象为「投产申请」中所选择的需求/问题（逐条展开），
 *       提供列表、详情（含评审会签、投产信息、关联制品情况）、负责人/状态/评审状态更新、会签签署。
 * 作者：hengguan
 * 说明：投产任务（release_task）以实体编号（req_code 列，存需求编号或问题编号）为唯一键，entity_type 区分类型；
 *       首次打开详情时惰性创建投产任务与会签项（不再有「UAT 终态方可发起」的限制）。
 *       「各系统投产登记」改为「关联制品情况」：读取引用了该需求/问题的投产申请制品信息。
 */

import { get, all, run, tx } from '../../db/index.js';
import { auditUpdate } from '../../lib/audit.js';
import { windowIds } from '../../lib/window.js';
import { ok, notFound, badRequest, forbidden } from '../../lib/http.js';
import { exportXlsx } from '../../lib/excel.js';
import { signatureDataUrl } from '../../lib/signature.js';
import { buildReleaseWordDoc } from '../../lib/release-word.js';
import { getPamsIssue, hasPamsIssue, pamsIssueMapByCode } from '../../lib/pams-issues.js';

/** 读取被打标为"会签角色"的角色列表 */
function signoffRoles() {
  return all('SELECT id, name FROM role WHERE is_signoff_role = 1 ORDER BY id');
}

/** 汇总某投产任务的会签进度 */
function signoffSummary(releaseTaskId) {
  const rows = all('SELECT result FROM release_signoff WHERE release_task_id = ?', releaseTaskId);
  const total = rows.length;
  const signed = rows.filter((r) => r.result === '已签署').length;
  const rejected = rows.filter((r) => r.result === '已驳回').length;
  return { total, signed, rejected };
}

// 手动设置后不被自动逻辑覆盖的评审状态
const REVIEW_MANUAL = ['评审撤销', '应急审批'];

/**
 * 重算评审状态：任一会签驳回 -> 评审拒绝；全部已签署 -> 评审同意；否则 待评审。
 * 手动状态（评审撤销/应急审批）不被覆盖。返回最终评审状态。
 */
function recomputeReviewStatus(releaseTaskId) {
  const rt = get('SELECT review_status FROM release_task WHERE id = ?', releaseTaskId);
  if (!rt) return null;
  if (REVIEW_MANUAL.includes(rt.review_status)) return rt.review_status;
  const { total, signed, rejected } = signoffSummary(releaseTaskId);
  let next = '待评审';
  if (rejected > 0) next = '评审拒绝';
  else if (total > 0 && signed === total) next = '评审同意';
  if (next !== rt.review_status) {
    run(`UPDATE release_task SET review_status=?, updated_at=datetime('now','localtime') WHERE id=?`, next, releaseTaskId);
  }
  return next;
}

/** 判定实体类型：需求 / 问题 / 未知 */
function classifyEntity(code) {
  if (get('SELECT 1 FROM requirement WHERE req_code = ?', code)) return 'requirement';
  if (hasPamsIssue(code)) return 'issue';
  return 'unknown';
}

/**
 * 惰性获取/创建投产任务：首次打开详情时自动创建投产任务与会签项（无 UAT 终态限制）。
 */
function ensureReleaseTask(code, entityType, operatorName) {
  let rt = get('SELECT * FROM release_task WHERE req_code = ?', code);
  if (rt) return rt;
  return tx(() => {
    const res = run(
      `INSERT INTO release_task (req_code, entity_type, status, review_status, registrar, register_time) VALUES (?,?,?,?,?,?)`,
      code, entityType || 'unknown', '待投产', '待评审', operatorName || null, new Date().toISOString().slice(0, 10),
    );
    const rtId = res.lastInsertRowid;
    for (const role of signoffRoles()) {
      run('INSERT INTO release_signoff (release_task_id, role_id, role_name, result) VALUES (?,?,?,?)',
        rtId, role.id, role.name, '未签署');
    }
    return get('SELECT * FROM release_task WHERE id = ?', rtId);
  });
}

/** 读取引用了该需求/问题编号的投产申请制品信息（关联制品情况） */
function entityArtifacts(code, sysMap) {
  const rows = all(
    `SELECT ra.* FROM release_apply ra
       WHERE EXISTS (SELECT 1 FROM json_each(ra.ref_codes) WHERE value = ?)
     ORDER BY ra.id DESC`,
    code,
  );
  return rows.map((r) => {
    let units = [];
    try { units = r.delivery_units ? JSON.parse(r.delivery_units) : []; } catch { units = []; }
    return {
      id: r.id,
      change_code: r.change_code,
      change_system: r.change_system,
      change_system_name: r.change_system ? `${r.change_system} - ${sysMap[r.change_system] || r.change_system}` : null,
      impl_org: r.impl_org,
      change_content: r.change_content,
      units,
    };
  });
}

/**
 * 计算投产审批清单：从投产申请的 ref_codes 展开为逐条需求/问题，附投产任务/评审/会签进度。
 * @returns {Array} 完整行集合（未分页）
 */
function computeEntities(windowIdList) {
  let applies;
  if (windowIdList.length) {
    const ph = windowIdList.map(() => '?').join(',');
    applies = all(`SELECT id, ref_codes, release_point_id, change_code, impl_org FROM release_apply WHERE release_point_id IN (${ph})`, ...windowIdList);
  } else {
    applies = all('SELECT id, ref_codes, release_point_id, change_code, impl_org FROM release_apply');
  }

  const codeMap = new Map(); // code -> { applyPointId, implOrg, changeCode }
  for (const ap of applies) {
    let refs = [];
    try { refs = ap.ref_codes ? JSON.parse(ap.ref_codes) : []; } catch { refs = []; }
    for (const code of refs) {
      if (!code) continue;
      const cur = codeMap.get(code);
      if (!cur) {
        // 首次记录：投产点取首个申请；实施机构暂以该申请填充（后续遇更小申请编号再覆盖）
        codeMap.set(code, { applyPointId: ap.release_point_id, implOrg: ap.impl_org || null, changeCode: ap.change_code || '' });
      } else if (ap.change_code && (!cur.changeCode || String(ap.change_code) < String(cur.changeCode))) {
        // 实施机构取「申请编号最小」的投产申请
        cur.implOrg = ap.impl_org || null;
        cur.changeCode = ap.change_code;
      }
    }
  }

  const rps = all('SELECT id, release_date FROM release_point');
  const rpMap = {};
  for (const rp of rps) rpMap[rp.id] = rp.release_date;

  // 会签角色数：未发起的实体会签进度按 0/角色数 展示（与首次打开详情后惰性创建的会签项数一致）
  const signoffRoleCount = get('SELECT COUNT(*) AS c FROM role WHERE is_signoff_role = 1')?.c || 0;
  const issueMap = pamsIssueMapByCode([...codeMap.keys()], 'issue_id, summary, status');

  const list = [];
  for (const [code, info] of codeMap) {
    const req = get('SELECT req_code, title, status, release_point_id FROM requirement WHERE req_code = ?', code);
    const issue = req ? null : issueMap.get(code);
    const type = req ? 'requirement' : (issue ? 'issue' : 'unknown');
    const title = req ? req.title : (issue ? issue.summary : '');
    const pointId = req ? req.release_point_id : info.applyPointId;
    const releaseDate = rpMap[pointId] || null;

    const rt = get('SELECT * FROM release_task WHERE req_code = ?', code);
    // 未发起时按默认基线展示：投产状态=待投产、评审状态=待评审、会签进度=签0/角色数
    const summary = rt ? signoffSummary(rt.id) : { total: signoffRoleCount, signed: 0, rejected: 0 };

    list.push({
      entity_type: type,
      code,
      title,
      impl_org: info.implOrg || null,
      release_point_id: pointId || null,
      release_date: releaseDate,
      release_status: rt?.status || '待投产',
      review_status: rt?.review_status || '待评审',
      signoff: summary,
      initiated: !!rt,
    });
  }

  // 默认按计划投产点倒序、再按编号排序
  list.sort((a, b) => {
    const da = a.release_date || '';
    const db = b.release_date || '';
    if (da !== db) return db.localeCompare(da);
    return String(b.code).localeCompare(String(a.code));
  });
  return list;
}

/** 内存筛选：编号(like) / 标题概述(like) / 计划投产点(in) / 投产状态(in) / 评审状态(in) / 实施机构(in) */
function applyFilters(rows, filters) {
  let out = rows;
  for (const f of (filters || [])) {
    if (!f || f.value === undefined || f.value === null || f.value === '') continue;
    if (f.field === 'code') {
      const kw = String(f.value).toLowerCase();
      out = out.filter((r) => String(r.code).toLowerCase().includes(kw));
    } else if (f.field === 'content') {
      const kw = String(f.value).toLowerCase();
      out = out.filter((r) => String(r.title || '').toLowerCase().includes(kw));
    } else if (f.field === 'release_point_id') {
      const vals = (Array.isArray(f.value) ? f.value : [f.value]).map(Number);
      out = out.filter((r) => vals.includes(Number(r.release_point_id)));
    } else if (f.field === 'status') {
      const vals = Array.isArray(f.value) ? f.value : [f.value];
      out = out.filter((r) => vals.includes(r.release_status));
    } else if (f.field === 'review_status') {
      const vals = Array.isArray(f.value) ? f.value : [f.value];
      out = out.filter((r) => vals.includes(r.review_status));
    } else if (f.field === 'impl_org') {
      const vals = Array.isArray(f.value) ? f.value : [f.value];
      out = out.filter((r) => vals.includes(r.impl_org));
    }
  }
  return out;
}

export default async function releaseRoutes(fastify) {
  // 列表：投产申请所选需求/问题逐条展开
  fastify.post('/release/list', { preHandler: fastify.requirePerm('release', 'view') }, async (request) => {
    const body = request.body || {};
    const all0 = computeEntities(windowIds(body));
    const filtered = applyFilters(all0, body.filters);

    const page = Number(body.page) || 1;
    const pageSize = Number(body.pageSize) || 10;
    const start = (page - 1) * pageSize;
    const list = pageSize > 0 ? filtered.slice(start, start + pageSize) : filtered;
    return ok({ list, total: filtered.length, page, pageSize });
  });

  // 详情：首次打开惰性创建投产任务；返回实体信息（需求或问题）+ 会签 + 关联制品
  fastify.get('/release/:code', { preHandler: fastify.requirePerm('release', 'view') }, async (request) => {
    const code = request.params.code;
    const entityType = classifyEntity(code);
    const rt = ensureReleaseTask(code, entityType, request.currentUser?.name);
    const signoffs = all('SELECT * FROM release_signoff WHERE release_task_id = ? ORDER BY id', rt.id)
      .map((s) => ({ ...s, signature_image: signatureDataUrl(s.signature_path) }));

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;
    const artifacts = entityArtifacts(code, sysMap);

    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    let entity = { type: entityType, code };
    let taskStatuses = null;

    if (entityType === 'requirement') {
      const req = get('SELECT * FROM requirement WHERE req_code = ?', code);
      entity = {
        type: 'requirement', code,
        title: req?.title || code,
        summary: req?.summary || '',
        status: req?.status || null,
        release_date: rpMap[req?.release_point_id] || null,
      };
      // 阶段任务：返回任务标识(id/编号/系统/状态)，供详情页点击状态标签直达对应任务弹窗
      const tt = (type) => all('SELECT id, task_code, impl_system, status FROM test_task WHERE req_code = ? AND test_type = ? ORDER BY id', code, type);
      taskStatuses = {
        dev: all('SELECT id, task_code, impl_system, status FROM dev_task WHERE req_code = ? ORDER BY id', code),
        sit: tt('SIT'),
        uat: tt('UAT'),
        nft: tt('NFT'),
        sec: tt('SEC'),
      };
    } else if (entityType === 'issue') {
      const issue = getPamsIssue(code);
      // 问题无自身计划投产点，取引用它的投产申请的计划投产点
      const ap = get(
        `SELECT release_point_id FROM release_apply ra
           WHERE EXISTS (SELECT 1 FROM json_each(ra.ref_codes) WHERE value = ?) ORDER BY ra.id LIMIT 1`,
        code,
      );
      entity = {
        type: 'issue', code,
        summary: issue?.summary || '',
        details: issue?.details || '',
        status: issue?.status || null,
        release_date: rpMap[ap?.release_point_id] || null,
      };
    }

    return ok({ entityType, entity, releaseTask: rt, signoffs, artifacts, taskStatuses });
  });

  // 更新投产任务负责人/投产状态/评审状态
  fastify.put('/release/:code', { preHandler: fastify.requirePerm('release', 'edit') }, async (request) => {
    const rt = get('SELECT * FROM release_task WHERE req_code = ?', request.params.code);
    if (!rt) throw notFound('投产任务未发起');
    const { owner, status, review_status } = request.body || {};

    if (review_status !== undefined) {
      const valid = get('SELECT 1 FROM dict_item WHERE category = ? AND attr_value = ?', 'review_status', review_status);
      if (!valid) throw badRequest('评审状态取值非法');
    }

    const updateData = {};
    if (owner !== undefined) updateData.owner = owner;
    if (status !== undefined) updateData.status = status;
    if (review_status !== undefined) updateData.review_status = review_status;

    const keys = Object.keys(updateData);
    if (keys.length > 0) {
      run(
        `UPDATE release_task SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
        ...keys.map((k) => updateData[k]), rt.id,
      );
      const labels = { owner: '投产负责人', status: '投产状态', review_status: '评审状态' };
      auditUpdate('release', rt.id, rt.req_code, request.currentUser?.name, rt, updateData, labels);
    }
    return ok({ id: rt.id });
  });

  // 会签签署
  fastify.post('/release/signoff/:id', { preHandler: fastify.requirePerm('release', 'release.signoff') }, async (request) => {
    const id = request.params.id;
    const so = get('SELECT * FROM release_signoff WHERE id = ?', id);
    if (!so) throw notFound('会签项不存在');
    const { result, conclusion, signatureId } = request.body || {};
    if (!['已签署', '已驳回', '未签署'].includes(result)) throw badRequest('签署状态非法');
    if (!request.currentUser.is_super && so.role_id) {
      const hasRole = get('SELECT 1 FROM user_role WHERE user_id = ? AND role_id = ?', request.currentUser.id, so.role_id);
      if (!hasRole) throw forbidden(`仅【${so.role_name}】角色可签署该项`);
    }
    // 签名：传入 signatureId 时校验归属当前用户并记录其路径；未传则沿用原签名
    let signaturePath = so.signature_path || null;
    if (signatureId) {
      const sig = get('SELECT * FROM user_signature WHERE id = ?', signatureId);
      if (!sig || sig.user_id !== request.currentUser.id) throw badRequest('签名无效');
      signaturePath = sig.stored_path;
    }
    run(
      `UPDATE release_signoff SET result=?, conclusion=?, signature_path=?, signer_user_id=?, signer_name=?, sign_time=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?`,
      result, conclusion || null, signaturePath, request.currentUser?.id, request.currentUser?.name, id,
    );
    auditUpdate('release', so.release_task_id, so.role_name, request.currentUser?.name,
      { r: so.result }, { r: result }, { r: `会签-${so.role_name}` });

    const beforeReview = get('SELECT review_status FROM release_task WHERE id = ?', so.release_task_id)?.review_status;
    const afterReview = recomputeReviewStatus(so.release_task_id);
    if (beforeReview !== afterReview) {
      const rt = get('SELECT req_code FROM release_task WHERE id = ?', so.release_task_id);
      auditUpdate('release', so.release_task_id, rt?.req_code, request.currentUser?.name,
        { v: beforeReview }, { v: afterReview }, { v: '评审状态' });
    }
    return ok(null, '签署完成');
  });

  // 导出 Word 详情（单条审批对象的完整信息）
  fastify.get('/release/export-word/:code', { preHandler: fastify.requirePerm('release', 'view') }, async (request, reply) => {
    const code = request.params.code;
    const entityType = classifyEntity(code);
    const rt = ensureReleaseTask(code, entityType, request.currentUser?.name);
    const signoffs = all('SELECT * FROM release_signoff WHERE release_task_id = ? ORDER BY id', rt.id)
      .map((s) => ({ ...s, signature_image: signatureDataUrl(s.signature_path) }));

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;
    const artifacts = entityArtifacts(code, sysMap);

    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    let entity = { type: entityType, code };
    let devTasksFull = [];
    let testTasksFull = [];

    if (entityType === 'requirement') {
      const req = get('SELECT * FROM requirement WHERE req_code = ?', code);
      entity = {
        type: 'requirement', code,
        title: req?.title || code,
        summary: req?.summary || '',
        status: req?.status || null,
        yn_owner: req?.yn_owner || null,
        jk_owner: req?.jk_owner || null,
        release_date: rpMap[req?.release_point_id] || null,
      };
      devTasksFull = all(
        'SELECT id, task_code, task_name, content, owner, status, impl_system FROM dev_task WHERE req_code = ? ORDER BY id',
        code,
      );
      testTasksFull = all(
        'SELECT id, task_code, task_name, test_type, owner, status, impl_system FROM test_task WHERE req_code = ? ORDER BY id',
        code,
      );
    } else if (entityType === 'issue') {
      const issue = getPamsIssue(code);
      const ap = get(
        `SELECT release_point_id FROM release_apply ra
           WHERE EXISTS (SELECT 1 FROM json_each(ra.ref_codes) WHERE value = ?) ORDER BY ra.id LIMIT 1`,
        code,
      );
      entity = {
        type: 'issue', code,
        summary: issue?.summary || '',
        details: issue?.details || '',
        status: issue?.status || null,
        release_date: rpMap[ap?.release_point_id] || null,
      };
    }

    const detail = { entityType, entity, releaseTask: rt, signoffs, artifacts };
    const buf = await buildReleaseWordDoc(detail, devTasksFull, testTasksFull);

    const filename = `版本发布评审单_${code}.docx`;
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
    return reply.send(buf);
  });

  // 导出
  fastify.post('/release/export', { preHandler: fastify.requirePerm('release', 'export') }, async (request, reply) => {
    const body = request.body || {};
    const rows = applyFilters(computeEntities(windowIds(body)), body.filters);

    const cols = [
      { key: 'impl_org', title: '实施机构' },
      { key: 'code', title: '需求/问题编号' },
      { key: 'entity_label', title: '类型' },
      { key: 'title', title: '需求标题/问题概述' },
      { key: 'release_date', title: '计划投产点' },
      { key: 'release_status', title: '投产状态' },
      { key: 'review_status', title: '评审状态' },
      { key: 'signoff_progress', title: '会签进度' },
    ];

    const mapped = rows.map((r) => ({
      impl_org: r.impl_org || '',
      code: r.code,
      entity_label: r.entity_type === 'requirement' ? '需求' : (r.entity_type === 'issue' ? '问题' : '其他'),
      title: r.title,
      release_date: r.release_date || '',
      release_status: r.release_status,
      review_status: r.review_status || '',
      signoff_progress: r.signoff.total ? `签 ${r.signoff.signed} 驳 ${r.signoff.rejected} / ${r.signoff.total}` : '未发起',
    }));

    const buf = await exportXlsx(cols, mapped, '投产审批清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=release_approval.xlsx');
    return reply.send(buf);
  });
}

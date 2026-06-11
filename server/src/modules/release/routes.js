/**
 * 文件：modules/release/routes.js
 * 用途：投产管理模块接口。投产任务初始化（生成会签项与各系统投产登记项）、会签签署、
 *       系统投产登记、列表与详情。当所有系统投产状态为终态时，需求投产状态自动置为终态。
 * 作者：hengguan
 * 说明：会签角色取自 app_config['release.signoffRoles']；用户测试(UAT)达终态后方可发起投产评审。
 */

import { get, all, run, tx } from '../../db/index.js';
import { isTerminalStatus } from '../../lib/status.js';
import { auditUpdate } from '../../lib/audit.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, notFound, badRequest, forbidden } from '../../lib/http.js';

const SYS_TERMINAL = '已投产';

/** 读取被打标为"会签角色"的角色列表 */
function signoffRoles() {
  return all('SELECT id, name FROM role WHERE is_signoff_role = 1 ORDER BY id');
}

/** 判断需求的 UAT 是否已全部达终态（存在 UAT 且均终态） */
function uatAllTerminal(reqCode) {
  const tasks = all('SELECT status FROM test_task WHERE req_code = ? AND test_type = ?', reqCode, 'UAT');
  if (!tasks.length) return false;
  return tasks.every((t) => isTerminalStatus(t.status));
}

/** 汇总某投产任务的会签进度 */
function signoffSummary(releaseTaskId) {
  const rows = all('SELECT result FROM release_signoff WHERE release_task_id = ?', releaseTaskId);
  const total = rows.length;
  const signed = rows.filter((r) => r.result === '已签署').length;
  const rejected = rows.filter((r) => r.result === '已驳回').length;
  return { total, signed, rejected };
}

/** 重算需求投产终态：所有系统终态 -> release_task 状态置为已投产 */
function recomputeReleaseStatus(releaseTaskId) {
  const systems = all('SELECT status FROM release_system WHERE release_task_id = ?', releaseTaskId);
  if (systems.length && systems.every((s) => s.status === SYS_TERMINAL)) {
    run(`UPDATE release_task SET status=?, updated_at=datetime('now','localtime') WHERE id=?`, SYS_TERMINAL, releaseTaskId);
  }
}

export default async function releaseRoutes(fastify) {
  // 列表：当前投产窗口下所有需求 + 投产/会签进度
  fastify.post('/release/list', { preHandler: fastify.requirePerm('release', 'view') }, async (request) => {
    const body = request.body || {};
    const { keyword } = body;
    let sql = 'SELECT * FROM requirement';
    const params = [];
    const wh = [];
    const win = inClause('release_point_id', windowIds(body));
    if (win.where) { wh.push(win.where); params.push(...win.params); }
    if (keyword) { wh.push('(req_code LIKE ? OR title LIKE ?)'); params.push(`%${keyword}%`, `%${keyword}%`); }
    if (wh.length) sql += ' WHERE ' + wh.join(' AND ');
    sql += ' ORDER BY id DESC';
    const reqs = all(sql, ...params);

    // 查询所有投产点在内存中进行映射
    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) {
      rpMap[rp.id] = rp.release_date;
    }

    const list = reqs.map((r) => {
      const rt = get('SELECT * FROM release_task WHERE req_code = ?', r.req_code);
      const summary = rt ? signoffSummary(rt.id) : { total: 0, signed: 0, rejected: 0 };
      return {
        req_code: r.req_code,
        title: r.title,
        release_date: rpMap[r.release_point_id] || null,
        release_status: rt?.status || '未发起',
        owner: rt?.owner || null,
        uat_ready: uatAllTerminal(r.req_code),
        signoff: summary,
        initiated: !!rt,
      };
    });
    return ok({ list, total: list.length });
  });

  // 详情
  fastify.get('/release/:reqCode', { preHandler: fastify.requirePerm('release', 'view') }, async (request) => {
    const reqCode = request.params.reqCode;
    const req = get('SELECT * FROM requirement WHERE req_code = ?', reqCode);
    if (!req) throw notFound('需求不存在');
    const rt = get('SELECT * FROM release_task WHERE req_code = ?', reqCode);
    const systems = rt ? all('SELECT * FROM release_system WHERE release_task_id = ? ORDER BY id', rt.id) : [];
    const signoffs = rt ? all('SELECT * FROM release_signoff WHERE release_task_id = ? ORDER BY id', rt.id) : [];
    return ok({
      requirement: { req_code: req.req_code, title: req.title },
      releaseTask: rt || null,
      systems, signoffs,
      uatReady: uatAllTerminal(reqCode),
    });
  });

  // 初始化投产任务（生成会签项 + 各系统登记项）
  fastify.post('/release/:reqCode/init', { preHandler: fastify.requirePerm('release', 'release.register') }, async (request) => {
    const reqCode = request.params.reqCode;
    const req = get('SELECT * FROM requirement WHERE req_code = ?', reqCode);
    if (!req) throw notFound('需求不存在');
    if (!uatAllTerminal(reqCode)) throw badRequest('用户测试(UAT)全部达终态后方可发起投产评审');
    if (get('SELECT id FROM release_task WHERE req_code = ?', reqCode)) throw badRequest('该需求投产任务已发起');

    const main = req.main_systems ? JSON.parse(req.main_systems) : [];
    const collab = req.collab_dev_systems ? JSON.parse(req.collab_dev_systems) : [];
    const sysCodes = [...new Set([...main, ...collab])];

    const id = tx(() => {
      const res = run(
        `INSERT INTO release_task (req_code, status, registrar, register_time) VALUES (?,?,?,?)`,
        reqCode, '待投产', request.currentUser?.name, new Date().toISOString().slice(0, 10),
      );
      const rtId = res.lastInsertRowid;
      // 会签项：按系统设置中"会签角色"打标生成
      const roles = signoffRoles();
      if (!roles.length) throw badRequest('尚未在【系统设置-人员配置-角色配置】中打标任何会签角色');
      for (const role of roles) {
        run('INSERT INTO release_signoff (release_task_id, role_id, role_name, result) VALUES (?,?,?,?)',
          rtId, role.id, role.name, '未签署');
      }
      // 系统登记项
      for (const code of sysCodes) {
        const sys = get('SELECT * FROM system WHERE sys_code = ?', code);
        run('INSERT INTO release_system (release_task_id, system_code, impl_org, status) VALUES (?,?,?,?)',
          rtId, code, sys?.org || null, '待投产');
      }
      return rtId;
    });
    return ok({ id }, '投产评审已发起');
  });

  // 更新投产任务负责人
  fastify.put('/release/:reqCode', { preHandler: fastify.requirePerm('release', 'edit') }, async (request) => {
    const rt = get('SELECT * FROM release_task WHERE req_code = ?', request.params.reqCode);
    if (!rt) throw notFound('投产任务未发起');
    const { owner } = request.body || {};
    run(`UPDATE release_task SET owner=?, updated_at=datetime('now','localtime') WHERE id=?`, owner ?? rt.owner, rt.id);
    auditUpdate('release', rt.id, rt.req_code, request.currentUser?.name, rt, { owner }, { owner: '投产负责人' });
    return ok({ id: rt.id });
  });

  // 会签签署
  fastify.post('/release/signoff/:id', { preHandler: fastify.requirePerm('release', 'release.signoff') }, async (request) => {
    const id = request.params.id;
    const so = get('SELECT * FROM release_signoff WHERE id = ?', id);
    if (!so) throw notFound('会签项不存在');
    const { result, conclusion } = request.body || {};
    if (!['已签署', '已驳回', '未签署'].includes(result)) throw badRequest('签署状态非法');
    // 仅具备对应会签角色的人员（或超管）可签署/驳回
    if (!request.currentUser.is_super && so.role_id) {
      const hasRole = get('SELECT 1 FROM user_role WHERE user_id = ? AND role_id = ?', request.currentUser.id, so.role_id);
      if (!hasRole) throw forbidden(`仅【${so.role_name}】角色可签署该项`);
    }
    run(
      `UPDATE release_signoff SET result=?, conclusion=?, signer_user_id=?, signer_name=?, sign_time=datetime('now','localtime'), updated_at=datetime('now','localtime') WHERE id=?`,
      result, conclusion || null, request.currentUser?.id, request.currentUser?.name, id,
    );
    auditUpdate('release', so.release_task_id, so.role_name, request.currentUser?.name,
      { r: so.result }, { r: result }, { r: `会签-${so.role_name}` });
    return ok(null, '签署完成');
  });

  // 系统投产登记
  fastify.put('/release/system/:id', { preHandler: fastify.requirePerm('release', 'release.register') }, async (request) => {
    const id = request.params.id;
    const rs = get('SELECT * FROM release_system WHERE id = ?', id);
    if (!rs) throw notFound('系统登记项不存在');
    const { actual_release_time, status } = request.body || {};
    run(
      `UPDATE release_system SET actual_release_time=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
      actual_release_time ?? rs.actual_release_time, status ?? rs.status, id,
    );
    auditUpdate('release', rs.release_task_id, rs.system_code, request.currentUser?.name,
      { s: rs.status, t: rs.actual_release_time }, { s: status, t: actual_release_time },
      { s: `系统${rs.system_code}投产状态`, t: `系统${rs.system_code}投产时间` });
    recomputeReleaseStatus(rs.release_task_id);
    return ok({ id });
  });
}

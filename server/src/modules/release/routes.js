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
import { exportXlsx } from '../../lib/excel.js';

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

export default async function releaseRoutes(fastify) {
  // 列表：当前投产窗口下所有需求 + 投产/会签进度
  fastify.post('/release/list', { preHandler: fastify.requirePerm('release', 'view') }, async (request) => {
    const body = request.body || {};
    
    const wh = [];
    const params = [];
    let hasReleasePointFilter = false;
    
    // 提取并处理自定义/复杂字段
    const filters = Array.isArray(body.filters) ? body.filters : [];
    for (const f of filters) {
      if (!f || f.value === undefined || f.value === null || f.value === '') continue;
      
      if (f.field === 'req_code') {
        wh.push('req_code LIKE ?');
        params.push(`%${f.value}%`);
      } else if (f.field === 'content') {
        wh.push('(title LIKE ? OR summary LIKE ?)');
        params.push(`%${f.value}%`, `%${f.value}%`);
      } else if (f.field === 'release_point_id') {
        hasReleasePointFilter = true;
        const ids = Array.isArray(f.value) ? f.value : [f.value];
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',');
          wh.push(`release_point_id IN (${placeholders})`);
          params.push(...ids);
        }
      } else if (f.field === 'org') {
        const orgs = Array.isArray(f.value) ? f.value : [f.value];
        if (orgs.length) {
          const placeholders = orgs.map(() => '?').join(',');
          const sqlExpr = `
            COALESCE(
              (
                SELECT impl_org FROM dev_task 
                WHERE dev_task.req_code = requirement.req_code 
                  AND dev_task.impl_system IN (SELECT value FROM json_each(requirement.main_systems))
                  AND dev_task.impl_org IS NOT NULL AND dev_task.impl_org != ''
                ORDER BY id ASC LIMIT 1
              ),
              (
                SELECT org FROM system 
                WHERE sys_code = (SELECT value FROM json_each(requirement.main_systems) LIMIT 1)
                  AND org IS NOT NULL AND org != ''
              ),
              requirement.propose_dept,
              '未分配机构'
            )
          `;
          wh.push(`${sqlExpr} IN (${placeholders})`);
          params.push(...orgs);
        }
      } else if (f.field === 'status') {
        const statusList = Array.isArray(f.value) ? f.value : [f.value];
        if (statusList.length) {
          const hasUninitiated = statusList.includes('未发起');
          const activeStatuses = statusList.filter(s => s !== '未发起');
          if (hasUninitiated) {
            if (activeStatuses.length) {
              const placeholders = activeStatuses.map(() => '?').join(',');
              wh.push(`(req_code NOT IN (SELECT req_code FROM release_task) OR req_code IN (SELECT req_code FROM release_task WHERE status IN (${placeholders})))`);
              params.push(...activeStatuses);
            } else {
              wh.push(`req_code NOT IN (SELECT req_code FROM release_task)`);
            }
          } else {
            const placeholders = activeStatuses.map(() => '?').join(',');
            wh.push(`req_code IN (SELECT req_code FROM release_task WHERE status IN (${placeholders}))`);
            params.push(...activeStatuses);
          }
        }
      } else if (f.field === 'owners') {
        const owners = Array.isArray(f.value) ? f.value : [f.value];
        if (owners.length) {
          const placeholders = owners.map(() => '?').join(',');
          wh.push(`req_code IN (SELECT req_code FROM release_task WHERE owner IN (${placeholders}))`);
          params.push(...owners);
        }
      } else if (f.field === 'systems') {
        const sysCodes = Array.isArray(f.value) ? f.value : [f.value];
        if (sysCodes.length) {
          const placeholders = sysCodes.map(() => '?').join(',');
          wh.push(`(
            EXISTS (SELECT 1 FROM json_each(requirement.main_systems) WHERE value IN (${placeholders})) OR
            EXISTS (SELECT 1 FROM json_each(requirement.collab_dev_systems) WHERE value IN (${placeholders})) OR
            EXISTS (SELECT 1 FROM json_each(requirement.collab_test_systems) WHERE value IN (${placeholders}))
          )`);
          params.push(...sysCodes, ...sysCodes, ...sysCodes);
        }
      }
    }
    
    // 默认的投产窗口过滤
    if (!hasReleasePointFilter) {
      const win = inClause('release_point_id', windowIds(body));
      if (win.where) {
        wh.push(win.where);
        params.push(...win.params);
      }
    }
    
    let sql = 'SELECT * FROM requirement';
    if (wh.length) {
      sql += ' WHERE ' + wh.join(' AND ');
    }
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
        review_status: rt?.review_status || null,
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
    const devTasks = all('SELECT status FROM dev_task WHERE req_code = ?', reqCode);
    const sitTasks = all('SELECT status FROM test_task WHERE req_code = ? AND test_type = ?', reqCode, 'SIT');
    const uatTasks = all('SELECT status FROM test_task WHERE req_code = ? AND test_type = ?', reqCode, 'UAT');
    const nftTasks = all('SELECT status FROM test_task WHERE req_code = ? AND test_type = ?', reqCode, 'NFT');
    const secTasks = all('SELECT status FROM test_task WHERE req_code = ? AND test_type = ?', reqCode, 'SEC');

    return ok({
      requirement: {
        req_code: req.req_code,
        title: req.title,
        release_date: req.release_date,
        summary: req.summary,
        status: req.status
      },
      releaseTask: rt || null,
      systems, signoffs,
      uatReady: uatAllTerminal(reqCode),
      taskStatuses: {
        dev: devTasks.map(t => t.status),
        sit: sitTasks.map(t => t.status),
        uat: uatTasks.map(t => t.status),
        nft: nftTasks.map(t => t.status),
        sec: secTasks.map(t => t.status),
      }
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

  // 更新投产任务负责人及状态
  fastify.put('/release/:reqCode', { preHandler: fastify.requirePerm('release', 'edit') }, async (request) => {
    const rt = get('SELECT * FROM release_task WHERE req_code = ?', request.params.reqCode);
    if (!rt) throw notFound('投产任务未发起');
    const { owner, status, review_status } = request.body || {};

    // 评审状态手动修改：仅允许字典内取值（待评审/评审同意/评审拒绝/评审撤销/应急审批）
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
        `UPDATE release_task SET ${keys.map(k => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
        ...keys.map(k => updateData[k]), rt.id
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

    // 会签结果变化后自动重算评审状态（全部签署->评审同意，任一驳回->评审拒绝），并留痕
    const beforeReview = get('SELECT review_status FROM release_task WHERE id = ?', so.release_task_id)?.review_status;
    const afterReview = recomputeReviewStatus(so.release_task_id);
    if (beforeReview !== afterReview) {
      const rt = get('SELECT req_code FROM release_task WHERE id = ?', so.release_task_id);
      auditUpdate('release', so.release_task_id, rt?.req_code, request.currentUser?.name,
        { v: beforeReview }, { v: afterReview }, { v: '评审状态' });
    }
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
    return ok({ id: rs.id });
  });

  // 导出
  fastify.post('/release/export', { preHandler: fastify.requirePerm('release', 'export') }, async (request, reply) => {
    const body = request.body || {};
    const wh = [];
    const params = [];

    let hasReleasePointFilter = false;
    if (body.filters && Array.isArray(body.filters)) {
      for (const f of body.filters) {
        if (!f || f.value === undefined || f.value === null || f.value === '') continue;
        if (f.field === 'release_point_id') {
          wh.push('release_point_id = ?');
          params.push(f.value);
          hasReleasePointFilter = true;
        } else if (f.field === 'content') {
          wh.push('(title LIKE ? OR summary LIKE ?)');
          params.push(`%${f.value}%`, `%${f.value}%`);
        } else if (f.field === 'org') {
          const orgs = Array.isArray(f.value) ? f.value : [f.value];
          if (orgs.length) {
            const placeholders = orgs.map(() => '?').join(',');
            const sqlExpr = `
              COALESCE(
                (
                  SELECT impl_org FROM dev_task 
                  WHERE dev_task.req_code = requirement.req_code 
                    AND dev_task.impl_system IN (SELECT value FROM json_each(requirement.main_systems))
                    AND dev_task.impl_org IS NOT NULL AND dev_task.impl_org != ''
                  ORDER BY id ASC LIMIT 1
                ),
                (
                  SELECT org FROM system 
                  WHERE sys_code = (SELECT value FROM json_each(requirement.main_systems) LIMIT 1)
                    AND org IS NOT NULL AND org != ''
                ),
                requirement.propose_dept,
                '未分配机构'
              )
            `;
            wh.push(`${sqlExpr} IN (${placeholders})`);
            params.push(...orgs);
          }
        } else if (f.field === 'status') {
          const statusList = Array.isArray(f.value) ? f.value : [f.value];
          if (statusList.length) {
            const hasUninitiated = statusList.includes('未发起');
            const activeStatuses = statusList.filter(s => s !== '未发起');
            if (hasUninitiated) {
              if (activeStatuses.length) {
                const placeholders = activeStatuses.map(() => '?').join(',');
                wh.push(`(req_code NOT IN (SELECT req_code FROM release_task) OR req_code IN (SELECT req_code FROM release_task WHERE status IN (${placeholders})))`);
                params.push(...activeStatuses);
              } else {
                wh.push(`req_code NOT IN (SELECT req_code FROM release_task)`);
              }
            } else {
              const placeholders = activeStatuses.map(() => '?').join(',');
              wh.push(`req_code IN (SELECT req_code FROM release_task WHERE status IN (${placeholders}))`);
              params.push(...activeStatuses);
            }
          }
        } else if (f.field === 'owners') {
          const owners = Array.isArray(f.value) ? f.value : [f.value];
          if (owners.length) {
            const placeholders = owners.map(() => '?').join(',');
            wh.push(`req_code IN (SELECT req_code FROM release_task WHERE owner IN (${placeholders}))`);
            params.push(...owners);
          }
        } else if (f.field === 'systems') {
          const sysCodes = Array.isArray(f.value) ? f.value : [f.value];
          if (sysCodes.length) {
            const placeholders = sysCodes.map(() => '?').join(',');
            wh.push(`(
              EXISTS (SELECT 1 FROM json_each(requirement.main_systems) WHERE value IN (${placeholders})) OR
              EXISTS (SELECT 1 FROM json_each(requirement.collab_dev_systems) WHERE value IN (${placeholders})) OR
              EXISTS (SELECT 1 FROM json_each(requirement.collab_test_systems) WHERE value IN (${placeholders}))
            )`);
            params.push(...sysCodes, ...sysCodes, ...sysCodes);
          }
        }
      }
    }

    if (!hasReleasePointFilter) {
      const win = inClause('release_point_id', windowIds(body));
      if (win.where) {
        wh.push(win.where);
        params.push(...win.params);
      }
    }

    let sql = 'SELECT * FROM requirement';
    if (wh.length) {
      sql += ' WHERE ' + wh.join(' AND ');
    }
    sql += ' ORDER BY id DESC';
    const reqs = all(sql, ...params);

    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const cols = [
      { key: 'req_code', title: '关联需求编号' },
      { key: 'title', title: '需求标题' },
      { key: 'release_date', title: '计划投产点' },
      { key: 'release_status', title: '投产状态' },
      { key: 'owner', title: '投产负责人' },
      { key: 'signoff_progress', title: '会签评审进度' },
      { key: 'system_status', title: '系统上线情况' },
      { key: 'registrar', title: '登记人' },
      { key: 'register_time', title: '登记时间' },
    ];

    const mappedList = reqs.map((r) => {
      const rt = get('SELECT * FROM release_task WHERE req_code = ?', r.req_code);
      let signoffProgress = '未发起';
      let systemStatus = '未发起';
      
      if (rt) {
        // 会签进度
        const summary = signoffSummary(rt.id);
        const signoffs = all('SELECT * FROM release_signoff WHERE release_task_id = ? ORDER BY id', rt.id);
        const signoffDetail = signoffs.map(s => `${s.role_name}:${s.result}`).join(', ');
        signoffProgress = `签 ${summary.signed} 驳 ${summary.rejected} / ${summary.total} (${signoffDetail})`;

        // 系统上线情况
        const relSystems = all('SELECT * FROM release_system WHERE release_task_id = ? ORDER BY id', rt.id);
        systemStatus = relSystems.map(s => `${sysMap[s.system_code] || s.system_code}:${s.status}`).join(', ') || '无关联系统';
      }

      return {
        req_code: r.req_code,
        title: r.title,
        release_date: rpMap[r.release_point_id] || null,
        release_status: rt?.status || '未发起',
        owner: rt?.owner || '',
        signoff_progress: signoffProgress,
        system_status: systemStatus,
        registrar: rt?.registrar || '',
        register_time: rt?.register_time || '',
      };
    });

    const buf = await exportXlsx(cols, mappedList, '投产管理清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=release_tasks.xlsx');
    return reply.send(buf);
  });
}

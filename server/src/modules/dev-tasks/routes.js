/**
 * 文件：modules/dev-tasks/routes.js
 * 用途：开发管理模块接口。开发承接（按主责/协同改造系统拆分默认多条）、CRUD、
 *       排期偏差率演算、终态业务校验、留痕。
 * 作者：hengguan
 * 说明：再次承接时仅为尚未建立开发任务的系统补建，避免重复。
 */

import { get, all, run, tx } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { genDevCode } from '../../lib/code-gen.js';
import { isTerminalStatus } from '../../lib/status.js';
import { calcDeviation } from '../../lib/deviation.js';
import { auditCreate, auditUpdate, auditDelete } from '../../lib/audit.js';
import { listByEntity, countByFields } from '../../lib/attachment.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, notFound, badRequest } from '../../lib/http.js';

const COLUMNS = [
  'id', 'req_code', 'task_code', 'task_name', 'content', 'status', 'owner', 'impl_system', 'impl_org',
  'plan_start', 'plan_end', 'actual_start', 'actual_end', 'deviation_rate', 'created_at',
];
const SEARCH = ['task_code', 'task_name', 'owner', 'impl_system'];
const WRITABLE = ['task_name', 'content', 'status', 'owner', 'impl_system', 'impl_org',
  'plan_start', 'plan_end', 'actual_start', 'actual_end'];
const LABELS = {
  task_name: '开发任务名称', content: '开发内容概述', status: '开发状态', owner: '开发负责人',
  impl_system: '开发实施系统', impl_org: '开发实施方', plan_start: '计划开始时间', plan_end: '计划结束时间',
  actual_start: '实际开始时间', actual_end: '实际结束时间',
};
// 本阶段附件字段
const ATTACH_FIELDS = ['概要设计', '详细设计', '代码走查', '单元测试报告'];

/** 终态校验：附件≥1，计划/实际起止时间必填 */
function validateTerminal(id, status, row) {
  if (!isTerminalStatus(status)) return;
  if (!row.plan_start || !row.plan_end || !row.actual_start || !row.actual_end) {
    throw badRequest('开发完成（终态）时，计划/实际的开始与结束时间均必填');
  }
  if (countByFields('dev', id, ATTACH_FIELDS) === 0) {
    throw badRequest('开发完成（终态）时，本阶段附件或路径至少填写 1 个');
  }
}

export default async function devTaskRoutes(fastify) {
  // 列表（可按 req_code 或当前投产窗口过滤）
  fastify.post('/dev-tasks/list', { preHandler: fastify.requirePerm('dev', 'view') }, async (request) => {
    const body = request.body || {};
    let baseWhere = ''; const baseParams = [];
    if (body.reqCode) { baseWhere = 'req_code = ?'; baseParams.push(body.reqCode); }
    else {
      const sub = inClause('release_point_id', windowIds(body));
      if (sub.where) {
        baseWhere = `req_code IN (SELECT req_code FROM requirement WHERE ${sub.where})`;
        baseParams.push(...sub.params);
      }
    }
    const result = listQuery({ table: 'dev_task', columns: COLUMNS, searchColumns: SEARCH, query: body, baseWhere, baseParams });

    // 仅针对当前页任务涉及的需求映射计划投产点，避免随翻页整表扫描 requirement
    const pageCodes = [...new Set(result.list.map((r) => r.req_code).filter(Boolean))];
    const reqMap = {};
    if (pageCodes.length) {
      const ph = pageCodes.map(() => '?').join(',');
      const reqs = all(
        `SELECT r.req_code, rp.release_date
           FROM requirement r
           LEFT JOIN release_point rp ON r.release_point_id = rp.id
          WHERE r.req_code IN (${ph})`,
        ...pageCodes,
      );
      for (const r of reqs) {
        reqMap[r.req_code] = r.release_date;
      }
    }

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) {
      sysMap[s.sys_code] = s.sys_name;
    }

    result.list = result.list.map((row) => ({
      ...row,
      release_date: reqMap[row.req_code] || null,
      impl_system_name: sysMap[row.impl_system] || row.impl_system,
    }));

    return ok(result);
  });

  // 详情
  fastify.get('/dev-tasks/:id', { preHandler: fastify.requirePerm('dev', 'view') }, async (request) => {
    const row = get('SELECT * FROM dev_task WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    return ok({ ...row, attachments: listByEntity('dev', row.id) });
  });

  // 开发承接预览
  fastify.post('/dev-tasks/intake-preview', { preHandler: fastify.requirePerm('dev', 'dev.intake') }, async (request) => {
    const { reqCode } = request.body || {};
    if (!reqCode) throw badRequest('请选择需求');
    const req = get('SELECT * FROM requirement WHERE req_code = ?', reqCode);
    if (!req) throw notFound('需求不存在');

    const main = req.main_systems ? JSON.parse(req.main_systems) : [];
    const collab = req.collab_dev_systems ? JSON.parse(req.collab_dev_systems) : [];

    const existingTasks = all('SELECT impl_system, task_code, task_name, status FROM dev_task WHERE req_code = ?', reqCode);
    const existingMap = new Map(existingTasks.map(t => [t.impl_system, t]));

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = new Map(systems.map(s => [s.sys_code, s.sys_name]));

    const allSystems = [];
    const seen = new Set();
    for (const sysCode of main) {
      if (!seen.has(sysCode)) {
        seen.add(sysCode);
        allSystems.push({ sysCode, role: '主责' });
      }
    }
    for (const sysCode of collab) {
      if (!seen.has(sysCode)) {
        seen.add(sysCode);
        allSystems.push({ sysCode, role: '协同' });
      }
    }

    const tplRow = get("SELECT value FROM app_config WHERE key = 'code.dev'");
    const tpl = tplRow?.value || 'RW_{需求编号}_{序号}';
    const prefix = tpl.replace('{需求编号}', reqCode).replace('{序号}', '');

    const existingCodes = all(`SELECT task_code FROM dev_task WHERE task_code LIKE ?`, `${prefix}%`);
    let max = 0;
    for (const r of existingCodes) {
      const tail = String(r.task_code).slice(prefix.length);
      const n = parseInt(tail, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }

    const list = [];
    let currentMax = max;

    for (const item of allSystems) {
      const sysName = sysMap.get(item.sysCode) || item.sysCode;
      const exist = existingMap.get(item.sysCode);
      if (exist) {
        list.push({
          sysCode: item.sysCode,
          sysName,
          role: item.role,
          exists: true,
          taskCode: exist.task_code,
          taskName: exist.task_name,
          status: '已建任务',
        });
      } else {
        currentMax++;
        const seq = String(currentMax).padStart(3, '0');
        const taskCode = tpl.replace('{需求编号}', reqCode).replace('{序号}', seq);
        const taskName = `RW-${req.title}-${sysName}`;
        list.push({
          sysCode: item.sysCode,
          sysName,
          role: item.role,
          exists: false,
          taskCode,
          taskName,
          status: '新建任务',
        });
      }
    }

    return ok(list);
  });

  // 开发承接（按系统拆分）
  fastify.post('/dev-tasks/intake', { preHandler: fastify.requirePerm('dev', 'dev.intake') }, async (request) => {
    const { reqCode, systems } = request.body || {};
    if (!reqCode) throw badRequest('请选择需求');
    const req = get('SELECT * FROM requirement WHERE req_code = ?', reqCode);
    if (!req) throw notFound('需求不存在');

    // 目标系统：默认主责系统 ∪ 协同改造系统；可由 systems 指定子集
    const main = req.main_systems ? JSON.parse(req.main_systems) : [];
    const collab = req.collab_dev_systems ? JSON.parse(req.collab_dev_systems) : [];
    let targets = Array.isArray(systems) && systems.length ? systems : [...new Set([...main, ...collab])];
    if (!targets.length) throw badRequest('该需求未配置主责/协同改造系统，无法承接开发');

    // 已存在开发任务的系统跳过
    const existing = new Set(all('SELECT impl_system FROM dev_task WHERE req_code = ?', reqCode).map((r) => r.impl_system));
    targets = targets.filter((s) => !existing.has(s));
    if (!targets.length) throw badRequest('所选系统均已建立开发任务');

    const created = tx(() => {
      const out = [];
      for (const sysCode of targets) {
        const sys = get('SELECT * FROM system WHERE sys_code = ?', sysCode);
        const taskCode = genDevCode(reqCode);
        const taskName = `RW-${req.title}-${sys?.sys_name || sysCode}`;
        const res = run(
          `INSERT INTO dev_task (req_code, task_code, task_name, status, impl_system, impl_org, registrar, register_time)
           VALUES (?,?,?,?,?,?,?,?)`,
          reqCode, taskCode, taskName, '开发承接', sysCode, sys?.org || null,
          request.currentUser?.name, new Date().toISOString().slice(0, 10),
        );
        auditCreate('dev', res.lastInsertRowid, taskCode, request.currentUser?.name);
        out.push({ id: res.lastInsertRowid, task_code: taskCode });
      }
      return out;
    });
    return ok(created, `已承接 ${created.length} 个开发任务`);
  });

  // 修改
  fastify.put('/dev-tasks/:id', { preHandler: fastify.requirePerm('dev', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = get('SELECT * FROM dev_task WHERE id = ?', id);
    if (!old) throw notFound();
    const body = request.body || {};
    const data = {};
    for (const k of WRITABLE) if (body[k] !== undefined) data[k] = body[k];

    const merged = { ...old, ...data };
    validateTerminal(id, merged.status, merged);
    // 重算偏差率
    data.deviation_rate = calcDeviation(merged.plan_start, merged.plan_end, merged.actual_end);

    const keys = Object.keys(data);
    run(
      `UPDATE dev_task SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
      ...keys.map((k) => data[k]), id,
    );
    auditUpdate('dev', id, old.task_code, request.currentUser?.name, old, data, LABELS);
    return ok({ id });
  });

  // 删除
  fastify.delete('/dev-tasks/:id', { preHandler: fastify.requirePerm('dev', 'delete') }, async (request) => {
    const id = request.params.id;
    const row = get('SELECT * FROM dev_task WHERE id = ?', id);
    if (!row) throw notFound();
    run('DELETE FROM dev_task WHERE id = ?', id);
    auditDelete('dev', id, row.task_code, request.currentUser?.name);
    return ok(null, '删除成功');
  });
}

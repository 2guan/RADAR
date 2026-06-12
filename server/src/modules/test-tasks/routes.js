/**
 * 文件：modules/test-tasks/routes.js
 * 用途：测试管理模块接口（SIT/UAT/NFT/SEC 共用一张表，按 test_type 区分）。
 *       测试承接（默认建 1 个，可按系统拆分多个）、CRUD、偏差率、终态校验、留痕。
 * 作者：hengguan
 * 说明：NFT/SEC 按需进行；不承接即无该阶段。编号前缀由测试类型决定。
 */

import { get, all, run, tx } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { genTestCode } from '../../lib/code-gen.js';
import { isTerminalStatus } from '../../lib/status.js';
import { calcDeviation } from '../../lib/deviation.js';
import { auditCreate, auditUpdate, auditDelete } from '../../lib/audit.js';
import { listByEntity, countByFields } from '../../lib/attachment.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, notFound, badRequest } from '../../lib/http.js';

const TYPE_NAME = { SIT: '应用组装测试', UAT: '用户测试', NFT: '非功能测试', SEC: '安全测试' };
const COLUMNS = [
  'id', 'req_code', 'task_code', 'task_name', 'test_type', 'status', 'owner', 'impl_system', 'impl_org',
  'impl_agency', 'plan_start', 'plan_end', 'actual_start', 'actual_end', 'deviation_rate', 'created_at',
];
const SEARCH = ['task_code', 'task_name', 'owner', 'impl_system'];
const WRITABLE = ['task_name', 'status', 'owner', 'impl_system', 'impl_org', 'impl_agency',
  'plan_start', 'plan_end', 'actual_start', 'actual_end'];
const LABELS = {
  task_name: '测试任务名称', status: '测试状态', owner: '测试负责人', impl_system: '测试实施系统',
  impl_org: '测试实施方', impl_agency: '实施机构', plan_start: '计划开始时间', plan_end: '计划结束时间',
  actual_start: '实际开始时间', actual_end: '实际结束时间',
};
const ATTACH_FIELDS = ['测试方案', '测试报告'];

function validateTerminal(id, status, row) {
  if (!isTerminalStatus(status)) return;
  if (!row.plan_start || !row.plan_end || !row.actual_start || !row.actual_end) {
    throw badRequest('测试完成（终态）时，计划/实际的开始与结束时间均必填');
  }
  if (countByFields('test', id, ATTACH_FIELDS) === 0) {
    throw badRequest('测试完成（终态）时，本阶段附件或路径至少填写 1 个');
  }
}

export default async function testTaskRoutes(fastify) {
  // 列表（按 test_type / req_code / 投产窗口过滤）
  fastify.post('/test-tasks/list', { preHandler: fastify.requirePerm('test', 'view') }, async (request) => {
    const body = request.body || {};
    const wh = []; const params = [];
    if (body.testType) { wh.push('test_type = ?'); params.push(body.testType); }
    if (body.reqCode) { wh.push('req_code = ?'); params.push(body.reqCode); }
    else {
      const sub = inClause('release_point_id', windowIds(body));
      if (sub.where) {
        wh.push(`req_code IN (SELECT req_code FROM requirement WHERE ${sub.where})`);
        params.push(...sub.params);
      }
    }
    const result = listQuery({
      table: 'test_task', columns: COLUMNS, searchColumns: SEARCH, query: body,
      baseWhere: wh.join(' AND '), baseParams: params,
    });

    // 在内存中映射计划投产点与系统名称
    const reqs = all(`
      SELECT r.req_code, rp.release_date
      FROM requirement r
      LEFT JOIN release_point rp ON r.release_point_id = rp.id
    `);
    const reqMap = {};
    for (const r of reqs) {
      reqMap[r.req_code] = r.release_date;
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
  fastify.get('/test-tasks/:id', { preHandler: fastify.requirePerm('test', 'view') }, async (request) => {
    const row = get('SELECT * FROM test_task WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    return ok({ ...row, attachments: listByEntity('test', row.id) });
  });

  // 测试承接预览
  fastify.post('/test-tasks/intake-preview', { preHandler: fastify.requirePerm('test', 'test.intake') }, async (request) => {
    const { reqCode, testType } = request.body || {};
    if (!reqCode) throw badRequest('请选择需求');
    if (!testType) throw badRequest('请选择测试类型');
    const req = get('SELECT * FROM requirement WHERE req_code = ?', reqCode);
    if (!req) throw notFound('需求不存在');

    const main = req.main_systems ? JSON.parse(req.main_systems) : [];
    const collab = req.collab_test_systems ? JSON.parse(req.collab_test_systems) : [];

    const existingTasks = all('SELECT impl_system, task_code, task_name, status FROM test_task WHERE req_code = ? AND test_type = ?', reqCode, testType);

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = new Map(systems.map(s => [s.sys_code, s.sys_name]));

    const tplRow = get(`SELECT value FROM app_config WHERE key = 'code.test.${testType}'`);
    const tpl = tplRow?.value || `${testType}_{需求编号}_{序号}`;
    const prefix = tpl.replace('{需求编号}', reqCode).replace('{序号}', '');

    const existingCodes = all(`SELECT task_code FROM test_task WHERE task_code LIKE ?`, `${prefix}%`);
    let max = 0;
    for (const r of existingCodes) {
      const tail = String(r.task_code).slice(prefix.length);
      const n = parseInt(tail, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }

    let currentMax = max;

    // 1. Overall (Merged) mode row: task name is exactly `${testType}-${req.title}`
    const overallExist = existingTasks.find(t => t.task_name === `${testType}-${req.title}`);
    let overallTaskCode = '';
    let overallTaskName = `${testType}-${req.title}`;
    if (overallExist) {
      overallTaskCode = overallExist.task_code;
      overallTaskName = overallExist.task_name;
    } else {
      const seq = String(currentMax + 1).padStart(3, '0');
      overallTaskCode = tpl.replace('{需求编号}', reqCode).replace('{序号}', seq);
    }

    const firstMainSysCode = main[0] || null;
    const firstMainSysName = firstMainSysCode ? (sysMap.get(firstMainSysCode) || firstMainSysCode) : '';

    const overallRow = {
      sysCode: firstMainSysCode || 'overall',
      sysName: firstMainSysName ? `${firstMainSysName}` : '整体测试',
      role: '整体',
      exists: !!overallExist,
      taskCode: overallTaskCode,
      taskName: overallTaskName,
      status: overallExist ? '已建任务' : '新建任务',
    };

    // 2. Split mode rows
    const splitRows = [];
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

    let splitMax = max;
    for (const item of allSystems) {
      const sysName = sysMap.get(item.sysCode) || item.sysCode;
      const exist = existingTasks.find(t => t.impl_system === item.sysCode && t.task_name === `${testType}-${req.title}-${sysName}`);
      if (exist) {
        splitRows.push({
          sysCode: item.sysCode,
          sysName,
          role: item.role,
          exists: true,
          taskCode: exist.task_code,
          taskName: exist.task_name,
          status: '已建任务',
        });
      } else {
        splitMax++;
        const seq = String(splitMax).padStart(3, '0');
        const taskCode = tpl.replace('{需求编号}', reqCode).replace('{序号}', seq);
        const taskName = `${testType}-${req.title}-${sysName}`;
        splitRows.push({
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

    return ok({
      overall: [overallRow],
      split: splitRows,
    });
  });

  // 测试承接
  fastify.post('/test-tasks/intake', { preHandler: fastify.requirePerm('test', 'test.intake') }, async (request) => {
    const { reqCode, testType, systems, splitMode } = request.body || {};
    if (!reqCode) throw badRequest('请选择需求');
    if (!TYPE_NAME[testType]) throw badRequest('测试类型非法');
    const req = get('SELECT * FROM requirement WHERE req_code = ?', reqCode);
    if (!req) throw notFound('需求不存在');

    const main = req.main_systems ? JSON.parse(req.main_systems) : [];
    const firstMainSysCode = main[0] || null;

    const systemsList = all('SELECT sys_code, sys_name FROM system');
    const sysMap = new Map(systemsList.map(s => [s.sys_code, s.sys_name]));

    let targets = [];
    if (splitMode === 'overall') {
      targets = [{ sysCode: firstMainSysCode, taskName: `${testType}-${req.title}`, isSplit: false }];
    } else {
      const sysCodes = Array.isArray(systems) && systems.length ? systems : [];
      for (const sysCode of sysCodes) {
        const sysName = sysMap.get(sysCode) || sysCode;
        targets.push({ sysCode, taskName: `${testType}-${req.title}-${sysName}`, isSplit: true });
      }
    }

    const existing = all('SELECT impl_system, task_name FROM test_task WHERE req_code = ? AND test_type = ?', reqCode, testType);
    targets = targets.filter(t => !existing.some(e => e.task_name === t.taskName));

    if (!targets.length) throw badRequest('所选测试任务已全部建立');

    const created = tx(() => {
      const out = [];
      for (const t of targets) {
        const sys = t.sysCode ? get('SELECT * FROM system WHERE sys_code = ?', t.sysCode) : null;
        const taskCode = genTestCode(testType, reqCode);
        const res = run(
          `INSERT INTO test_task (req_code, task_code, task_name, test_type, status, impl_system, impl_org, registrar, register_time)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          reqCode, taskCode, t.taskName, testType, '测试承接', t.sysCode || null, sys?.org || null,
          request.currentUser?.name, new Date().toISOString().slice(0, 10),
        );
        auditCreate('test', res.lastInsertRowid, taskCode, request.currentUser?.name);
        out.push({ id: res.lastInsertRowid, task_code: taskCode });
      }
      return out;
    });
    return ok(created, `已承接 ${created.length} 个${TYPE_NAME[testType]}任务`);
  });

  // 修改
  fastify.put('/test-tasks/:id', { preHandler: fastify.requirePerm('test', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = get('SELECT * FROM test_task WHERE id = ?', id);
    if (!old) throw notFound();
    const body = request.body || {};
    const data = {};
    for (const k of WRITABLE) if (body[k] !== undefined) data[k] = body[k];

    const merged = { ...old, ...data };
    validateTerminal(id, merged.status, merged);
    data.deviation_rate = calcDeviation(merged.plan_start, merged.plan_end, merged.actual_end);

    const keys = Object.keys(data);
    run(
      `UPDATE test_task SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
      ...keys.map((k) => data[k]), id,
    );
    auditUpdate('test', id, old.task_code, request.currentUser?.name, old, data, LABELS);
    return ok({ id });
  });

  // 删除
  fastify.delete('/test-tasks/:id', { preHandler: fastify.requirePerm('test', 'delete') }, async (request) => {
    const id = request.params.id;
    const row = get('SELECT * FROM test_task WHERE id = ?', id);
    if (!row) throw notFound();
    run('DELETE FROM test_task WHERE id = ?', id);
    auditDelete('test', id, row.task_code, request.currentUser?.name);
    return ok(null, '删除成功');
  });
}

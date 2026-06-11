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
    return ok(listQuery({
      table: 'test_task', columns: COLUMNS, searchColumns: SEARCH, query: body,
      baseWhere: wh.join(' AND '), baseParams: params,
    }));
  });

  // 详情
  fastify.get('/test-tasks/:id', { preHandler: fastify.requirePerm('test', 'view') }, async (request) => {
    const row = get('SELECT * FROM test_task WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    return ok({ ...row, attachments: listByEntity('test', row.id) });
  });

  // 测试承接
  fastify.post('/test-tasks/intake', { preHandler: fastify.requirePerm('test', 'test.intake') }, async (request) => {
    const { reqCode, testType, systems } = request.body || {};
    if (!reqCode) throw badRequest('请选择需求');
    if (!TYPE_NAME[testType]) throw badRequest('测试类型非法');
    const req = get('SELECT * FROM requirement WHERE req_code = ?', reqCode);
    if (!req) throw notFound('需求不存在');

    // 目标系统：指定则按系统拆分；否则默认建 1 个（取主责系统首个）
    const main = req.main_systems ? JSON.parse(req.main_systems) : [];
    const collab = req.collab_test_systems ? JSON.parse(req.collab_test_systems) : [];
    let targets;
    if (Array.isArray(systems) && systems.length) {
      targets = systems;
    } else {
      targets = [main[0] || collab[0] || null]; // 默认 1 个
    }
    // 同类型下已承接的系统跳过（null 表示未指定系统，允许多次）
    const existing = new Set(
      all('SELECT impl_system FROM test_task WHERE req_code = ? AND test_type = ?', reqCode, testType)
        .map((r) => r.impl_system).filter(Boolean),
    );
    targets = targets.filter((s) => !s || !existing.has(s));
    if (!targets.length) throw badRequest('所选系统均已承接该类型测试');

    const created = tx(() => {
      const out = [];
      for (const sysCode of targets) {
        const sys = sysCode ? get('SELECT * FROM system WHERE sys_code = ?', sysCode) : null;
        const taskCode = genTestCode(testType, reqCode);
        const taskName = `${testType}-${req.title}${sys ? '-' + sys.sys_name : ''}`;
        const res = run(
          `INSERT INTO test_task (req_code, task_code, task_name, test_type, status, impl_system, impl_org, registrar, register_time)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          reqCode, taskCode, taskName, testType, '测试承接', sysCode || null, sys?.org || null,
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

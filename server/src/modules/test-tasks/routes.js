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
import { defaultProcessStatus, isTerminalStatus } from '../../lib/status.js';
import { statusTypeForProcessStatus, validateRequiredFields } from '../../lib/required-fields.js';
import { calcDeviation } from '../../lib/deviation.js';
import { auditCreate, auditUpdate, auditDelete } from '../../lib/audit.js';
import { listByEntity } from '../../lib/attachment.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, notFound, badRequest } from '../../lib/http.js';
import { exportXlsx, parseXlsx } from '../../lib/excel.js';
import { resolveDictAttr, resolveSystemCode, formatAttachments } from '../../lib/resolver.js';
import { getWorkItem, workItemCodesInReleasePoints, releaseDateMapForCodes } from '../../lib/work-items.js';

// 导入模板列定义
const IO_COLUMNS = [
  { key: 'req_code', title: '关联需求/工单编号' },
  { key: 'task_code', title: '测试任务编号' },
  { key: 'task_name', title: '测试任务名称' },
  { key: 'test_type', title: '测试类型' },
  { key: 'status', title: '测试状态' },
  { key: 'owner', title: '测试负责人' },
  { key: 'impl_system', title: '测试实施系统' },
  { key: 'impl_org', title: '测试实施方' },
  { key: 'impl_agency', title: '实施机构' },
  { key: 'plan_start', title: '计划开始时间' },
  { key: 'plan_end', title: '计划结束时间' },
  { key: 'actual_start', title: '实际开始时间' },
  { key: 'actual_end', title: '实际结束时间' },
];

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
}

export default async function testTaskRoutes(fastify) {
  // 列表（按 test_type / req_code / 投产窗口过滤）
  fastify.post('/test-tasks/list', { preHandler: fastify.requirePerm('test', 'view') }, async (request) => {
    const body = request.body || {};
    const wh = [];
    const params = [];

    if (body.testType) {
      wh.push('test_type = ?');
      params.push(body.testType);
    }

    const filters = Array.isArray(body.filters) ? body.filters : [];
    const normalFilters = [];
    let hasReleasePointFilter = false;

    for (const f of filters) {
      if (!f || f.value === undefined || f.value === null || f.value === '') continue;

      if (f.field === 'content') {
        wh.push('task_name LIKE ?');
        params.push(`%${f.value}%`);
      } else if (f.field === 'release_point_id') {
        hasReleasePointFilter = true;
        const ids = Array.isArray(f.value) ? f.value : [f.value];
        if (ids.length) {
          const placeholders = ids.map(() => '?').join(',');
          wh.push(`req_code IN (
            SELECT req_code FROM requirement WHERE release_point_id IN (${placeholders})
            UNION
            SELECT ticket_code FROM ticket WHERE release_point_id IN (${placeholders})
          )`);
          params.push(...ids, ...ids);
        }
      } else if (f.field === 'org') {
        const orgs = Array.isArray(f.value) ? f.value : [f.value];
        if (orgs.length) {
          const placeholders = orgs.map(() => '?').join(',');
          wh.push(`impl_system IN (SELECT sys_code FROM system WHERE org IN (${placeholders}))`);
          params.push(...orgs);
        }
      } else if (f.field === 'owners') {
        const owners = Array.isArray(f.value) ? f.value : [f.value];
        if (owners.length) {
          const placeholders = owners.map(() => '?').join(',');
          wh.push(`owner IN (${placeholders})`);
          params.push(...owners);
        }
      } else {
        normalFilters.push(f);
      }
    }

    if (body.reqCode) {
      wh.push('req_code = ?');
      params.push(body.reqCode);
    } else if (!hasReleasePointFilter) {
      const codes = workItemCodesInReleasePoints(windowIds(body));
      if (codes) {
        if (codes.length) {
          const sub = inClause('req_code', codes);
          wh.push(sub.where);
          params.push(...sub.params);
        } else {
          wh.push('1=0');
        }
      }
    }

    const newBody = { ...body, filters: normalFilters };
    const baseWhere = wh.join(' AND ');

    const result = listQuery({
      table: 'test_task', columns: COLUMNS, searchColumns: SEARCH, query: newBody,
      baseWhere, baseParams: params,
    });

    // 仅针对当前页任务涉及的需求/工单映射计划投产点，避免随翻页整表扫描
    const pageCodes = [...new Set(result.list.map((r) => r.req_code).filter(Boolean))];
    const reqMap = releaseDateMapForCodes(pageCodes);

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) {
      sysMap[s.sys_code] = s.sys_name;
    }
    const itemMap = {};
    for (const code of pageCodes) {
      const item = getWorkItem(code);
      if (item) itemMap[code] = item;
    }

    result.list = result.list.map((row) => ({
      ...row,
      release_date: reqMap[row.req_code] || null,
      entity_type: itemMap[row.req_code]?.entity_type || null,
      entity_label: itemMap[row.req_code]?.entity_label || null,
      impl_system_name: sysMap[row.impl_system] || row.impl_system,
    }));

    return ok(result);
  });

  // 详情
  // 组装测试任务详情：附带关联需求/工单(编号/标题/状态)与该工作项的全部开发任务（供详情联动展示）
  const buildTestDetail = (row) => {
    const item = getWorkItem(row.req_code);
    const sysMap = {};
    for (const s of all('SELECT sys_code, sys_name FROM system')) sysMap[s.sys_code] = s.sys_name;
    const dev_tasks = all('SELECT id, task_code, impl_system, status FROM dev_task WHERE req_code = ? ORDER BY id', row.req_code)
      .map((t) => ({ ...t, impl_system_name: sysMap[t.impl_system] || t.impl_system || null }));
    return {
      ...row,
      req_title: item?.title || null,
      req_status: item?.status || null,
      entity_type: item?.entity_type || null,
      entity_label: item?.entity_label || null,
      dev_tasks,
      attachments: listByEntity('test', row.id),
    };
  };

  fastify.get('/test-tasks/:id', { preHandler: fastify.requirePerm('test', 'view') }, async (request) => {
    const row = get('SELECT * FROM test_task WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    return ok(buildTestDetail(row));
  });

  // 按测试任务编号查询（供详情单页通过 URL 编号直达）
  fastify.get('/test-tasks/by-code/:code', { preHandler: fastify.requirePerm('test', 'view') }, async (request) => {
    const row = get('SELECT * FROM test_task WHERE task_code = ?', request.params.code);
    if (!row) throw notFound();
    return ok(buildTestDetail(row));
  });

  // 测试承接预览
  fastify.post('/test-tasks/intake-preview', { preHandler: fastify.requirePerm('test', 'test.intake') }, async (request) => {
    const { reqCode, testType } = request.body || {};
    if (!reqCode) throw badRequest('请选择需求/工单');
    if (!testType) throw badRequest('请选择测试类型');
    const req = getWorkItem(reqCode);
    if (!req) throw notFound('需求/工单不存在');

    const main = req.main_systems || [];
    const collab = req.collab_test_systems || [];

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
    if (!reqCode) throw badRequest('请选择需求/工单');
    if (!TYPE_NAME[testType]) throw badRequest('测试类型非法');
    const req = getWorkItem(reqCode);
    if (!req) throw notFound('需求/工单不存在');

    const main = req.main_systems || [];
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
      const initialStatus = defaultProcessStatus('测试', 'initial', '测试承接');
      for (const t of targets) {
        const sys = t.sysCode ? get('SELECT * FROM system WHERE sys_code = ?', t.sysCode) : null;
        const taskCode = genTestCode(testType, reqCode);
        const res = run(
          `INSERT INTO test_task (req_code, task_code, task_name, test_type, status, impl_system, impl_org, registrar, register_time)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          reqCode, taskCode, t.taskName, testType, initialStatus, t.sysCode || null, sys?.org || null,
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
    validateRequiredFields('test', statusTypeForProcessStatus(merged.status), merged);
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

  // 导出
  fastify.post('/test-tasks/export', { preHandler: fastify.requirePerm('test', 'export') }, async (request, reply) => {
    const body = request.body || {};
    const { where: baseWhere, params: baseParams } = inClause('req_code', body.req_code ? [body.req_code] : []);

    // 如果没有指定 req_code，根据窗口过滤
    let finalWhere = baseWhere;
    let finalParams = [...baseParams];
    if (!body.req_code) {
      const codes = [
        ...all("SELECT req_code AS code FROM requirement WHERE release_point_id IN (SELECT id FROM release_point WHERE is_default = 1 OR release_date >= date('now'))").map(r => r.code),
        ...all("SELECT ticket_code AS code FROM ticket WHERE release_point_id IN (SELECT id FROM release_point WHERE is_default = 1 OR release_date >= date('now'))").map(r => r.code),
      ];
      const win = inClause('req_code', [...new Set(codes)]);
      finalWhere = win.where || '1=0';
      finalParams = win.params;
    }

    // 过滤特定的测试类型（前端分四个页面，所以会传入 test_type 的过滤条件）
    let whClause = finalWhere;
    if (body.test_type) {
      whClause = whClause ? `${whClause} AND test_type = ?` : 'test_type = ?';
      finalParams.push(body.test_type);
    }

    const result = listQuery({
      table: 'test_task', columns: COLUMNS, searchColumns: SEARCH,
      query: { ...body, pageSize: 0 }, baseWhere: whClause, baseParams: finalParams,
    });

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const cols = [
      { key: 'req_code', title: '关联需求/工单编号' },
      { key: 'task_code', title: '测试任务编号' },
      { key: 'task_name', title: '测试任务名称' },
      { key: 'test_type', title: '测试类型' },
      { key: 'status', title: '测试状态' },
      { key: 'owner', title: '测试负责人' },
      { key: 'impl_system', title: '测试实施系统' },
      { key: 'impl_org', title: '测试实施方' },
      { key: 'impl_agency', title: '实施机构' },
      { key: 'plan_start', title: '计划开始时间' },
      { key: 'plan_end', title: '计划结束时间' },
      { key: 'actual_start', title: '实际开始时间' },
      { key: 'actual_end', title: '实际结束时间' },
      { key: 'deviation_rate', title: '排期偏差率 (%)' },
      { key: 'registrar', title: '登记人' },
      { key: 'register_time', title: '登记时间' },
      { key: 'test_plan', title: '测试方案' },
      { key: 'test_coverage_design', title: '测试覆盖设计文档' },
      { key: 'test_report', title: '测试报告' },
    ];

    const mappedList = result.list.map(row => {
      const attaches = all("SELECT * FROM attachment WHERE entity_type = 'test' AND entity_id = ?", row.id);
      return {
        ...row,
        test_type: TYPE_NAME[row.test_type] || row.test_type,
        impl_system: sysMap[row.impl_system] || row.impl_system,
        deviation_rate: row.deviation_rate != null ? `${row.deviation_rate}%` : '0%',
        test_plan: formatAttachments(attaches, '测试方案'),
        test_coverage_design: row.test_type === 'SIT' ? formatAttachments(attaches, '测试覆盖设计文档') : '',
        test_report: formatAttachments(attaches, '测试报告'),
      };
    });

    const buf = await exportXlsx(cols, mappedList, '测试任务清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=test_tasks.xlsx');
    return reply.send(buf);
  });

  // 模板下载
  fastify.get('/test-tasks/template', { preHandler: fastify.requirePerm('test', 'import') }, async (request, reply) => {
    const buf = await exportXlsx(IO_COLUMNS, [], '测试任务模板');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=test_tasks_template.xlsx');
    return reply.send(buf);
  });

  // 导入
  fastify.post('/test-tasks/import', { preHandler: fastify.requirePerm('test', 'import') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = data.fields?.mode?.value || 'skip';
    const buffer = await data.toBuffer();
    const rows = await parseXlsx(buffer, IO_COLUMNS);
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
    const details = [];

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const TYPE_CODE = {
      '应用组装测试': 'SIT',
      '用户测试': 'UAT',
      '非功能测试': 'NFT',
      '安全测试': 'SEC'
    };

    const apply = () => {
      for (const r of rows) {
        const rowNum = r.__rowNum__;
        try {
          if (!r.req_code) throw new Error('关联需求/工单编号不能为空');
          if (!r.task_name) throw new Error('测试任务名称不能为空');
          if (!r.test_type) throw new Error('测试类型不能为空');

          // 校验关联需求/工单编号是否存在
          const req = getWorkItem(r.req_code);
          if (!req) throw new Error(`关联需求/工单编号 [${r.req_code}] 不存在`);

          // 翻译中文测试类型为 Code
          const testTypeCode = TYPE_CODE[String(r.test_type).trim()];
          if (!testTypeCode) {
            throw new Error(`测试类型 [${r.test_type}] 不合法，必须为 应用组装测试、用户测试、非功能测试、安全测试 之一`);
          }

          // 兼容性字典/系统转换
          const status = resolveDictAttr('process_status', r.status) || defaultProcessStatus('测试', 'initial', '测试承接');
          const implOrg = resolveDictAttr('org', r.impl_org);
          const implAgency = resolveDictAttr('org', r.impl_agency);
          const implSystem = resolveSystemCode(r.impl_system);

          let code = String(r.task_code || '').trim();
          const exists = code ? get('SELECT * FROM test_task WHERE task_code = ?', code) : null;

          if (exists) {
            if (mode === 'skip') {
              stat.skipped++;
              details.push({
                key: code,
                title: r.task_name,
                action: 'skip',
                status: 'success',
                __rowNum__: rowNum,
              });
              continue;
            }
            if (mode === 'rollback') {
              throw new Error(`测试任务编号 [${code}] 已存在，无法覆盖`);
            }

            // overwrite 模式：比对并更新
            const changes = [];
            const compareAndPush = (fieldKey, fieldName, oldVal, newVal) => {
              if (oldVal !== newVal) {
                changes.push({ field: fieldName, old: oldVal, new: newVal });
              }
            };

            compareAndPush('task_name', '测试任务名称', exists.task_name || '', r.task_name || '');
            compareAndPush('test_type', '测试类型', TYPE_NAME[exists.test_type] || exists.test_type || '', TYPE_NAME[testTypeCode] || testTypeCode || '');
            compareAndPush('status', '测试状态', exists.status || '', status || '');
            compareAndPush('owner', '测试负责人', exists.owner || '', r.owner || '');
            compareAndPush('impl_system', '测试实施系统', sysMap[exists.impl_system] || exists.impl_system || '', sysMap[implSystem] || implSystem || '');
            compareAndPush('impl_org', '测试实施方', exists.impl_org || '', implOrg || '');
            compareAndPush('impl_agency', '实施机构', exists.impl_agency || '', implAgency || '');
            compareAndPush('plan_start', '计划开始时间', exists.plan_start || '', r.plan_start || '');
            compareAndPush('plan_end', '计划结束时间', exists.plan_end || '', r.plan_end || '');
            compareAndPush('actual_start', '实际开始时间', exists.actual_start || '', r.actual_start || '');
            compareAndPush('actual_end', '实际结束时间', exists.actual_end || '', r.actual_end || '');

            if (changes.length > 0) {
              const devRate = calcDeviation(r.plan_start || exists.plan_start, r.plan_end || exists.plan_end, r.actual_end || exists.actual_end);
              run(
                `UPDATE test_task SET 
                   task_name=?, test_type=?, status=?, owner=?, impl_system=?, impl_org=?, impl_agency=?,
                   plan_start=?, plan_end=?, actual_start=?, actual_end=?, deviation_rate=?, 
                   updated_at=datetime('now','localtime') 
                 WHERE id=?`,
                r.task_name, testTypeCode, status, r.owner || null, implSystem || null, implOrg || null, implAgency || null,
                r.plan_start || null, r.plan_end || null, r.actual_start || null, r.actual_end || null, devRate, exists.id
              );
              auditUpdate('test', exists.id, code, request.currentUser?.name, exists, {
                task_name: r.task_name, test_type: testTypeCode, status, owner: r.owner || null,
                impl_system: implSystem, impl_org: implOrg, impl_agency: implAgency, plan_start: r.plan_start || null, plan_end: r.plan_end || null,
                actual_start: r.actual_start || null, actual_end: r.actual_end || null, deviation_rate: devRate
              }, LABELS);
            }

            stat.updated++;
            details.push({
              key: code,
              title: r.task_name,
              action: 'update',
              status: 'success',
              __rowNum__: rowNum,
              changes,
            });

          } else {
            // insert 新建
            if (!code) code = genTestCode(testTypeCode, r.req_code);
            const devRate = calcDeviation(r.plan_start, r.plan_end, r.actual_end);
            const res = run(
              `INSERT INTO test_task 
                 (req_code, task_code, task_name, test_type, status, owner, impl_system, impl_org, impl_agency,
                  plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              r.req_code, code, r.task_name, testTypeCode, status, r.owner || null, implSystem || null, implOrg || null, implAgency || null,
              r.plan_start || null, r.plan_end || null, r.actual_start || null, r.actual_end || null, devRate,
              request.currentUser?.name, new Date().toISOString().slice(0, 10)
            );
            auditCreate('test', res.lastInsertRowid, code, request.currentUser?.name);
            stat.inserted++;
            details.push({
              key: code,
              title: r.task_name,
              action: 'insert',
              status: 'success',
              __rowNum__: rowNum,
            });
          }
        } catch (err) {
          stat.failed++;
          details.push({
            key: r.task_code || '未知测试任务编号',
            title: r.task_name || '空测试任务名称',
            status: 'fail',
            __rowNum__: rowNum,
            error: err.message,
          });
          if (mode === 'rollback') {
            throw err;
          }
        }
      }
    };

    if (mode === 'rollback') {
      try {
        tx(apply);
      } catch (err) {
        for (const item of details) {
          if (item.status === 'success') {
            item.action = 'skip';
          }
        }
        stat.inserted = 0;
        stat.updated = 0;
      }
    } else {
      apply();
    }

    return ok({ stat, details }, '导入完成');
  });
}

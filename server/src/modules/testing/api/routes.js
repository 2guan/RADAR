/**
 * 文件：server/src/modules/testing/api/routes.js
 * 说明：NFT/SEC 按需进行；不承接即无该阶段。编号前缀由测试类型决定。
 * 用途：测试管理模块接口（SIT/UAT/NFT/SEC 共用一张表，按 test_type 区分）。
 *       测试承接（默认建 1 个，可按系统拆分多个）、CRUD、偏差率、终态校验、留痕。
 * 作者：hengguan
 */

import { get, all, run, tx, listQuery } from '../../../platform/persistence/index.js';
import {
  buildExtensionListFilter, defaultProcessStatus,
} from '../../settings/process-configuration/index.js';
import {
  appendStageExcelValues,
  appendStageListValues,
  extensionValuesFromExcelRow,
  getStageExcelColumns,
  saveExtensionValues,
  validateStageContent,
} from '../../settings/process-configuration/index.js';
import { auditCreate, auditUpdate, auditDelete } from '../../../platform/audit/index.js';
import { listByEntity } from '../../../platform/attachments/index.js';
import { windowIds, inClause, getDictDisplayMap, resolveDictAttr, resolveExistingDictAttr, resolveOrganizationValues, resolveSystemCode, formatAttachments } from '../../settings/reference-data/index.js';
import { ok, notFound, badRequest, forbidden } from '../../../platform/runtime/index.js';
import { assertStatusChangePermission } from '../../settings/process-configuration/index.js';
import { exportXlsx, parseXlsx } from '../../../platform/import-export/index.js';
import {
  calcDeviation, formatCoverageText, generateTestTaskCode,
  getWorkItem, workItemCodesInReleasePoints, releaseDateMapForCodes,
} from '../../development/index.js';
import { codePrefix, codeTemplateValues, formatCode } from '../../../shared/utils/code-template.js';
import { resolveCurrentTaskStatuses } from '../../overview/index.js';
import { isOrganizationRestricted, workItemMatchesOrganization } from '../../../shared/utils/organization-scope.js';
import { isActivePersonName } from '../../identity-access/index.js';
import { beijingDateString } from '../../../shared/utils/time.js';

// 导入模板列定义
const IO_COLUMNS = [
  { key: 'req_code', title: '关联需求/工单编号' },
  { key: 'task_code', title: '测试任务编号' },
  { key: 'task_name', title: '测试任务名称' },
  { key: 'test_type', title: '测试类型' },
  { key: 'status', title: '测试状态' },
  { key: 'owner', title: '测试负责人' },
  { key: 'intake_owner', title: '测试承接人' },
  { key: 'impl_system', title: '测试实施系统' },
  { key: 'impl_org', title: '测试实施方' },
  { key: 'plan_start', title: '计划开始时间' },
  { key: 'plan_end', title: '计划结束时间' },
  { key: 'actual_start', title: '实际开始时间' },
  { key: 'actual_end', title: '实际结束时间' },
];

function intakeAssignmentMap(assignments) {
  const result = new Map();
  for (const item of Array.isArray(assignments) ? assignments : []) {
    const sysCode = String(item?.sysCode || '').trim();
    if (!sysCode) throw badRequest('测试任务缺少实施系统');
    if (result.has(sysCode)) throw badRequest(`测试任务实施系统 [${sysCode}] 重复`);
    result.set(sysCode, {
      owner: String(item?.owner || '').trim(),
      implOrg: String(item?.implOrg || '').trim(),
    });
  }
  return result;
}

const TYPE_NAME = { SIT: '应用组装测试', UAT: '用户测试', NFT: '非功能测试', SEC: '安全测试' };
const COLUMNS = [
  'id', 'req_code', 'task_code', 'task_name', 'test_type', 'status', 'owner', 'intake_owner', 'impl_system', 'impl_org',
  'plan_start', 'plan_end', 'actual_start', 'actual_end', 'deviation_rate', 'created_at',
];
const SEARCH = ['task_code', 'task_name', 'owner', 'intake_owner', 'impl_system'];
const WRITABLE = ['task_name', 'status', 'owner', 'intake_owner', 'impl_system', 'impl_org',
  'plan_start', 'plan_end', 'actual_start', 'actual_end'];
const LABELS = {
  task_name: '测试任务名称', test_type: '测试类型', status: '测试状态', owner: '测试负责人', intake_owner: '测试承接人', impl_system: '测试实施系统',
  impl_org: '测试实施方', plan_start: '计划开始时间', plan_end: '计划结束时间',
  actual_start: '实际开始时间', actual_end: '实际结束时间', deviation_rate: '排期偏差率',
};

async function organizationWorkItemCodes(user) {
  if (!isOrganizationRestricted(user)) return null;
  if (!user?.org) return [];
  const [items, systems] = await Promise.all([
    all(`SELECT req_code AS work_item_code, implementation_org, main_systems, collab_dev_systems FROM requirement
         UNION ALL SELECT ticket_code AS work_item_code, implementation_org, main_systems, collab_dev_systems FROM ticket`),
    all('SELECT sys_code, org FROM system'),
  ]);
  const orgByCode = Object.fromEntries(systems.map((system) => [system.sys_code, system.org]));
  const organizations = await resolveOrganizationValues(user.org);
  return items.filter((item) => workItemMatchesOrganization(item, organizations, orgByCode)).map((item) => item.work_item_code);
}

async function appendOrganizationScope(wh, params, field, user) {
  const codes = await organizationWorkItemCodes(user);
  if (codes === null) return;
  if (!codes.length) { wh.push('1=0'); return; }
  const clause = inClause(field, codes);
  wh.push(clause.where); params.push(...clause.params);
}

async function assertWorkItemOrganizationAccess(reqCode, user) {
  const codes = await organizationWorkItemCodes(user);
  if (codes !== null && !codes.includes(reqCode)) throw forbidden('无该机构数据权限');
}
export default async function testTaskRoutes(fastify) {
  const requireTestPerm = async (request, action, testType) => {
    if (!TYPE_NAME[testType]) throw badRequest('测试类型非法');
    await fastify.requirePerm(`test.${testType}`, action)(request);
  };
  const requireAnyTestPerm = async (request, actions, testType) => {
    if (!TYPE_NAME[testType]) throw badRequest('测试类型非法');
    await fastify.requireAnyPerm(`test.${testType}`, actions)(request);
  };

  // 列表（按 test_type / req_code / 投产窗口过滤）
  fastify.post('/test-tasks/list', async (request) => {
    const body = request.body || {};
    await requireTestPerm(request, 'view', body.testType);
    const wh = [];
    const params = [];
    await appendOrganizationScope(wh, params, 'req_code', request.currentUser);

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
        const codes = await workItemCodesInReleasePoints(ids);
        const pointFilter = inClause('req_code', codes || []);
        wh.push(pointFilter.where || '1=0');
        params.push(...pointFilter.params);
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
      const codes = await workItemCodesInReleasePoints(windowIds(body));
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

    const result = await listQuery({
      table: 'test_task', columns: COLUMNS, searchColumns: SEARCH, query: newBody,
      baseWhere, baseParams: params, extensionScopeKey: `test.${body.testType}`, extensionEntityType: 'test',
      extensionFilterBuilder: buildExtensionListFilter,
    });

    // 仅针对当前页任务涉及的需求/工单映射申请投产点，避免随翻页整表扫描
    const pageCodes = [...new Set(result.list.map((r) => r.req_code).filter(Boolean))];
    const [systems, orgDisplayMap] = await Promise.all([
      all('SELECT sys_code, sys_name FROM system'),
      getDictDisplayMap('org'),
    ]);
    const sysMap = {};
    for (const s of systems) {
      sysMap[s.sys_code] = s.sys_name;
    }
    const itemMap = {};
    for (const code of pageCodes) {
      const item = await getWorkItem(code);
      if (item) itemMap[code] = item;
    }
    const taskStatuses = await resolveCurrentTaskStatuses(pageCodes.map((code) => itemMap[code] || { req_code: code }));

    result.list = result.list.map((row) => ({
      ...row,
      entity_type: itemMap[row.req_code]?.entity_type || null,
      entity_label: itemMap[row.req_code]?.entity_label || null,
      impl_org_display: orgDisplayMap[row.impl_org] || row.impl_org || null,
      impl_system_name: sysMap[row.impl_system] || row.impl_system,
      task_status: taskStatuses[row.req_code]?.display || '需求/工单分析-未开始',
      task_status_short: taskStatuses[row.req_code]?.shortDisplay || '需求 · 未开始',
      task_status_value: taskStatuses[row.req_code]?.status || '未开始',
    }));
    result.list = await appendStageListValues(`test.${body.testType}`, result.list);

    return ok(result);
  });

  // 详情
  // 组装测试任务详情：附带关联需求/工单(编号/标题/状态)与该工作项的全部开发任务（供详情联动展示）
  const buildTestDetail = async (row) => {
    const item = await getWorkItem(row.req_code);
    const sysMap = {};
    for (const s of await all('SELECT sys_code, sys_name FROM system')) sysMap[s.sys_code] = s.sys_name;
    const dev_tasks = (await all('SELECT id, task_code, impl_system, status FROM dev_task WHERE req_code = ? ORDER BY id', row.req_code))
      .map((t) => ({ ...t, impl_system_name: sysMap[t.impl_system] || t.impl_system || null }));
    // 实施机构已从测试任务业务字段中下线，历史库列不再对外返回。
    const { impl_agency: _implAgency, ...task } = row;
    return {
      ...task,
      req_title: item?.title || null,
      req_status: item?.status || null,
      entity_type: item?.entity_type || null,
      entity_label: item?.entity_label || null,
      dev_tasks,
      attachments: await listByEntity('test', row.id),
    };
  };

  fastify.get('/test-tasks/:id', async (request) => {
    const row = await get('SELECT * FROM test_task WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    await requireTestPerm(request, 'view', row.test_type);
    await assertWorkItemOrganizationAccess(row.req_code, request.currentUser);
    return ok(await buildTestDetail(row));
  });

  // 按测试任务编号查询（供详情单页通过 URL 编号直达）
  fastify.get('/test-tasks/by-code/:code', async (request) => {
    const row = await get('SELECT * FROM test_task WHERE task_code = ?', request.params.code);
    if (!row) throw notFound();
    await requireTestPerm(request, 'view', row.test_type);
    await assertWorkItemOrganizationAccess(row.req_code, request.currentUser);
    return ok(await buildTestDetail(row));
  });

  // 承接候选二次裁决：整体任务已建或全部拆分任务已建时，不再显示该工作项。
  fastify.post('/test-tasks/intake-pending-codes', async (request) => {
    const { testType } = request.body || {};
    await requireTestPerm(request, 'create', testType);
    if (!TYPE_NAME[testType]) throw badRequest('测试类型非法');
    const requestedCodes = [...new Set((Array.isArray(request.body?.reqCodes) ? request.body.reqCodes : []).map(String).filter(Boolean))].slice(0, 500);
    if (!requestedCodes.length) return ok([]);
    const scopedCodes = await organizationWorkItemCodes(request.currentUser);
    const permittedCodes = scopedCodes === null ? requestedCodes : requestedCodes.filter((code) => scopedCodes.includes(code));
    if (!permittedCodes.length) return ok([]);
    const clause = inClause('req_code', permittedCodes);
    const existingRows = await all(`SELECT req_code, impl_system, task_name FROM test_task WHERE test_type = ? AND ${clause.where}`, testType, ...clause.params);
    const existingByCode = new Map();
    for (const row of existingRows) {
      if (!existingByCode.has(row.req_code)) existingByCode.set(row.req_code, []);
      existingByCode.get(row.req_code).push(row);
    }
    const systems = await all('SELECT sys_code, sys_name FROM system');
    const sysName = new Map(systems.map((system) => [system.sys_code, system.sys_name]));
    const pending = [];
    for (const code of permittedCodes) {
      const item = await getWorkItem(code);
      if (!item) continue;
      const existing = existingByCode.get(code) || [];
      const overallExists = existing.some((task) => task.task_name === `${testType}-${item.title}`);
      const splitSystems = [...new Set([...(item.main_systems || []), ...(item.collab_test_systems || [])])];
      const allSplitExists = splitSystems.length > 0 && splitSystems.every((sysCode) => existing.some((task) => task.impl_system === sysCode && task.task_name === `${testType}-${item.title}-${sysName.get(sysCode) || sysCode}`));
      if (!overallExists && !allSplitExists) pending.push(code);
    }
    return ok(pending);
  });

  // 测试承接预览
  fastify.post('/test-tasks/intake-preview', async (request) => {
    const { reqCode, testType } = request.body || {};
    await requireTestPerm(request, 'create', testType);
    if (!reqCode) throw badRequest('请选择需求/工单');
    if (!testType) throw badRequest('请选择测试类型');
    const req = await getWorkItem(reqCode);
    if (!req) throw notFound('需求/工单不存在');
    await assertWorkItemOrganizationAccess(reqCode, request.currentUser);
    const releaseWindow = (await releaseDateMapForCodes([reqCode]))[reqCode];

    const main = req.main_systems || [];
    const collab = req.collab_test_systems || [];

    const existingTasks = await all('SELECT impl_system, task_code, task_name, status, owner FROM test_task WHERE req_code = ? AND test_type = ?', reqCode, testType);

    const systems = await all('SELECT sys_code, sys_name, org FROM system');
    const sysMap = new Map(systems.map(s => [s.sys_code, s.sys_name]));
    const sysOrgMap = new Map(systems.map(s => [s.sys_code, s.org]));

    const tplRow = await get(`SELECT value FROM app_config WHERE key = 'code.test.${testType}'`);
    const tpl = tplRow?.value || `${testType}_{需求/工单编号}_{序号[3]}`;
    const codeValues = codeTemplateValues({ releaseWindow, workItemCode: reqCode });
    const prefix = codePrefix(tpl, codeValues);

    const existingCodes = await all(`SELECT task_code FROM test_task WHERE task_code LIKE ?`, `${prefix}%`);
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
      overallTaskCode = formatCode(tpl, codeValues, currentMax + 1);
    }

    const firstMainSysCode = main[0] || null;
    const firstMainSysName = firstMainSysCode ? (sysMap.get(firstMainSysCode) || firstMainSysCode) : '';
    const mainSystemOrg = firstMainSysCode ? (sysOrgMap.get(firstMainSysCode) || null) : null;

    const overallRow = {
      sysCode: firstMainSysCode || 'overall',
      sysName: firstMainSysName ? `${firstMainSysName}` : '整体测试',
      role: '整体',
      exists: !!overallExist,
      taskCode: overallTaskCode,
      taskName: overallTaskName,
      owner: overallExist?.owner,
      defaultImplOrg: mainSystemOrg,
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
          owner: exist.owner,
          defaultImplOrg: mainSystemOrg,
          status: '已建任务',
        });
      } else {
        splitMax++;
        const taskCode = formatCode(tpl, codeValues, splitMax);
        const taskName = `${testType}-${req.title}-${sysName}`;
        splitRows.push({
          sysCode: item.sysCode,
          sysName,
          role: item.role,
          exists: false,
          taskCode,
          taskName,
          defaultImplOrg: mainSystemOrg,
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
  fastify.post('/test-tasks/intake', async (request) => {
    const { reqCode, testType, assignments, splitMode } = request.body || {};
    await requireTestPerm(request, 'create', testType);
    if (!reqCode) throw badRequest('请选择需求/工单');
    if (!TYPE_NAME[testType]) throw badRequest('测试类型非法');
    const req = await getWorkItem(reqCode);
    if (!req) throw notFound('需求/工单不存在');
    await assertWorkItemOrganizationAccess(reqCode, request.currentUser);
    const releaseWindow = (await releaseDateMapForCodes([reqCode]))[reqCode];

    const main = req.main_systems || [];
    const firstMainSysCode = main[0] || null;

    const systemsList = await all('SELECT sys_code, sys_name FROM system');
    const sysMap = new Map(systemsList.map(s => [s.sys_code, s.sys_name]));

    const assignmentBySystem = intakeAssignmentMap(assignments);
    let targets = [];
    if (splitMode === 'overall') {
      const overallKey = firstMainSysCode || 'overall';
      targets = [{ sysCode: firstMainSysCode, assignmentKey: overallKey, taskName: `${testType}-${req.title}`, isSplit: false }];
    } else {
      const sysCodes = [...assignmentBySystem.keys()];
      for (const sysCode of sysCodes) {
        const sysName = sysMap.get(sysCode) || sysCode;
        targets.push({ sysCode, assignmentKey: sysCode, taskName: `${testType}-${req.title}-${sysName}`, isSplit: true });
      }
    }
    if (!targets.length) throw badRequest('请至少选择一个测试任务');
    const configuredSystems = new Set([...main, ...(req.collab_test_systems || [])]);
    if (splitMode !== 'overall' && targets.some((target) => !configuredSystems.has(target.sysCode))) throw badRequest('存在不属于该需求/工单的测试系统');
    for (const target of targets) {
      const assignment = assignmentBySystem.get(target.assignmentKey);
      if (!assignment?.owner) throw badRequest('请为每个测试任务选择测试负责人');
      if (!await isActivePersonName(assignment.owner)) throw badRequest(`测试负责人 [${assignment.owner}] 不存在或已停用`);
      assignment.implOrg = await resolveExistingDictAttr('org', assignment.implOrg);
      if (!assignment.implOrg) throw badRequest('请为每个测试任务选择有效的测试实施方');
      target.owner = assignment.owner;
      target.implOrg = assignment.implOrg;
    }

    const existing = await all('SELECT impl_system, task_name FROM test_task WHERE req_code = ? AND test_type = ?', reqCode, testType);
    targets = targets.filter(t => !existing.some(e => e.task_name === t.taskName));

    if (!targets.length) throw badRequest('所选测试任务已全部建立');

    const created = await tx(async () => {
      const out = [];
      const initialStatus = await defaultProcessStatus('测试', 'initial', '测试承接');
      for (const t of targets) {
        const taskCode = await generateTestTaskCode(testType, reqCode, releaseWindow);
        const res = await run(
          `INSERT INTO test_task (req_code, task_code, task_name, test_type, status, owner, intake_owner, impl_system, impl_org, registrar, register_time)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          reqCode, taskCode, t.taskName, testType, initialStatus, t.owner, request.currentUser?.name || null, t.sysCode || null, t.implOrg,
          request.currentUser?.name, beijingDateString(),
        );
        await auditCreate('test', res.lastInsertRowid, taskCode, request.currentUser?.name);
        out.push({ id: res.lastInsertRowid, task_code: taskCode });
      }
      return out;
    });
    return ok(created, `已承接 ${created.length} 个${TYPE_NAME[testType]}任务`);
  });

  // 修改
  fastify.put('/test-tasks/:id', async (request) => {
    const id = request.params.id;
    const old = await get('SELECT * FROM test_task WHERE id = ?', id);
    if (!old) throw notFound();
    await requireAnyTestPerm(request, ['edit', 'status.edit'], old.test_type);
    await assertWorkItemOrganizationAccess(old.req_code, request.currentUser);
    const body = request.body || {};
    const data = {};
    for (const k of WRITABLE) if (body[k] !== undefined) data[k] = body[k];
    await assertStatusChangePermission(fastify, request, `test.${old.test_type}`, old.status, data);

    const merged = { ...old, ...data };
    await validateStageContent(`test.${merged.test_type}`, merged);
    data.deviation_rate = calcDeviation(merged.plan_start, merged.plan_end, merged.actual_end);

    const keys = Object.keys(data);
    await run(
      `UPDATE test_task SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
      ...keys.map((k) => data[k]), id,
    );
    await auditUpdate('test', id, old.task_code, request.currentUser?.name, old, data, LABELS);
    return ok({ id });
  });

  // 删除
  fastify.delete('/test-tasks/:id', async (request) => {
    const id = request.params.id;
    const row = await get('SELECT * FROM test_task WHERE id = ?', id);
    if (!row) throw notFound();
    await requireTestPerm(request, 'delete', row.test_type);
    await assertWorkItemOrganizationAccess(row.req_code, request.currentUser);
    await run('DELETE FROM test_task WHERE id = ?', id);
    await auditDelete('test', id, row.task_code, request.currentUser?.name);
    return ok(null, '删除成功');
  });

  // 导出
  fastify.post('/test-tasks/export', async (request, reply) => {
    const body = request.body || {};
    await requireTestPerm(request, 'export', body.test_type);
    const { where: baseWhere, params: baseParams } = inClause('req_code', body.req_code ? [body.req_code] : []);

    // 未指定工作项时，按当前投产点范围过滤；空范围代表全部投产点。
    let finalWhere = baseWhere;
    let finalParams = [...baseParams];
    const scopedCodes = await organizationWorkItemCodes(request.currentUser);
    if (scopedCodes !== null) {
      const scope = inClause('req_code', scopedCodes);
      finalWhere = [finalWhere, scope.where || '1=0'].filter(Boolean).join(' AND ');
      finalParams.push(...scope.params);
    }
    if (!body.req_code) {
      const codes = await workItemCodesInReleasePoints(windowIds(body));
      if (codes) {
        const win = inClause('req_code', codes);
        finalWhere = win.where || '1=0';
        finalParams = win.params;
      }
    }

    // 过滤特定的测试类型（前端分四个页面，所以会传入 test_type 的过滤条件）
    let whClause = finalWhere;
    if (body.test_type) {
      whClause = whClause ? `${whClause} AND test_type = ?` : 'test_type = ?';
      finalParams.push(body.test_type);
    }

    const result = await listQuery({
      table: 'test_task', columns: COLUMNS, searchColumns: SEARCH,
      query: { ...body, pageSize: 0 }, baseWhere: whClause, baseParams: finalParams,
    });

    const systems = await all('SELECT sys_code, sys_name FROM system');
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
      { key: 'plan_start', title: '计划开始时间' },
      { key: 'plan_end', title: '计划结束时间' },
      { key: 'actual_start', title: '实际开始时间' },
      { key: 'actual_end', title: '实际结束时间' },
      { key: 'deviation_rate', title: '排期偏差率 (%)' },
      { key: 'registrar', title: '登记人' },
      { key: 'register_time', title: '登记时间' },
      { key: 'test_plan', title: '测试方案' },
      { key: 'test_coverage_design', title: '测试覆盖性分析', width: 60, wrapText: true },
      { key: 'test_report', title: '测试报告' },
    ];

    // 测试覆盖性分析按需求/工单级别存储，仅 SIT 展示，按 req_code 缓存
    const coverageCache = {};
    const coverageTextFor = async (reqCode) => {
      if (!reqCode) return '';
      if (coverageCache[reqCode] === undefined) {
        const items = await all('SELECT * FROM impact_change_item WHERE req_code = ? ORDER BY sort_order, id', reqCode);
        const covs = await all('SELECT * FROM coverage_item WHERE req_code = ?', reqCode);
        const covMap = new Map(covs.map((c) => [c.change_item_id, c]));
        coverageCache[reqCode] = formatCoverageText(items, covMap);
      }
      return coverageCache[reqCode];
    };

    const mappedList = await Promise.all(result.list.map(async row => {
      const attaches = await all("SELECT * FROM attachment WHERE entity_type = 'test' AND entity_id = ?", row.id);
      return {
        ...row,
        test_type: TYPE_NAME[row.test_type] || row.test_type,
        impl_system: sysMap[row.impl_system] || row.impl_system,
        deviation_rate: row.deviation_rate != null ? `${row.deviation_rate}%` : '0%',
        test_plan: formatAttachments(attaches, '测试方案'),
        test_coverage_design: row.test_type === 'SIT' ? await coverageTextFor(row.req_code) : '',
        test_report: formatAttachments(attaches, '测试报告'),
      };
    }));

    const scopeKey = `test.${body.test_type}`;
    const extensionColumns = await getStageExcelColumns(scopeKey);
    const exportRows = await appendStageExcelValues(scopeKey, mappedList);
    const buf = await exportXlsx([...cols, ...extensionColumns], exportRows, '测试任务清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=test_tasks.xlsx');
    return reply.send(buf);
  });

  // 模板下载
  fastify.get('/test-tasks/template', async (request, reply) => {
    await requireTestPerm(request, 'import', request.query?.testType);
    const scopeKey = `test.${request.query?.testType}`;
    const buf = await exportXlsx([...IO_COLUMNS, ...await getStageExcelColumns(scopeKey)], [], '测试任务模板');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=test_tasks_template.xlsx');
    return reply.send(buf);
  });

  // 导入
  fastify.post('/test-tasks/import', async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = data.fields?.mode?.value || 'skip';
    const testType = data.fields?.testType?.value;
    await requireTestPerm(request, 'import', testType);
    const buffer = await data.toBuffer();
    const scopeKey = `test.${testType}`;
    const rows = await parseXlsx(buffer, [...IO_COLUMNS, ...await getStageExcelColumns(scopeKey)]);
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
    const details = [];

    const systems = await all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const TYPE_CODE = {
      '应用组装测试': 'SIT',
      '用户测试': 'UAT',
      '非功能测试': 'NFT',
      '安全测试': 'SEC'
    };

    const apply = async () => {
      for (const r of rows) {
        const rowNum = r.__rowNum__;
        try {
          if (!r.req_code) throw new Error('关联需求/工单编号不能为空');
          if (!r.task_name) throw new Error('测试任务名称不能为空');
          if (!r.test_type) throw new Error('测试类型不能为空');

          // 校验关联需求/工单编号是否存在
          const req = await getWorkItem(r.req_code);
          if (!req) throw new Error(`关联需求/工单编号 [${r.req_code}] 不存在`);
          const releaseWindow = (await releaseDateMapForCodes([r.req_code]))[r.req_code];

          // 翻译中文测试类型为 Code
          const testTypeCode = TYPE_CODE[String(r.test_type).trim()];
          if (!testTypeCode) {
            throw new Error(`测试类型 [${r.test_type}] 不合法，必须为 应用组装测试、用户测试、非功能测试、安全测试 之一`);
          }
          if (testTypeCode !== testType) throw new Error('导入数据的测试类型与当前页面不一致');

          // 兼容性字典/系统转换
          const status = await resolveDictAttr('process_status', r.status) || await defaultProcessStatus('测试', 'initial', '测试承接');
          const implOrg = await resolveDictAttr('org', r.impl_org);
          const implSystem = await resolveSystemCode(r.impl_system);
          const extensionValues = await extensionValuesFromExcelRow(scopeKey, r);

          let code = String(r.task_code || '').trim();
          const exists = code ? await get('SELECT * FROM test_task WHERE task_code = ?', code) : null;

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
            compareAndPush('intake_owner', '测试承接人', exists.intake_owner || '', r.intake_owner || '');
            compareAndPush('impl_system', '测试实施系统', sysMap[exists.impl_system] || exists.impl_system || '', sysMap[implSystem] || implSystem || '');
            compareAndPush('impl_org', '测试实施方', exists.impl_org || '', implOrg || '');
            compareAndPush('plan_start', '计划开始时间', exists.plan_start || '', r.plan_start || '');
            compareAndPush('plan_end', '计划结束时间', exists.plan_end || '', r.plan_end || '');
            compareAndPush('actual_start', '实际开始时间', exists.actual_start || '', r.actual_start || '');
            compareAndPush('actual_end', '实际结束时间', exists.actual_end || '', r.actual_end || '');

            if (changes.length > 0) {
              const devRate = calcDeviation(r.plan_start || exists.plan_start, r.plan_end || exists.plan_end, r.actual_end || exists.actual_end);
              await run(
                `UPDATE test_task SET 
                   task_name=?, test_type=?, status=?, owner=?, intake_owner=?, impl_system=?, impl_org=?,
                   plan_start=?, plan_end=?, actual_start=?, actual_end=?, deviation_rate=?, 
                   updated_at=datetime('now','localtime') 
                 WHERE id=?`,
                r.task_name, testTypeCode, status, r.owner || null, r.intake_owner || null, implSystem || null, implOrg || null,
                r.plan_start || null, r.plan_end || null, r.actual_start || null, r.actual_end || null, devRate, exists.id
              );
              await auditUpdate('test', exists.id, code, request.currentUser?.name, exists, {
                task_name: r.task_name, test_type: testTypeCode, status, owner: r.owner || null, intake_owner: r.intake_owner || null,
                impl_system: implSystem, impl_org: implOrg, plan_start: r.plan_start || null, plan_end: r.plan_end || null,
                actual_start: r.actual_start || null, actual_end: r.actual_end || null, deviation_rate: devRate
              }, LABELS);
            }
            await saveExtensionValues(scopeKey, exists.id, extensionValues, request.currentUser?.name);

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
            if (!code) code = await generateTestTaskCode(testTypeCode, r.req_code, releaseWindow);
            const devRate = calcDeviation(r.plan_start, r.plan_end, r.actual_end);
            const res = await run(
              `INSERT INTO test_task 
                 (req_code, task_code, task_name, test_type, status, owner, intake_owner, impl_system, impl_org,
                  plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              r.req_code, code, r.task_name, testTypeCode, status, r.owner || null, r.intake_owner || null, implSystem || null, implOrg || null,
              r.plan_start || null, r.plan_end || null, r.actual_start || null, r.actual_end || null, devRate,
              request.currentUser?.name, beijingDateString()
            );
            await auditCreate('test', res.lastInsertRowid, code, request.currentUser?.name);
            await saveExtensionValues(scopeKey, res.lastInsertRowid, extensionValues, request.currentUser?.name);
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
        await tx(apply);
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
      await apply();
    }

    return ok({ stat, details }, '导入完成');
  });
}

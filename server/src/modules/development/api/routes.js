/**
 * 文件：server/src/modules/development/api/routes.js
 * 说明：再次承接时仅为尚未建立开发任务的系统补建，避免重复。
 * 用途：开发管理模块接口。开发承接（按主责/协同改造系统拆分默认多条）、CRUD、
 *       排期偏差率演算、终态业务校验、留痕。
 * 作者：hengguan
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import {
  getDevelopmentIntakeImplementationOrgOverrideOrgs,
  windowIds, inClause, getDictDisplayMap, resolveDictAttr, resolveExistingDictAttr, resolveOrganizationValues, resolveSystemCode, formatAttachments,
} from '../../settings/reference-data/index.js';
import { ok, notFound, badRequest, forbidden } from '../../../platform/runtime/index.js';
import { assertStatusChangePermission } from '../../settings/process-configuration/index.js';
import { exportXlsx, parseXlsx } from '../../../platform/import-export/index.js';
import {
  calcDeviation, decodeChangeItem, formatImpactItemsText, generateDevTaskCode,
  getWorkItem, replaceWorkItemDevelopmentSystemRoles, workItemCodesInReleasePoints, releaseDateMapForCodes,
} from '../index.js';
import { codePrefix, codeTemplateValues, formatCode } from '../../../shared/utils/code-template.js';
import { resolveCurrentTaskStatuses } from '../../overview/index.js';
import { isOrganizationRestricted, organizationMatches, workItemMatchesOrganization } from '../../../shared/utils/organization-scope.js';
import { isActivePersonName } from '../../identity-access/index.js';
import { beijingDateString, beijingDateTimeString } from '../../../shared/utils/time.js';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';

// 导入模板和常用列定义
const IO_COLUMNS = [
  { key: 'req_code', title: '关联需求/工单编号' },
  { key: 'task_code', title: '开发任务编号' },
  { key: 'task_name', title: '开发任务名称' },
  { key: 'content', title: '开发内容概述' },
  { key: 'status', title: '开发状态' },
  { key: 'owner', title: '开发负责人' },
  { key: 'intake_owner', title: '开发承接人' },
  { key: 'impl_system', title: '开发实施系统' },
  { key: 'impl_org', title: '开发实施方' },
  { key: 'plan_start', title: '计划开始时间' },
  { key: 'plan_end', title: '计划结束时间' },
  { key: 'actual_start', title: '实际开始时间' },
  { key: 'actual_end', title: '实际结束时间' },
];

const COLUMNS = [
  'id', 'req_code', 'task_code', 'task_name', 'content', 'status', 'owner', 'intake_owner', 'impl_system', 'impl_org',
  'plan_start', 'plan_end', 'actual_start', 'actual_end', 'deviation_rate', 'created_at',
];
const SEARCH = ['task_code', 'task_name', 'owner', 'intake_owner', 'impl_system'];

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
const WRITABLE = ['task_name', 'content', 'status', 'owner', 'intake_owner', 'impl_system', 'impl_org',
  'plan_start', 'plan_end', 'actual_start', 'actual_end'];
const LABELS = {
  task_name: '开发任务名称', content: '开发内容概述', status: '开发状态', owner: '开发负责人', intake_owner: '开发承接人',
  impl_system: '开发实施系统', impl_org: '开发实施方', plan_start: '计划开始时间', plan_end: '计划结束时间',
  actual_start: '实际开始时间', actual_end: '实际结束时间', deviation_rate: '排期偏差率',
};

function configuredDevelopmentSystemRoles(main, collab) {
  const rows = [];
  const seen = new Set();
  for (const sysCode of main || []) {
    if (sysCode && !seen.has(sysCode)) {
      seen.add(sysCode);
      rows.push({ sysCode, role: '主责' });
    }
  }
  for (const sysCode of collab || []) {
    if (sysCode && !seen.has(sysCode)) {
      seen.add(sysCode);
      rows.push({ sysCode, role: '协同' });
    }
  }
  return rows;
}

function intakeAssignmentMap(assignments) {
  const result = new Map();
  for (const item of Array.isArray(assignments) ? assignments : []) {
    const sysCode = String(item?.sysCode || '').trim();
    if (!sysCode) throw badRequest('开发任务缺少实施系统');
    if (result.has(sysCode)) throw badRequest(`开发任务实施系统 [${sysCode}] 重复`);
    result.set(sysCode, {
      owner: String(item?.owner || '').trim(),
      implOrg: String(item?.implOrg || '').trim(),
    });
  }
  return result;
}

function intakeSystemRoleMap(systemRoles) {
  const result = new Map();
  for (const item of Array.isArray(systemRoles) ? systemRoles : []) {
    const sysCode = String(item?.sysCode || '').trim();
    const role = String(item?.role || '').trim();
    if (!sysCode) throw badRequest('开发系统角色缺少实施系统');
    if (!['主责', '协同'].includes(role)) throw badRequest(`开发系统 [${sysCode}] 的角色仅支持主责或协同`);
    if (result.has(sysCode)) throw badRequest(`开发系统 [${sysCode}] 的角色重复`);
    result.set(sysCode, role);
  }
  return result;
}

async function visibleDevelopmentSystemCodes(req, systemRoles, user) {
  if (!isOrganizationRestricted(user)) return new Set(systemRoles.map((item) => item.sysCode));
  const organizations = await resolveOrganizationValues(user?.org);
  const implementationOrgMatched = organizationMatches(req.implementation_org, organizations);
  const systems = await all('SELECT sys_code, org FROM system');
  const orgBySystem = new Map(systems.map((system) => [system.sys_code, system.org]));
  return new Set(systemRoles
    .filter((item) => implementationOrgMatched || organizationMatches(orgBySystem.get(item.sysCode), organizations))
    .map((item) => item.sysCode));
}
const TEMPLATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../templates/dev-documents');

async function templatePath(filename) {
  const fullPath = path.join(TEMPLATE_DIR, filename);
  try {
    await fs.access(fullPath);
    return fullPath;
  } catch {
    throw notFound(`模板文件不存在：${filename}`);
  }
}

function formatLocalMinute(d = new Date()) {
  return beijingDateTimeString(d).slice(0, 16);
}

function filenameSafe(text) {
  return String(text || '未命名').replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名';
}

function taskSeq(taskCode, id) {
  const m = String(taskCode || '').match(/(\d+)$/);
  return m ? m[1] : String(id || '001');
}

function attachmentFilename({ systemName, docName, reqCode, taskCode, id, ext }) {
  return `${filenameSafe(systemName)}-${docName}-${filenameSafe(reqCode)}-${taskSeq(taskCode, id)}.${ext}`;
}

async function devTemplateContext(taskId) {
  const task = await get('SELECT * FROM dev_task WHERE id = ?', taskId);
  if (!task) throw notFound('开发任务不存在');
  const item = await getWorkItem(task.req_code);
  const sys = task.impl_system ? await get('SELECT sys_name FROM system WHERE sys_code = ?', task.impl_system) : null;
  return {
    task,
    item,
    systemName: sys?.sys_name || task.impl_system || '未配置系统',
    workItemTitle: item?.title || '',
    workItemCode: item?.req_code || task.req_code || '',
  };
}

async function buildCodingChecklistTemplate(ctx, userName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await templatePath('编码检查表模版.xlsx'));
  const sheet = workbook.worksheets[0];
  sheet.getCell('B3').value = ctx.workItemTitle;
  sheet.getCell('B4').value = ctx.workItemCode;
  sheet.getCell('D5').value = userName || '';
  sheet.getCell('B6').value = userName || '';
  sheet.getCell('D6').value = formatLocalMinute();
  return await workbook.xlsx.writeBuffer();
}

function xmlEscape(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainTextFromXml(xml) {
  return xml.replace(/<[^>]+>/g, '');
}

function cellTextXml(text) {
  const lines = String(text || '').split(/\r?\n/);
  return lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`).join('');
}

function replaceCellText(cellXml, text) {
  const props = cellXml.match(/<w:tcPr[\s\S]*?<\/w:tcPr>/)?.[0] || '';
  return cellXml.replace(/(<w:tc\b[^>]*>)[\s\S]*(<\/w:tc>)/, `$1${props}${cellTextXml(text)}$2`);
}

function fillRightCellByLabel(documentXml, label, value) {
  const rows = documentXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
  for (const row of rows) {
    if (!plainTextFromXml(row).includes(label)) continue;
    const cells = row.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
    if (cells.length < 2) continue;
    const nextRow = row.replace(cells[1], replaceCellText(cells[1], value));
    return documentXml.replace(row, nextRow);
  }
  return documentXml;
}

function techSolutionText(items) {
  return (items || []).map((row, index) => {
    const item = decodeChangeItem(row);
    const impact = item.impact_analysis
      || [item.upstream_impact, item.data_impact, item.job_chain_change_detail, item.updown_dep_change_detail, item.runtime_change_detail].filter(Boolean).join('；')
      || '—';
    return [
      `${index + 1}. 变更模块：${item.category || '—'}`,
      `系统名称：${item.system || '—'}`,
      `变更类型：${item.change_kind || '—'}`,
      `变更内容：${item.change_content || '—'}`,
      `影响分析：${impact}`,
    ].join('\n');
  }).join('\n\n');
}

async function buildTechSolutionTemplate(ctx) {
  const template = await fs.readFile(await templatePath('技术方案确认单模版.docx'));
  const zip = await JSZip.loadAsync(template);
  const documentPath = 'word/document.xml';
  const items = await all('SELECT * FROM impact_change_item WHERE req_code = ? ORDER BY sort_order, id', ctx.workItemCode);
  let xml = await zip.file(documentPath).async('string');
  xml = fillRightCellByLabel(xml, '*需求系统流水号', ctx.workItemTitle);
  xml = fillRightCellByLabel(xml, '*技术实现方案简述', techSolutionText(items));
  zip.file(documentPath, xml);
  return await zip.generateAsync({ type: 'nodebuffer' });
}

export default async function devTaskRoutes(fastify) {
  // 列表（可按 req_code 或当前投产窗口过滤）
  fastify.post('/dev-tasks/list', { preHandler: fastify.requirePerm('dev', 'view') }, async (request) => {
    const body = request.body || {};
    const wh = [];
    const params = [];
    await appendOrganizationScope(wh, params, 'req_code', request.currentUser);

    const filters = Array.isArray(body.filters) ? body.filters : [];
    const normalFilters = [];
    let hasReleasePointFilter = false;

    for (const f of filters) {
      if (!f || f.value === undefined || f.value === null || f.value === '') continue;

      if (f.field === 'content') {
        wh.push('(task_name LIKE ? OR content LIKE ?)');
        params.push(`%${f.value}%`, `%${f.value}%`);
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
      table: 'dev_task', columns: COLUMNS, searchColumns: SEARCH, query: newBody,
      baseWhere, baseParams: params, extensionScopeKey: 'dev', extensionEntityType: 'dev',
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
    result.list = await appendStageListValues('dev', result.list);

    return ok(result);
  });

  // 详情
  // 组装开发任务详情：附带关联需求/工单标题（供详情联动展示）
  const buildDevDetail = async (row) => {
    const item = await getWorkItem(row.req_code);
    return {
      ...row,
      req_title: item?.title || null,
      entity_type: item?.entity_type || null,
      entity_label: item?.entity_label || null,
      attachments: await listByEntity('dev', row.id),
    };
  };

  fastify.get('/dev-tasks/:id', { preHandler: fastify.requirePerm('dev', 'view') }, async (request) => {
    const row = await get('SELECT * FROM dev_task WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    await assertWorkItemOrganizationAccess(row.req_code, request.currentUser);
    return ok(await buildDevDetail(row));
  });

  // 按开发任务编号查询（供详情单页通过 URL 编号直达）
  fastify.get('/dev-tasks/by-code/:code', { preHandler: fastify.requirePerm('dev', 'view') }, async (request) => {
    const row = await get('SELECT * FROM dev_task WHERE task_code = ?', request.params.code);
    if (!row) throw notFound();
    await assertWorkItemOrganizationAccess(row.req_code, request.currentUser);
    return ok(await buildDevDetail(row));
  });

  // 阶段附件模板下载：按当前开发任务预填业务信息
  fastify.get('/dev-tasks/:id/attachment-template', { preHandler: fastify.requirePerm('dev', 'view') }, async (request, reply) => {
    const fieldKey = String(request.query?.fieldKey || '').trim();
    if (!['编码检查表', '技术方案确认单'].includes(fieldKey)) throw badRequest('不支持的模板类型');
    const ctx = await devTemplateContext(request.params.id);
    const isCodingChecklist = fieldKey === '编码检查表';
    const filename = attachmentFilename({
      systemName: ctx.systemName,
      docName: fieldKey,
      reqCode: ctx.workItemCode,
      taskCode: ctx.task.task_code,
      id: ctx.task.id,
      ext: isCodingChecklist ? 'xlsx' : 'docx',
    });
    const buf = isCodingChecklist
      ? await buildCodingChecklistTemplate(ctx, request.currentUser?.name)
      : await buildTechSolutionTemplate(ctx);

    reply.header('Content-Type', isCodingChecklist
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return reply.send(Buffer.from(buf));
  });

  // 承接候选二次裁决：前端先按既有列表状态过滤，本接口仅保留还有未建开发任务的工作项。
  fastify.post('/dev-tasks/intake-pending-codes', { preHandler: fastify.requirePerm('dev', 'create') }, async (request) => {
    const requestedCodes = [...new Set((Array.isArray(request.body?.reqCodes) ? request.body.reqCodes : []).map(String).filter(Boolean))].slice(0, 500);
    if (!requestedCodes.length) return ok([]);
    const scopedCodes = await organizationWorkItemCodes(request.currentUser);
    const permittedCodes = scopedCodes === null ? requestedCodes : requestedCodes.filter((code) => scopedCodes.includes(code));
    if (!permittedCodes.length) return ok([]);
    const systems = await all('SELECT sys_code, org FROM system');
    const systemOrg = new Map(systems.map((system) => [system.sys_code, system.org]));
    const organizations = isOrganizationRestricted(request.currentUser)
      ? await resolveOrganizationValues(request.currentUser.org)
      : null;
    const clause = inClause('req_code', permittedCodes);
    const existingRows = await all(`SELECT req_code, impl_system FROM dev_task WHERE ${clause.where}`, ...clause.params);
    const existingByCode = new Map();
    for (const row of existingRows) {
      if (!existingByCode.has(row.req_code)) existingByCode.set(row.req_code, new Set());
      existingByCode.get(row.req_code).add(row.impl_system);
    }
    const pending = [];
    for (const code of permittedCodes) {
      const item = await getWorkItem(code);
      if (!item) continue;
      const configured = [...new Set([...(item.main_systems || []), ...(item.collab_dev_systems || [])])];
      const implementationOrgMatched = organizations && organizationMatches(item.implementation_org, organizations);
      const allowed = configured.filter((sysCode) => !organizations || implementationOrgMatched || organizationMatches(systemOrg.get(sysCode), organizations));
      if (allowed.some((sysCode) => !existingByCode.get(code)?.has(sysCode))) pending.push(code);
    }
    return ok(pending);
  });

  // 开发承接预览
  fastify.post('/dev-tasks/intake-preview', { preHandler: fastify.requirePerm('dev', 'create') }, async (request) => {
    const { reqCode } = request.body || {};
    if (!reqCode) throw badRequest('请选择需求/工单');
    const req = await getWorkItem(reqCode);
    if (!req) throw notFound('需求/工单不存在');
    await assertWorkItemOrganizationAccess(reqCode, request.currentUser);
    const releaseWindow = (await releaseDateMapForCodes([reqCode]))[reqCode];

    const main = req.main_systems || [];
    const collab = req.collab_dev_systems || [];

    const existingTasks = await all('SELECT impl_system, task_code, task_name, status, owner FROM dev_task WHERE req_code = ?', reqCode);
    const existingMap = new Map(existingTasks.map(t => [t.impl_system, t]));

    const systems = await all('SELECT sys_code, sys_name, org FROM system');
    const sysMap = new Map(systems.map(s => [s.sys_code, s.sys_name]));
    const sysOrgMap = new Map(systems.map(s => [s.sys_code, s.org]));
    const overrideOrgs = new Set(await getDevelopmentIntakeImplementationOrgOverrideOrgs());
    const sharedDefaultImplOrg = overrideOrgs.has(req.implementation_org) ? req.implementation_org : null;

    const allSystems = configuredDevelopmentSystemRoles(main, collab);

    const tplRow = await get("SELECT value FROM app_config WHERE key = 'code.dev'");
    const tpl = tplRow?.value || 'RW_{需求/工单编号}_{序号[3]}';
    const codeValues = codeTemplateValues({ releaseWindow, workItemCode: reqCode });
    const prefix = codePrefix(tpl, codeValues);

    const existingCodes = await all(`SELECT task_code FROM dev_task WHERE task_code LIKE ?`, `${prefix}%`);
    let max = 0;
    for (const r of existingCodes) {
      const tail = String(r.task_code).slice(prefix.length);
      const n = parseInt(tail, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }

    const list = [];
    let currentMax = max;

    const organizations = isOrganizationRestricted(request.currentUser)
      ? await resolveOrganizationValues(request.currentUser.org)
      : null;
    // 手工实施机构是业务人员对工作项实施归属的明确确认，可纠正系统主数据尚未同步的归属。
    const implementationOrgMatched = organizations && organizationMatches(req.implementation_org, organizations);
    for (const item of allSystems) {
      if (organizations && !implementationOrgMatched && !organizationMatches(systems.find((system) => system.sys_code === item.sysCode)?.org, organizations)) continue;
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
          owner: exist.owner,
          defaultImplOrg: sharedDefaultImplOrg || sysOrgMap.get(item.sysCode) || null,
          status: '已建任务',
        });
      } else {
        currentMax++;
        const taskCode = formatCode(tpl, codeValues, currentMax);
        const taskName = `RW-${req.title}-${sysName}`;
        list.push({
          sysCode: item.sysCode,
          sysName,
          role: item.role,
          exists: false,
          taskCode,
          taskName,
          defaultImplOrg: sharedDefaultImplOrg || sysOrgMap.get(item.sysCode) || null,
          status: '新建任务',
        });
      }
    }

    return ok(list);
  });

  // 开发承接（按系统拆分）
  fastify.post('/dev-tasks/intake', { preHandler: fastify.requirePerm('dev', 'create') }, async (request) => {
    const { reqCode, assignments, systemRoles } = request.body || {};
    if (!reqCode) throw badRequest('请选择需求/工单');
    const req = await getWorkItem(reqCode);
    if (!req) throw notFound('需求/工单不存在');
    await assertWorkItemOrganizationAccess(reqCode, request.currentUser);
    const releaseWindow = (await releaseDateMapForCodes([reqCode]))[reqCode];

    // 角色确认覆盖当前用户可见的完整预览集合；无可见权限的系统维持原角色，避免越权覆盖。
    const main = req.main_systems || [];
    const collab = req.collab_dev_systems || [];
    const configuredRoles = configuredDevelopmentSystemRoles(main, collab);
    const configuredSystems = new Set(configuredRoles.map((item) => item.sysCode));
    const roleBySystem = intakeSystemRoleMap(systemRoles);
    const visibleSystems = await visibleDevelopmentSystemCodes(req, configuredRoles, request.currentUser);
    if (roleBySystem.size !== visibleSystems.size || [...visibleSystems].some((sysCode) => !roleBySystem.has(sysCode))) {
      throw badRequest('请确认预览中的全部开发系统角色');
    }
    if ([...roleBySystem.keys()].some((sysCode) => !visibleSystems.has(sysCode))) {
      throw badRequest('存在不属于当前承接预览的开发系统角色');
    }
    const finalRoles = configuredRoles.map((item) => ({ ...item, role: roleBySystem.get(item.sysCode) || item.role }));
    const nextMainSystems = finalRoles.filter((item) => item.role === '主责').map((item) => item.sysCode);
    const nextCollabSystems = finalRoles.filter((item) => item.role === '协同').map((item) => item.sysCode);
    if (nextMainSystems.length !== 1) throw badRequest('开发系统角色必须且只能选择一个主责系统');

    const assignmentBySystem = intakeAssignmentMap(assignments);
    let targets = [...assignmentBySystem.keys()];
    if (!targets.length) throw badRequest('该需求/工单未配置主责/协同改造系统，无法承接开发');
    if (targets.some((sysCode) => !configuredSystems.has(sysCode))) throw badRequest('存在不属于该需求/工单的开发系统');
    for (const sysCode of targets) {
      const assignment = assignmentBySystem.get(sysCode);
      if (!assignment.owner) throw badRequest('请为每个开发任务选择开发负责人');
      if (!await isActivePersonName(assignment.owner)) throw badRequest(`开发负责人 [${assignment.owner}] 不存在或已停用`);
      assignment.implOrg = await resolveExistingDictAttr('org', assignment.implOrg);
      if (!assignment.implOrg) throw badRequest('请为每个开发任务选择有效的开发实施方');
    }
    if (isOrganizationRestricted(request.currentUser)) {
      const organizations = await resolveOrganizationValues(request.currentUser.org);
      const implementationOrgMatched = organizationMatches(req.implementation_org, organizations);
      for (const sysCode of targets) {
        const sys = await get('SELECT org FROM system WHERE sys_code = ?', sysCode);
        if (!sys || (!implementationOrgMatched && !organizationMatches(sys.org, organizations))) throw forbidden('仅可承接本人机构实施系统');
      }
    }

    // 已存在开发任务的系统跳过
    const existing = new Set((await all('SELECT impl_system FROM dev_task WHERE req_code = ?', reqCode)).map((r) => r.impl_system));
    targets = targets.filter((s) => !existing.has(s));
    if (!targets.length) throw badRequest('所选系统均已建立开发任务');

    const created = await tx(async () => {
      const out = [];
      const initialStatus = await defaultProcessStatus('开发', 'initial', '开发承接');
      for (const sysCode of targets) {
        const sys = await get('SELECT * FROM system WHERE sys_code = ?', sysCode);
        const taskCode = await generateDevTaskCode(reqCode, releaseWindow);
        const taskName = `RW-${req.title}-${sys?.sys_name || sysCode}`;
        const res = await run(
          `INSERT INTO dev_task (req_code, task_code, task_name, status, owner, intake_owner, impl_system, impl_org, registrar, register_time)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          reqCode, taskCode, taskName, initialStatus, assignmentBySystem.get(sysCode).owner, request.currentUser?.name || null, sysCode, assignmentBySystem.get(sysCode).implOrg,
          request.currentUser?.name, beijingDateString(),
        );
        await auditCreate('dev', res.lastInsertRowid, taskCode, request.currentUser?.name);
        out.push({ id: res.lastInsertRowid, task_code: taskCode });
      }
      const updated = await replaceWorkItemDevelopmentSystemRoles({
        workItemCode: reqCode,
        mainSystem: nextMainSystems[0],
        collabSystems: nextCollabSystems,
        actor: request.currentUser?.name,
      });
      if (!updated) throw notFound('需求/工单不存在');
      return out;
    });
    return ok(created, `已承接 ${created.length} 个开发任务`);
  });

  // 修改
  fastify.put('/dev-tasks/:id', { preHandler: fastify.requireAnyPerm('dev', ['edit', 'status.edit']) }, async (request) => {
    const id = request.params.id;
    const old = await get('SELECT * FROM dev_task WHERE id = ?', id);
    if (!old) throw notFound();
    await assertWorkItemOrganizationAccess(old.req_code, request.currentUser);
    const body = request.body || {};
    const data = {};
    for (const k of WRITABLE) if (body[k] !== undefined) data[k] = body[k];
    await assertStatusChangePermission(fastify, request, 'dev', old.status, data);

    const merged = { ...old, ...data };
    await validateStageContent('dev', merged);
    // 重算偏差率
    data.deviation_rate = calcDeviation(merged.plan_start, merged.plan_end, merged.actual_end);

    const keys = Object.keys(data);
    await run(
      `UPDATE dev_task SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
      ...keys.map((k) => data[k]), id,
    );
    await auditUpdate('dev', id, old.task_code, request.currentUser?.name, old, data, LABELS);
    return ok({ id });
  });

  // 删除
  fastify.delete('/dev-tasks/:id', { preHandler: fastify.requirePerm('dev', 'delete') }, async (request) => {
    const id = request.params.id;
    const row = await get('SELECT * FROM dev_task WHERE id = ?', id);
    if (!row) throw notFound();
    await assertWorkItemOrganizationAccess(row.req_code, request.currentUser);
    await run('DELETE FROM dev_task WHERE id = ?', id);
    await auditDelete('dev', id, row.task_code, request.currentUser?.name);
    return ok(null, '删除成功');
  });

  // 导出
  fastify.post('/dev-tasks/export', { preHandler: fastify.requirePerm('dev', 'export') }, async (request, reply) => {
    const body = request.body || {};
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

    const result = await listQuery({
      table: 'dev_task', columns: COLUMNS, searchColumns: SEARCH,
      query: { ...body, pageSize: 0 }, baseWhere: finalWhere, baseParams: finalParams,
    });

    const systems = await all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const cols = [
      { key: 'req_code', title: '关联需求/工单编号' },
      { key: 'task_code', title: '开发任务编号' },
      { key: 'task_name', title: '开发任务名称' },
      { key: 'content', title: '开发内容概述' },
      { key: 'status', title: '开发状态' },
      { key: 'owner', title: '开发负责人' },
      { key: 'impl_system', title: '开发实施系统' },
      { key: 'impl_org', title: '开发实施方' },
      { key: 'plan_start', title: '计划开始时间' },
      { key: 'plan_end', title: '计划结束时间' },
      { key: 'actual_start', title: '实际开始时间' },
      { key: 'actual_end', title: '实际结束时间' },
      { key: 'deviation_rate', title: '排期偏差率 (%)' },
      { key: 'registrar', title: '登记人' },
      { key: 'register_time', title: '登记时间' },
      { key: 'design_brief', title: '概要设计' },
      { key: 'design_detail', title: '详细设计' },
      { key: 'code_review', title: '代码走查' },
      { key: 'unit_test', title: '单元测试报告' },
      { key: 'coding_checklist', title: '编码检查表' },
      { key: 'tech_solution_confirm', title: '技术方案确认单' },
      { key: 'impact_analysis', title: '影响性分析', width: 60, wrapText: true },
    ];

    // 影响性分析按需求/工单级别存储，按 req_code 缓存，避免逐任务重复查询
    const impactCache = {};
    const impactTextFor = async (reqCode) => {
      if (!reqCode) return '';
      if (impactCache[reqCode] === undefined) {
        const items = await all('SELECT * FROM impact_change_item WHERE req_code = ? ORDER BY sort_order, id', reqCode);
        impactCache[reqCode] = formatImpactItemsText(items);
      }
      return impactCache[reqCode];
    };

    const mappedList = await Promise.all(result.list.map(async row => {
      const attaches = await all("SELECT * FROM attachment WHERE entity_type = 'dev' AND entity_id = ?", row.id);
      return {
        ...row,
        impl_system: sysMap[row.impl_system] || row.impl_system,
        deviation_rate: row.deviation_rate != null ? `${row.deviation_rate}%` : '0%',
        design_brief: formatAttachments(attaches, '概要设计'),
        design_detail: formatAttachments(attaches, '详细设计'),
        code_review: formatAttachments(attaches, '代码走查'),
        unit_test: formatAttachments(attaches, '单元测试报告'),
        coding_checklist: formatAttachments(attaches, '编码检查表'),
        tech_solution_confirm: formatAttachments(attaches, '技术方案确认单'),
        impact_analysis: await impactTextFor(row.req_code),
      };
    }));

    const extensionColumns = await getStageExcelColumns('dev');
    const exportRows = await appendStageExcelValues('dev', mappedList);
    const buf = await exportXlsx([...cols, ...extensionColumns], exportRows, '开发任务清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=dev_tasks.xlsx');
    return reply.send(buf);
  });

  // 模板下载
  fastify.get('/dev-tasks/template', { preHandler: fastify.requirePerm('dev', 'import') }, async (request, reply) => {
    const buf = await exportXlsx([...IO_COLUMNS, ...await getStageExcelColumns('dev')], [], '开发任务模板');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=dev_tasks_template.xlsx');
    return reply.send(buf);
  });

  // 导入
  fastify.post('/dev-tasks/import', { preHandler: fastify.requirePerm('dev', 'import') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = data.fields?.mode?.value || 'skip';
    const buffer = await data.toBuffer();
    const rows = await parseXlsx(buffer, [...IO_COLUMNS, ...await getStageExcelColumns('dev')]);
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
    const details = [];

    const systems = await all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const apply = async () => {
      for (const r of rows) {
        const rowNum = r.__rowNum__;
        try {
          if (!r.req_code) throw new Error('关联需求/工单编号不能为空');
          if (!r.task_name) throw new Error('开发任务名称不能为空');

          // 校验关联需求/工单编号是否存在
          const req = await getWorkItem(r.req_code);
          if (!req) throw new Error(`关联需求/工单编号 [${r.req_code}] 不存在`);
          const releaseWindow = (await releaseDateMapForCodes([r.req_code]))[r.req_code];

          // 兼容性字典/系统转换
          const status = await resolveDictAttr('process_status', r.status) || await defaultProcessStatus('开发', 'initial', '开发承接');
          const implOrg = await resolveDictAttr('org', r.impl_org);
          const implSystem = await resolveSystemCode(r.impl_system);
          const extensionValues = await extensionValuesFromExcelRow('dev', r);

          let code = String(r.task_code || '').trim();
          const exists = code ? await get('SELECT * FROM dev_task WHERE task_code = ?', code) : null;

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
              throw new Error(`开发任务编号 [${code}] 已存在，无法覆盖`);
            }

            // overwrite 模式：比对并更新
            const changes = [];
            const compareAndPush = (fieldKey, fieldName, oldVal, newVal) => {
              if (oldVal !== newVal) {
                changes.push({ field: fieldName, old: oldVal, new: newVal });
              }
            };

            compareAndPush('task_name', '开发任务名称', exists.task_name || '', r.task_name || '');
            compareAndPush('content', '开发内容概述', exists.content || '', r.content || '');
            compareAndPush('status', '开发状态', exists.status || '', status || '');
            compareAndPush('owner', '开发负责人', exists.owner || '', r.owner || '');
            compareAndPush('intake_owner', '开发承接人', exists.intake_owner || '', r.intake_owner || '');
            compareAndPush('impl_system', '开发实施系统', sysMap[exists.impl_system] || exists.impl_system || '', sysMap[implSystem] || implSystem || '');
            compareAndPush('impl_org', '开发实施方', exists.impl_org || '', implOrg || '');
            compareAndPush('plan_start', '计划开始时间', exists.plan_start || '', r.plan_start || '');
            compareAndPush('plan_end', '计划结束时间', exists.plan_end || '', r.plan_end || '');
            compareAndPush('actual_start', '实际开始时间', exists.actual_start || '', r.actual_start || '');
            compareAndPush('actual_end', '实际结束时间', exists.actual_end || '', r.actual_end || '');

            if (changes.length > 0) {
              const devRate = calcDeviation(r.plan_start || exists.plan_start, r.plan_end || exists.plan_end, r.actual_end || exists.actual_end);
              await run(
                `UPDATE dev_task SET 
                   task_name=?, content=?, status=?, owner=?, intake_owner=?, impl_system=?, impl_org=?,
                   plan_start=?, plan_end=?, actual_start=?, actual_end=?, deviation_rate=?, 
                   updated_at=datetime('now','localtime') 
                 WHERE id=?`,
                r.task_name, r.content || null, status, r.owner || null, r.intake_owner || null, implSystem || null, implOrg || null,
                r.plan_start || null, r.plan_end || null, r.actual_start || null, r.actual_end || null, devRate, exists.id
              );
              await auditUpdate('dev', exists.id, code, request.currentUser?.name, exists, {
                task_name: r.task_name, content: r.content || null, status, owner: r.owner || null, intake_owner: r.intake_owner || null,
                impl_system: implSystem, impl_org: implOrg, plan_start: r.plan_start || null, plan_end: r.plan_end || null,
                actual_start: r.actual_start || null, actual_end: r.actual_end || null, deviation_rate: devRate
              }, LABELS);
            }
            await saveExtensionValues('dev', exists.id, extensionValues, request.currentUser?.name);

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
            if (!code) code = await generateDevTaskCode(r.req_code, releaseWindow);
            const devRate = calcDeviation(r.plan_start, r.plan_end, r.actual_end);
            const res = await run(
              `INSERT INTO dev_task 
                 (req_code, task_code, task_name, content, status, owner, intake_owner, impl_system, impl_org,
                  plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              r.req_code, code, r.task_name, r.content || null, status, r.owner || null, r.intake_owner || null, implSystem || null, implOrg || null,
              r.plan_start || null, r.plan_end || null, r.actual_start || null, r.actual_end || null, devRate,
              request.currentUser?.name, beijingDateString()
            );
            await auditCreate('dev', res.lastInsertRowid, code, request.currentUser?.name);
            await saveExtensionValues('dev', res.lastInsertRowid, extensionValues, request.currentUser?.name);
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
            key: r.task_code || '未知任务编号',
            title: r.task_name || '空开发任务名称',
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

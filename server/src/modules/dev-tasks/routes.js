/**
 * 文件：modules/dev-tasks/routes.js
 * 用途：开发管理模块接口。开发承接（按主责/协同改造系统拆分默认多条）、CRUD、
 *       排期偏差率演算、终态业务校验、留痕。
 * 作者：hengguan
 * 说明：再次承接时仅为尚未建立开发任务的系统补建，避免重复。
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get, all, run, tx } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { genDevCode } from '../../lib/code-gen.js';
import { defaultProcessStatus } from '../../lib/status.js';
import { statusTypeForProcessStatus, validateRequiredFields } from '../../lib/required-fields.js';
import { calcDeviation } from '../../lib/deviation.js';
import { auditCreate, auditUpdate, auditDelete } from '../../lib/audit.js';
import { listByEntity } from '../../lib/attachment.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, notFound, badRequest } from '../../lib/http.js';
import { exportXlsx, parseXlsx } from '../../lib/excel.js';
import { resolveDictAttr, resolveSystemCode, formatAttachments } from '../../lib/resolver.js';
import { getWorkItem, workItemCodesInReleasePoints, releaseDateMapForCodes } from '../../lib/work-items.js';
import { decodeChangeItem, formatImpactItemsText } from '../../lib/impact-schema.js';
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
  { key: 'impl_system', title: '开发实施系统' },
  { key: 'impl_org', title: '开发实施方' },
  { key: 'plan_start', title: '计划开始时间' },
  { key: 'plan_end', title: '计划结束时间' },
  { key: 'actual_start', title: '实际开始时间' },
  { key: 'actual_end', title: '实际结束时间' },
];

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
  actual_start: '实际开始时间', actual_end: '实际结束时间', deviation_rate: '排期偏差率',
};
// 本阶段附件字段
const ATTACH_FIELDS = ['概要设计', '详细设计', '代码走查', '单元测试报告', '编码检查表', '技术方案确认单', '影响性分析文档'];
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
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`;
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

    const result = await listQuery({ table: 'dev_task', columns: COLUMNS, searchColumns: SEARCH, query: newBody, baseWhere, baseParams: params });

    // 仅针对当前页任务涉及的需求/工单映射计划投产点，避免随翻页整表扫描
    const pageCodes = [...new Set(result.list.map((r) => r.req_code).filter(Boolean))];
    const reqMap = await releaseDateMapForCodes(pageCodes);

    const systems = await all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) {
      sysMap[s.sys_code] = s.sys_name;
    }
    const itemMap = {};
    for (const code of pageCodes) {
      const item = await getWorkItem(code);
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
    return ok(await buildDevDetail(row));
  });

  // 按开发任务编号查询（供详情单页通过 URL 编号直达）
  fastify.get('/dev-tasks/by-code/:code', { preHandler: fastify.requirePerm('dev', 'view') }, async (request) => {
    const row = await get('SELECT * FROM dev_task WHERE task_code = ?', request.params.code);
    if (!row) throw notFound();
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

  // 开发承接预览
  fastify.post('/dev-tasks/intake-preview', { preHandler: fastify.requirePerm('dev', 'dev.intake') }, async (request) => {
    const { reqCode } = request.body || {};
    if (!reqCode) throw badRequest('请选择需求/工单');
    const req = await getWorkItem(reqCode);
    if (!req) throw notFound('需求/工单不存在');

    const main = req.main_systems || [];
    const collab = req.collab_dev_systems || [];

    const existingTasks = await all('SELECT impl_system, task_code, task_name, status FROM dev_task WHERE req_code = ?', reqCode);
    const existingMap = new Map(existingTasks.map(t => [t.impl_system, t]));

    const systems = await all('SELECT sys_code, sys_name FROM system');
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

    const tplRow = await get("SELECT value FROM app_config WHERE key = 'code.dev'");
    const tpl = tplRow?.value || 'RW_{需求编号}_{序号}';
    const prefix = tpl.replace('{需求编号}', reqCode).replace('{序号}', '');

    const existingCodes = await all(`SELECT task_code FROM dev_task WHERE task_code LIKE ?`, `${prefix}%`);
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
    if (!reqCode) throw badRequest('请选择需求/工单');
    const req = await getWorkItem(reqCode);
    if (!req) throw notFound('需求/工单不存在');

    // 目标系统：默认主责系统 ∪ 协同改造系统；可由 systems 指定子集
    const main = req.main_systems || [];
    const collab = req.collab_dev_systems || [];
    let targets = Array.isArray(systems) && systems.length ? systems : [...new Set([...main, ...collab])];
    if (!targets.length) throw badRequest('该需求/工单未配置主责/协同改造系统，无法承接开发');

    // 已存在开发任务的系统跳过
    const existing = new Set((await all('SELECT impl_system FROM dev_task WHERE req_code = ?', reqCode)).map((r) => r.impl_system));
    targets = targets.filter((s) => !existing.has(s));
    if (!targets.length) throw badRequest('所选系统均已建立开发任务');

    const created = await tx(async () => {
      const out = [];
      const initialStatus = await defaultProcessStatus('开发', 'initial', '开发承接');
      for (const sysCode of targets) {
        const sys = await get('SELECT * FROM system WHERE sys_code = ?', sysCode);
        const taskCode = await genDevCode(reqCode);
        const taskName = `RW-${req.title}-${sys?.sys_name || sysCode}`;
        const res = await run(
          `INSERT INTO dev_task (req_code, task_code, task_name, status, impl_system, impl_org, registrar, register_time)
           VALUES (?,?,?,?,?,?,?,?)`,
          reqCode, taskCode, taskName, initialStatus, sysCode, sys?.org || null,
          request.currentUser?.name, new Date().toISOString().slice(0, 10),
        );
        await auditCreate('dev', res.lastInsertRowid, taskCode, request.currentUser?.name);
        out.push({ id: res.lastInsertRowid, task_code: taskCode });
      }
      return out;
    });
    return ok(created, `已承接 ${created.length} 个开发任务`);
  });

  // 修改
  fastify.put('/dev-tasks/:id', { preHandler: fastify.requirePerm('dev', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = await get('SELECT * FROM dev_task WHERE id = ?', id);
    if (!old) throw notFound();
    const body = request.body || {};
    const data = {};
    for (const k of WRITABLE) if (body[k] !== undefined) data[k] = body[k];

    const merged = { ...old, ...data };
    await validateRequiredFields('dev', await statusTypeForProcessStatus(merged.status), merged);
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
    await run('DELETE FROM dev_task WHERE id = ?', id);
    await auditDelete('dev', id, row.task_code, request.currentUser?.name);
    return ok(null, '删除成功');
  });

  // 导出
  fastify.post('/dev-tasks/export', { preHandler: fastify.requirePerm('dev', 'export') }, async (request, reply) => {
    const body = request.body || {};
    const { where: baseWhere, params: baseParams } = inClause('req_code', body.req_code ? [body.req_code] : []);
    
    // 如果没有指定 req_code，根据窗口过滤
    let finalWhere = baseWhere;
    let finalParams = [...baseParams];
    if (!body.req_code) {
      const codes = [
        ...(await all("SELECT req_code AS code FROM requirement WHERE release_point_id IN (SELECT id FROM release_point WHERE is_default = 1 OR release_date >= date('now'))")).map(r => r.code),
        ...(await all("SELECT ticket_code AS code FROM ticket WHERE release_point_id IN (SELECT id FROM release_point WHERE is_default = 1 OR release_date >= date('now'))")).map(r => r.code),
      ];
      const win = inClause('req_code', [...new Set(codes)]);
      finalWhere = win.where || '1=0';
      finalParams = win.params;
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

    const buf = await exportXlsx(cols, mappedList, '开发任务清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=dev_tasks.xlsx');
    return reply.send(buf);
  });

  // 模板下载
  fastify.get('/dev-tasks/template', { preHandler: fastify.requirePerm('dev', 'import') }, async (request, reply) => {
    const buf = await exportXlsx(IO_COLUMNS, [], '开发任务模板');
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
    const rows = await parseXlsx(buffer, IO_COLUMNS);
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

          // 兼容性字典/系统转换
          const status = await resolveDictAttr('process_status', r.status) || await defaultProcessStatus('开发', 'initial', '开发承接');
          const implOrg = await resolveDictAttr('org', r.impl_org);
          const implSystem = await resolveSystemCode(r.impl_system);

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
                   task_name=?, content=?, status=?, owner=?, impl_system=?, impl_org=?, 
                   plan_start=?, plan_end=?, actual_start=?, actual_end=?, deviation_rate=?, 
                   updated_at=datetime('now','localtime') 
                 WHERE id=?`,
                r.task_name, r.content || null, status, r.owner || null, implSystem || null, implOrg || null,
                r.plan_start || null, r.plan_end || null, r.actual_start || null, r.actual_end || null, devRate, exists.id
              );
              await auditUpdate('dev', exists.id, code, request.currentUser?.name, exists, {
                task_name: r.task_name, content: r.content || null, status, owner: r.owner || null,
                impl_system: implSystem, impl_org: implOrg, plan_start: r.plan_start || null, plan_end: r.plan_end || null,
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
            if (!code) code = await genDevCode(r.req_code);
            const devRate = calcDeviation(r.plan_start, r.plan_end, r.actual_end);
            const res = await run(
              `INSERT INTO dev_task 
                 (req_code, task_code, task_name, content, status, owner, impl_system, impl_org, 
                  plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              r.req_code, code, r.task_name, r.content || null, status, r.owner || null, implSystem || null, implOrg || null,
              r.plan_start || null, r.plan_end || null, r.actual_start || null, r.actual_end || null, devRate,
              request.currentUser?.name, new Date().toISOString().slice(0, 10)
            );
            await auditCreate('dev', res.lastInsertRowid, code, request.currentUser?.name);
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

/**
 * 文件：modules/tickets/routes.js
 * 用途：工单分析模块接口。工单 CRUD（全字段可改并留痕）、编号唯一性校验、终态业务校验、
 *       默认按当前投产窗口过滤、导入导出。
 * 作者：hengguan
 * 说明：JSON 数组字段（主责/协同系统）入库前序列化；终态时校验主责系统。
 */

import { get, run, tx, all } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { isTerminalStatus } from '../../lib/status.js';
import { auditCreate, auditUpdate, auditDelete } from '../../lib/audit.js';
import { exportXlsx, parseXlsx } from '../../lib/excel.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, notFound, badRequest } from '../../lib/http.js';
import {
  resolveDictAttr,
  resolveSystemCode,
  resolveSystemCodes,
  resolveReleasePoint,
} from '../../lib/resolver.js';

// 导入/导出列定义
const IO_COLUMNS = [
  { key: 'ticket_code', title: '工单编号' },
  { key: 'title', title: '工单概述' },
  { key: 'summary', title: '工单详情' },
  { key: 'status', title: '工单状态' },
  { key: 'ticket_type', title: '工单类型' },
  { key: 'is_accounting', title: '是否涉账' },
  { key: 'propose_dept', title: '提出部门' },
  { key: 'proposer', title: '提出人' },
  { key: 'yn_owner', title: '云南农信工单负责人' },
  { key: 'jk_owner', title: '建信金科工单负责人' },
  { key: 'propose_time', title: '提出时间' },
  { key: 'release_date', title: '计划投产点' },
  { key: 'main_systems', title: '主责系统' },
  { key: 'collab_dev_systems', title: '协同改造系统' },
  { key: 'collab_test_systems', title: '协同测试系统' },
  { key: 'issue_no', title: '关联问题/工单编号' },
];

const COLUMNS = [
  'id', 'ticket_code', 'title', 'summary', 'status', 'ticket_type', 'propose_dept', 'proposer',
  'yn_owner', 'jk_owner', 'propose_time', 'release_point_id', 'registrar', 'register_time', 'created_at',
  'issue_no', 'is_accounting',
];
const SEARCH = ['ticket_code', 'title', 'summary', 'proposer', 'issue_no'];
const JSON_FIELDS = ['main_systems', 'collab_dev_systems', 'collab_test_systems', 'proposer'];
const WRITABLE = [
  'ticket_code', 'title', 'summary', 'status', 'ticket_type', 'propose_dept', 'proposer', 'yn_owner', 'jk_owner',
  'propose_time', 'main_systems', 'collab_dev_systems', 'collab_test_systems', 'release_point_id',
  'issue_no', 'is_accounting',
];
const LABELS = {
  ticket_code: '工单编号', title: '工单概述', summary: '工单详情', status: '工单状态', ticket_type: '工单类型',
  is_accounting: '是否涉账',
  propose_dept: '提出部门', proposer: '提出人', yn_owner: '云南农信工单负责人',
  jk_owner: '建信金科工单负责人', propose_time: '提出时间', main_systems: '主责系统',
  collab_dev_systems: '协同改造系统', collab_test_systems: '协同测试系统', release_point_id: '计划投产点',
  issue_no: '关联问题/工单编号',
};

/** 把 JSON 字符串字段解析为数组返回给前端 */
function decode(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of JSON_FIELDS) {
    if (row[f]) {
      try {
        const parsed = JSON.parse(row[f]);
        out[f] = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        out[f] = [row[f]];
      }
    } else {
      out[f] = [];
    }
  }
  return out;
}

/** 把前端数组字段序列化为 JSON 字符串 */
function encodeField(data) {
  const out = { ...data };
  for (const f of JSON_FIELDS) {
    if (out[f] !== undefined) out[f] = JSON.stringify(Array.isArray(out[f]) ? out[f] : []);
  }
  return out;
}

/** 仅保留可写字段 */
function pick(body) {
  const out = {};
  for (const k of WRITABLE) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

/** 统计需求（按编号）已关联的开发/测试任务数量 */
function linkedTaskCount(ticketCode) {
  if (!ticketCode) return 0;
  const d = get('SELECT COUNT(*) AS c FROM dev_task WHERE req_code = ?', ticketCode);
  const t = get('SELECT COUNT(*) AS c FROM test_task WHERE req_code = ?', ticketCode);
  return (d?.c || 0) + (t?.c || 0);
}

/** 终态校验 */
function validateTerminal(statusAttr, mainSystems) {
  if (!isTerminalStatus(statusAttr)) return;
  if (!Array.isArray(mainSystems) || mainSystems.length === 0) {
    throw badRequest('分析完成（终态）时，主责系统至少填写 1 个');
  }
}

export default async function ticketRoutes(fastify) {
  // 列表（按所选投产窗口过滤；多选用 IN，留空=全部）
  fastify.post('/tickets/list', { preHandler: fastify.requirePerm('ticket', 'view') }, async (request) => {
    const body = request.body || {};
    
    const wh = [];
    const params = [];
    
    // 默认的投产窗口过滤
    const win = inClause('release_point_id', windowIds(body));
    if (win.where) {
      wh.push(win.where);
      params.push(...win.params);
    }
    
    // 提取并处理自定义/复杂字段
    const filters = Array.isArray(body.filters) ? body.filters : [];
    const normalFilters = [];
    
    for (const f of filters) {
      if (!f || f.value === undefined || f.value === null || f.value === '') continue;
      
      if (f.field === 'content') {
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
                WHERE dev_task.req_code = ticket.ticket_code
                  AND dev_task.impl_system IN (SELECT value FROM json_each(ticket.main_systems))
                  AND dev_task.impl_org IS NOT NULL AND dev_task.impl_org != ''
                ORDER BY id ASC LIMIT 1
              ),
              (
                SELECT org FROM system 
                WHERE sys_code = (SELECT value FROM json_each(ticket.main_systems) LIMIT 1)
                  AND org IS NOT NULL AND org != ''
              ),
              ticket.propose_dept,
              '未分配机构'
            )
          `;
          wh.push(`${sqlExpr} IN (${placeholders})`);
          params.push(...orgs);
        }
      } else if (f.field === 'owners') {
        const owners = Array.isArray(f.value) ? f.value : [f.value];
        if (owners.length) {
          const placeholders = owners.map(() => '?').join(',');
          wh.push(`(yn_owner IN (${placeholders}) OR jk_owner IN (${placeholders}))`);
          params.push(...owners, ...owners);
        }
      } else if (f.field === 'main_systems') {
        const codes = Array.isArray(f.value) ? f.value : [f.value];
        if (codes.length) {
          const placeholders = codes.map(() => '?').join(',');
          wh.push(`EXISTS (SELECT 1 FROM json_each(ticket.main_systems) WHERE value IN (${placeholders}))`);
          params.push(...codes);
        }
      } else if (f.field === 'collab_systems') {
        const codes = Array.isArray(f.value) ? f.value : [f.value];
        if (codes.length) {
          const placeholders = codes.map(() => '?').join(',');
          wh.push(`(
            EXISTS (SELECT 1 FROM json_each(ticket.collab_dev_systems) WHERE value IN (${placeholders})) OR
            EXISTS (SELECT 1 FROM json_each(ticket.collab_test_systems) WHERE value IN (${placeholders}))
          )`);
          params.push(...codes, ...codes);
        }
      } else {
        normalFilters.push(f);
      }
    }
    
    const newBody = { ...body, filters: normalFilters };
    const baseWhere = wh.join(' AND ');
    
    const result = listQuery({
      table: 'ticket', columns: COLUMNS, searchColumns: SEARCH,
      query: newBody, baseWhere, baseParams: params,
    });

    // 投产点与系统为主数据（量小），整表载入做编号→名称映射
    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) {
      rpMap[rp.id] = rp.release_date;
    }

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) {
      sysMap[s.sys_code] = s.sys_name;
    }

    // 仅针对当前页的工单编号做关联查询，避免随翻页整表扫描 dev_task/test_task/release_task
    const pageCodes = result.list.map((r) => r.ticket_code).filter(Boolean);
    const linkedCodes = new Set();
    const rtMap = {};
    if (pageCodes.length) {
      const ph = pageCodes.map(() => '?').join(',');
      for (const r of all(`SELECT DISTINCT req_code FROM dev_task WHERE req_code IN (${ph})`, ...pageCodes)) {
        linkedCodes.add(r.req_code);
      }
      for (const r of all(`SELECT DISTINCT req_code FROM test_task WHERE req_code IN (${ph})`, ...pageCodes)) {
        linkedCodes.add(r.req_code);
      }
      for (const rt of all(`SELECT req_code, status FROM release_task WHERE req_code IN (${ph})`, ...pageCodes)) {
        rtMap[rt.req_code] = rt.status;
      }
    }

    // 从流程状态配置中获取“投产”阶段的状态类型配置，避免硬编码
    const processItems = all("SELECT attr_value, extra FROM dict_item WHERE category = 'process_status'");
    const processStatusMap = {};
    for (const item of processItems) {
      try {
        const extra = JSON.parse(item.extra);
        if (extra.stage === '投产') {
          processStatusMap[item.attr_value] = extra.stateType; // 'final' / 'in-progress'
        }
      } catch {}
    }

    result.list = result.list.map((row) => {
      const decoded = decode(row);
      decoded.release_date = rpMap[decoded.release_point_id] || null;
      decoded.main_systems_names = (decoded.main_systems || []).map((code) => sysMap[code] || code);
      decoded.collab_dev_systems_names = (decoded.collab_dev_systems || []).map((code) => sysMap[code] || code);
      decoded.has_tasks = linkedCodes.has(decoded.ticket_code);

      const rtStatus = rtMap[decoded.ticket_code] || null;
      let releaseStageType = null;
      if (rtStatus === '已投产') {
        releaseStageType = processStatusMap['已上线'] || 'final';
      } else if (rtStatus === '待投产') {
        releaseStageType = processStatusMap['待评审'] || 'in-progress';
      }
      decoded.release_stage_type = releaseStageType;

      return decoded;
    });

    return ok(result);
  });

  // 关联问题查询：供工单编号输入时按问题编号或 PAMS 工单编号联想回填
  fastify.get('/tickets/issue-lookup', { preHandler: fastify.requirePerm('ticket', 'view') }, async (request) => {
    const q = String(request.query?.q || '').trim();
    if (!q) return ok([]);
    const like = `%${q}%`;
    const rows = all(
      `SELECT issue_code, work_order_no, detailed_classification, category, summary, details, system
         FROM issue
        WHERE issue_code LIKE ? OR work_order_no LIKE ?
        ORDER BY
          CASE
            WHEN issue_code = ? THEN 0
            WHEN work_order_no = ? THEN 1
            WHEN issue_code LIKE ? THEN 2
            ELSE 3
          END,
          issue_code DESC
        LIMIT 10`,
      like, like, q, q, `${q}%`,
    );
    return ok(rows);
  });

  // 详情
  fastify.get('/tickets/:id', { preHandler: fastify.requirePerm('ticket', 'view') }, async (request) => {
    const row = get('SELECT * FROM ticket WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    return ok({ ...decode(row), has_tasks: linkedTaskCount(row.ticket_code) > 0 });
  });

  // 按工单编号查询（供详情单页通过 URL 编号直达）
  fastify.get('/tickets/by-code/:code', { preHandler: fastify.requirePerm('ticket', 'view') }, async (request) => {
    const row = get('SELECT * FROM ticket WHERE ticket_code = ?', request.params.code);
    if (!row) throw notFound();
    return ok({ ...decode(row), has_tasks: linkedTaskCount(row.ticket_code) > 0 });
  });

  // 新增
  fastify.post('/tickets', { preHandler: fastify.requirePerm('ticket', 'create') }, async (request) => {
    const body = request.body || {};
    if (!body.title) throw badRequest('工单概述必填');
    const manualCode = String(body.ticket_code || '').trim();
    if (!manualCode) throw badRequest('工单编号必填');
    if (!body.release_point_id) throw badRequest('计划投产点必填');
    const rp = get('SELECT * FROM release_point WHERE id = ?', body.release_point_id);
    if (!rp) throw badRequest('投产点不存在');

    const data = encodeField(pick(body));
    delete data.ticket_code;
    delete data.status;
    // 手动编号在同一 BEGIN IMMEDIATE 事务内校验唯一性，防止并发重复提交。
    const { id, reqCode } = tx(() => {
      const code = manualCode;
      if (get('SELECT id FROM ticket WHERE ticket_code = ?', code)) throw badRequest('工单编号已存在，请更换');
      const fields = ['ticket_code', 'status', 'registrar', 'register_time', ...Object.keys(data)];
      const values = [
        code,
        body.status || '工单登记',
        request.currentUser?.name,
        new Date().toISOString().slice(0, 10),
        ...Object.keys(data).map((k) => data[k]),
      ];
      const res = run(
        `INSERT INTO ticket (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
        ...values,
      );
      return { id: res.lastInsertRowid, reqCode: code };
    });
    auditCreate('ticket', id, reqCode, request.currentUser?.name);
    return ok({ id, ticket_code: reqCode });
  });

  // 修改（终态校验 + 留痕）
  fastify.put('/tickets/:id', { preHandler: fastify.requirePerm('ticket', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = get('SELECT * FROM ticket WHERE id = ?', id);
    if (!old) throw notFound();
    const body = request.body || {};
    const picked = pick(body);

    // 如果提交了新编号，校验唯一性（排除自身）
    if (picked.ticket_code && picked.ticket_code !== old.ticket_code) {
      // 已关联开发/测试任务的需求，编号不可修改
      if (linkedTaskCount(old.ticket_code) > 0) throw badRequest('该工单已关联开发/测试任务，工单编号不可修改');
      const dup = get('SELECT id FROM ticket WHERE ticket_code = ? AND id != ?', picked.ticket_code, id);
      if (dup) throw badRequest('工单编号已存在，请更换');
    }

    // 终态校验：用提交后的状态与主责系统
    const newStatus = picked.status ?? old.status;
    const newMain = picked.main_systems ?? (old.main_systems ? JSON.parse(old.main_systems) : []);
    validateTerminal(newStatus, newMain);

    const data = encodeField(picked);
    const keys = Object.keys(data);
    if (keys.length) {
      run(
        `UPDATE ticket SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
        ...keys.map((k) => data[k]), id,
      );
      // 留痕：数组字段比较用解码后的可读值
      const oldReadable = decode(old);
      const newReadable = { ...picked };
      auditUpdate('ticket', id, old.ticket_code, request.currentUser?.name, oldReadable, newReadable, LABELS);
    }
    return ok({ id });
  });

  // 校验编号唯一性（前端实时校验调用）
  fastify.get('/tickets/check-code', { preHandler: fastify.requirePerm('ticket', 'view') }, async (request) => {
    const { code, excludeId } = request.query;
    if (!code) return ok({ exists: false });
    const row = excludeId
      ? get('SELECT id FROM ticket WHERE ticket_code = ? AND id != ?', code, excludeId)
      : get('SELECT id FROM ticket WHERE ticket_code = ?', code);
    return ok({ exists: !!row });
  });

  // 删除
  fastify.delete('/tickets/:id', { preHandler: fastify.requirePerm('ticket', 'delete') }, async (request) => {
    const id = request.params.id;
    const row = get('SELECT * FROM ticket WHERE id = ?', id);
    if (!row) throw notFound();
    // 已关联开发/测试任务的需求不可删除
    if (linkedTaskCount(row.ticket_code) > 0) throw badRequest('该工单已关联开发/测试任务，无法删除');
    run('DELETE FROM ticket WHERE id = ?', id);
    auditDelete('ticket', id, row.ticket_code, request.currentUser?.name);
    return ok(null, '删除成功');
  });

  // 导出
  fastify.post('/tickets/export', { preHandler: fastify.requirePerm('ticket', 'export') }, async (request, reply) => {
    const body = request.body || {};
    const { where: baseWhere, params: baseParams } = inClause('release_point_id', windowIds(body));
    const result = listQuery({
      table: 'ticket', columns: COLUMNS, searchColumns: SEARCH,
      query: { ...body, pageSize: 0 }, baseWhere, baseParams,
    });

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    const cols = [
      { key: 'ticket_code', title: '工单编号' },
      { key: 'title', title: '工单概述' },
      { key: 'summary', title: '工单详情' },
      { key: 'status', title: '工单状态' },
      { key: 'ticket_type', title: '工单类型' },
      { key: 'is_accounting', title: '是否涉账' },
      { key: 'propose_dept', title: '提出部门' },
      { key: 'proposer', title: '提出人' },
      { key: 'yn_owner', title: '云南农信工单负责人' },
      { key: 'jk_owner', title: '建信金科工单负责人' },
      { key: 'propose_time', title: '提出时间' },
      { key: 'release_date', title: '计划投产点' },
      { key: 'main_systems', title: '主责系统' },
      { key: 'collab_dev_systems', title: '协同改造系统' },
      { key: 'collab_test_systems', title: '协同测试系统' },
      { key: 'issue_no', title: '关联问题/工单编号' },
      { key: 'registrar', title: '登记人' },
      { key: 'register_time', title: '登记时间' },
    ];

    const mappedList = result.list.map(row => {
      const main = row.main_systems ? JSON.parse(row.main_systems) : [];
      const collabDev = row.collab_dev_systems ? JSON.parse(row.collab_dev_systems) : [];
      const collabTest = row.collab_test_systems ? JSON.parse(row.collab_test_systems) : [];
      const proposerArray = (() => {
        if (!row.proposer) return [];
        try {
          const parsed = JSON.parse(row.proposer);
          return Array.isArray(parsed) ? parsed : [row.proposer];
        } catch {
          return [row.proposer];
        }
      })();

      return {
        ...row,
        release_date: rpMap[row.release_point_id] || '',
        proposer: proposerArray.join(', '),
        main_systems: main.map(c => sysMap[c] || c).join(', '),
        collab_dev_systems: collabDev.map(c => sysMap[c] || c).join(', '),
        collab_test_systems: collabTest.map(c => sysMap[c] || c).join(', '),
      };
    });

    const buf = await exportXlsx(cols, mappedList, '工单清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=tickets.xlsx');
    return reply.send(buf);
  });

  // 导入模板
  fastify.get('/tickets/template', { preHandler: fastify.requirePerm('ticket', 'import') }, async (request, reply) => {
    const buf = await exportXlsx(IO_COLUMNS, [], '工单模板');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=tickets_template.xlsx');
    return reply.send(buf);
  });

  // 导入（按工单编号去重；计划投产点按日期匹配 release_point；支持兼容性处理与回滚）
  fastify.post('/tickets/import', { preHandler: fastify.requirePerm('ticket', 'import') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = data.fields?.mode?.value || 'skip';
    const buffer = await data.toBuffer();
    const rows = await parseXlsx(buffer, IO_COLUMNS);
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
    const details = [];

    // 载入投产点和系统映射用于变化展示及解析
    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const apply = () => {
      for (const r of rows) {
        const rowNum = r.__rowNum__;
        try {
          if (!r.title) throw new Error('工单概述不能为空');
          if (!r.ticket_code) throw new Error('工单编号不能为空');
          if (!r.release_date) throw new Error('计划投产点不能为空');

          // 解析计划投产点
          const rpId = resolveReleasePoint(r.release_date);
          if (!rpId) throw new Error(`计划投产点投产日期 [${r.release_date}] 不存在`);

          // 兼容性字典转换
          const status = resolveDictAttr('process_status', r.status) || '工单登记';
          const reqType = resolveDictAttr('ticket_type', r.ticket_type);
          const isAccounting = ['是', '否'].includes(String(r.is_accounting || '').trim())
            ? String(r.is_accounting).trim()
            : '否';
          const proposeDept = resolveDictAttr('org', r.propose_dept);

          // 兼容性系统转换
          const mainSystems = resolveSystemCodes(r.main_systems);
          const collabDevSystems = resolveSystemCodes(r.collab_dev_systems);
          const collabTestSystems = resolveSystemCodes(r.collab_test_systems);

          const proposerArray = r.proposer
            ? String(r.proposer).split(/[，,]/).map(s => s.trim()).filter(Boolean)
            : [];
          const proposerJson = JSON.stringify(proposerArray);

          let code = String(r.ticket_code || '').trim();
          const exists = code ? get('SELECT * FROM ticket WHERE ticket_code = ?', code) : null;

          if (exists) {
            if (mode === 'skip') {
              stat.skipped++;
              details.push({
                key: code,
                title: r.title,
                action: 'skip',
                status: 'success',
                __rowNum__: rowNum,
              });
              continue;
            }
            if (mode === 'rollback') {
              throw new Error(`工单编号 [${code}] 已存在，无法覆盖`);
            }

            // overwrite 模式：比对并更新
            const changes = [];
            const compareAndPush = (fieldKey, fieldName, oldVal, newVal) => {
              if (oldVal !== newVal) {
                changes.push({ field: fieldName, old: oldVal, new: newVal });
              }
            };

            const oldProposers = (() => {
              if (!exists.proposer) return '';
              try {
                const parsed = JSON.parse(exists.proposer);
                return Array.isArray(parsed) ? parsed.join(', ') : exists.proposer;
              } catch {
                return exists.proposer;
              }
            })();
            const newProposers = proposerArray.join(', ');

            compareAndPush('title', '工单概述', exists.title || '', r.title || '');
            compareAndPush('summary', '工单详情', exists.summary || '', r.summary || '');
            compareAndPush('status', '工单状态', exists.status || '', status || '');
            compareAndPush('ticket_type', '工单类型', exists.ticket_type || '', reqType || '');
            compareAndPush('is_accounting', '是否涉账', exists.is_accounting || '否', isAccounting);
            compareAndPush('propose_dept', '提出部门', exists.propose_dept || '', proposeDept || '');
            compareAndPush('proposer', '提出人', oldProposers, newProposers);
            compareAndPush('yn_owner', '云南农信工单负责人', exists.yn_owner || '', r.yn_owner || '');
            compareAndPush('jk_owner', '建信金科工单负责人', exists.jk_owner || '', r.jk_owner || '');
            compareAndPush('propose_time', '提出时间', exists.propose_time || '', r.propose_time || '');
            compareAndPush('issue_no', '关联问题/工单编号', exists.issue_no || '', r.issue_no || '');
            
            // 计划投产点比较
            const oldRpDate = rpMap[exists.release_point_id] || '';
            const newRpDate = rpMap[rpId] || '';
            compareAndPush('release_point_id', '计划投产点', oldRpDate, newRpDate);

            // 系统比较
            const decodeSystems = (jsonStr) => (jsonStr ? JSON.parse(jsonStr) : []).map(c => sysMap[c] || c).join(', ');
            compareAndPush('main_systems', '主责系统', decodeSystems(exists.main_systems), decodeSystems(mainSystems));
            compareAndPush('collab_dev_systems', '协同改造系统', decodeSystems(exists.collab_dev_systems), decodeSystems(collabDevSystems));
            compareAndPush('collab_test_systems', '协同测试系统', decodeSystems(exists.collab_test_systems), decodeSystems(collabTestSystems));

            if (changes.length > 0) {
              run(
                `UPDATE ticket SET 
                   title=?, summary=?, status=?, ticket_type=?, is_accounting=?, propose_dept=?, proposer=?, yn_owner=?, jk_owner=?, 
                   propose_time=?, release_point_id=?, main_systems=?, collab_dev_systems=?, collab_test_systems=?, 
                   issue_no=?,
                   updated_at=datetime('now','localtime') 
                 WHERE id=?`,
                r.title, r.summary || null, status, reqType || null, isAccounting, proposeDept || null, proposerJson,
                r.yn_owner || null, r.jk_owner || null, r.propose_time || null, rpId,
                mainSystems, collabDevSystems, collabTestSystems, r.issue_no || null, exists.id
              );
              auditUpdate('ticket', exists.id, code, request.currentUser?.name, exists, {
                title: r.title, summary: r.summary || null, status, ticket_type: reqType || null, is_accounting: isAccounting,
                propose_dept: proposeDept || null, proposer: proposerJson, yn_owner: r.yn_owner || null,
                jk_owner: r.jk_owner || null, propose_time: r.propose_time || null, release_point_id: rpId,
                main_systems: mainSystems, collab_dev_systems: collabDevSystems, collab_test_systems: collabTestSystems,
                issue_no: r.issue_no || null
              }, LABELS);
            }

            stat.updated++;
            details.push({
              key: code,
              title: r.title,
              action: 'update',
              status: 'success',
              __rowNum__: rowNum,
              changes,
            });

          } else {
            // insert 新建
            const res = run(
              `INSERT INTO ticket 
                 (ticket_code, title, summary, status, ticket_type, is_accounting, propose_dept, proposer, yn_owner, jk_owner, 
                  propose_time, release_point_id, main_systems, collab_dev_systems, collab_test_systems, registrar, register_time, issue_no)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              code, r.title, r.summary || null, status, reqType || null, isAccounting, proposeDept || null, proposerJson,
              r.yn_owner || null, r.jk_owner || null, r.propose_time || null, rpId,
              mainSystems, collabDevSystems, collabTestSystems, request.currentUser?.name, new Date().toISOString().slice(0, 10),
              r.issue_no || null
            );
            auditCreate('ticket', res.lastInsertRowid, code, request.currentUser?.name);
            stat.inserted++;
            details.push({
              key: code,
              title: r.title,
              action: 'insert',
              status: 'success',
              __rowNum__: rowNum,
            });
          }
        } catch (err) {
          stat.failed++;
          details.push({
            key: r.ticket_code || '未知编号',
            title: r.title || '空标题',
            status: 'fail',
            __rowNum__: rowNum,
            error: err.message,
          });
          if (mode === 'rollback') {
            throw err; // 抛出异常引发事务回滚
          }
        }
      }
    };

    if (mode === 'rollback') {
      try {
        tx(apply);
      } catch (err) {
        // tx 发生回滚后，将成功导入/更新的项修正为 skip 状态
        for (const item of details) {
          if (item.status === 'success') {
            item.action = 'skip';
          }
        }
        // 重置 stat 指标为 0 (回滚了)
        stat.inserted = 0;
        stat.updated = 0;
      }
    } else {
      apply();
    }

    return ok({ stat, details }, '导入完成');
  });
}

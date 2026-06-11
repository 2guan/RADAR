/**
 * 文件：modules/requirements/routes.js
 * 用途：需求分析模块接口。需求 CRUD（全字段可改并留痕）、编号生成、终态业务校验、
 *       默认按当前投产窗口过滤、导入导出。
 * 作者：hengguan
 * 说明：JSON 数组字段（主责/协同系统）入库前序列化；终态时校验主责系统与需求说明书附件。
 */

import { get, run, tx, all } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { genRequirementCode } from '../../lib/code-gen.js';
import { isTerminalStatus } from '../../lib/status.js';
import { auditCreate, auditUpdate, auditDelete } from '../../lib/audit.js';
import { listByEntity, countByFields } from '../../lib/attachment.js';
import { exportXlsx, parseXlsx } from '../../lib/excel.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, notFound, badRequest } from '../../lib/http.js';

// 导入/导出列定义
const IO_COLUMNS = [
  { key: 'req_code', title: '需求编号' },
  { key: 'title', title: '需求标题' },
  { key: 'summary', title: '需求概述' },
  { key: 'status', title: '需求状态' },
  { key: 'req_type', title: '需求类型' },
  { key: 'proposer', title: '农信提出人' },
  { key: 'propose_time', title: '提出时间' },
  { key: 'release_date', title: '计划投产点' },
];

const COLUMNS = [
  'id', 'req_code', 'title', 'summary', 'status', 'req_type', 'propose_dept', 'proposer',
  'yn_owner', 'jk_owner', 'propose_time', 'release_point_id', 'registrar', 'register_time', 'created_at',
];
const SEARCH = ['req_code', 'title', 'summary', 'proposer'];
const JSON_FIELDS = ['main_systems', 'collab_dev_systems', 'collab_test_systems'];
const WRITABLE = [
  'req_code', 'title', 'summary', 'status', 'req_type', 'propose_dept', 'proposer', 'yn_owner', 'jk_owner',
  'propose_time', 'main_systems', 'collab_dev_systems', 'collab_test_systems', 'release_point_id',
];
const LABELS = {
  req_code: '需求编号', title: '需求标题', summary: '需求概述', status: '需求状态', req_type: '需求类型',
  propose_dept: '农信提出部门', proposer: '农信提出人', yn_owner: '云南农信业务负责人',
  jk_owner: '建信金科业务负责人', propose_time: '提出时间', main_systems: '主责系统',
  collab_dev_systems: '协同改造系统', collab_test_systems: '协同测试系统', release_point_id: '计划投产点',
};

/** 把 JSON 字符串字段解析为数组返回给前端 */
function decode(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of JSON_FIELDS) out[f] = row[f] ? JSON.parse(row[f]) : [];
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
function linkedTaskCount(reqCode) {
  if (!reqCode) return 0;
  const d = get('SELECT COUNT(*) AS c FROM dev_task WHERE req_code = ?', reqCode);
  const t = get('SELECT COUNT(*) AS c FROM test_task WHERE req_code = ?', reqCode);
  return (d?.c || 0) + (t?.c || 0);
}

/** 终态校验 */
function validateTerminal(reqId, statusAttr, mainSystems) {
  if (!isTerminalStatus(statusAttr)) return;
  if (!Array.isArray(mainSystems) || mainSystems.length === 0) {
    throw badRequest('需求完成（终态）时，主责系统至少填写 1 个');
  }
  const cnt = countByFields('requirement', reqId, ['需求说明书']);
  if (cnt === 0) throw badRequest('需求完成（终态）时，需求说明书附件或路径至少填写 1 个');
}

export default async function requirementRoutes(fastify) {
  // 列表（按所选投产窗口过滤；多选用 IN，留空=全部）
  fastify.post('/requirements/list', { preHandler: fastify.requirePerm('requirement', 'view') }, async (request) => {
    const body = request.body || {};
    const { where: baseWhere, params: baseParams } = inClause('release_point_id', windowIds(body));
    const result = listQuery({
      table: 'requirement', columns: COLUMNS, searchColumns: SEARCH,
      query: body, baseWhere, baseParams,
    });

    // 查询所有投产点与系统，在内存中进行映射
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

    // 已关联开发/测试任务的需求编号集合（用于禁用编号修改与删除）
    const linkedCodes = new Set(
      [
        ...all('SELECT DISTINCT req_code FROM dev_task').map((r) => r.req_code),
        ...all('SELECT DISTINCT req_code FROM test_task').map((r) => r.req_code),
      ].filter(Boolean),
    );

    result.list = result.list.map((row) => {
      const decoded = decode(row);
      decoded.release_date = rpMap[decoded.release_point_id] || null;
      decoded.main_systems_names = (decoded.main_systems || []).map((code) => sysMap[code] || code);
      decoded.collab_dev_systems_names = (decoded.collab_dev_systems || []).map((code) => sysMap[code] || code);
      decoded.has_tasks = linkedCodes.has(decoded.req_code);
      return decoded;
    });

    return ok(result);
  });

  // 详情（含附件）
  fastify.get('/requirements/:id', { preHandler: fastify.requirePerm('requirement', 'view') }, async (request) => {
    const row = get('SELECT * FROM requirement WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    return ok({ ...decode(row), has_tasks: linkedTaskCount(row.req_code) > 0, attachments: listByEntity('requirement', row.id) });
  });

  // 新增
  fastify.post('/requirements', { preHandler: fastify.requirePerm('requirement', 'create') }, async (request) => {
    const body = request.body || {};
    if (!body.title) throw badRequest('需求标题必填');
    if (!body.release_point_id) throw badRequest('计划投产点必填');
    const rp = get('SELECT * FROM release_point WHERE id = ?', body.release_point_id);
    if (!rp) throw badRequest('投产点不存在');

    // 编号：手填校验唯一，否则按规则生成
    let reqCode = (body.req_code || '').trim();
    if (reqCode) {
      if (get('SELECT id FROM requirement WHERE req_code = ?', reqCode)) throw badRequest('需求编号已存在');
    } else {
      reqCode = genRequirementCode(rp.release_date);
    }

    const data = encodeField(pick(body));
    const id = tx(() => {
      const fields = ['req_code', 'status', 'registrar', 'register_time', ...Object.keys(data)];
      const values = [
        reqCode,
        body.status || '需求登记',
        request.currentUser?.name,
        new Date().toISOString().slice(0, 10),
        ...Object.keys(data).map((k) => data[k]),
      ];
      const res = run(
        `INSERT INTO requirement (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
        ...values,
      );
      return res.lastInsertRowid;
    });
    auditCreate('requirement', id, reqCode, request.currentUser?.name);
    return ok({ id, req_code: reqCode });
  });

  // 修改（终态校验 + 留痕）
  fastify.put('/requirements/:id', { preHandler: fastify.requirePerm('requirement', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = get('SELECT * FROM requirement WHERE id = ?', id);
    if (!old) throw notFound();
    const body = request.body || {};
    const picked = pick(body);

    // 如果提交了新编号，校验唯一性（排除自身）
    if (picked.req_code && picked.req_code !== old.req_code) {
      // 已关联开发/测试任务的需求，编号不可修改
      if (linkedTaskCount(old.req_code) > 0) throw badRequest('该需求已关联开发/测试任务，需求编号不可修改');
      const dup = get('SELECT id FROM requirement WHERE req_code = ? AND id != ?', picked.req_code, id);
      if (dup) throw badRequest('需求编号已存在，请更换');
    }

    // 终态校验：用提交后的状态与主责系统
    const newStatus = picked.status ?? old.status;
    const newMain = picked.main_systems ?? (old.main_systems ? JSON.parse(old.main_systems) : []);
    validateTerminal(id, newStatus, newMain);

    const data = encodeField(picked);
    const keys = Object.keys(data);
    if (keys.length) {
      run(
        `UPDATE requirement SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
        ...keys.map((k) => data[k]), id,
      );
      // 留痕：数组字段比较用解码后的可读值
      const oldReadable = decode(old);
      const newReadable = { ...picked };
      auditUpdate('requirement', id, old.req_code, request.currentUser?.name, oldReadable, newReadable, LABELS);
    }
    return ok({ id });
  });

  // 生成编号（前端点击「生成」按钮调用）
  fastify.get('/requirements/gen-code', { preHandler: fastify.requirePerm('requirement', 'view') }, async (request) => {
    const releasePointId = request.query.releasePointId;
    if (!releasePointId) throw badRequest('缺少 releasePointId');
    const rp = get('SELECT release_date FROM release_point WHERE id = ?', releasePointId);
    if (!rp) throw badRequest('投产点不存在');
    return ok({ req_code: genRequirementCode(rp.release_date) });
  });

  // 校验编号唯一性（前端实时校验调用）
  fastify.get('/requirements/check-code', { preHandler: fastify.requirePerm('requirement', 'view') }, async (request) => {
    const { code, excludeId } = request.query;
    if (!code) return ok({ exists: false });
    const row = excludeId
      ? get('SELECT id FROM requirement WHERE req_code = ? AND id != ?', code, excludeId)
      : get('SELECT id FROM requirement WHERE req_code = ?', code);
    return ok({ exists: !!row });
  });

  // 删除
  fastify.delete('/requirements/:id', { preHandler: fastify.requirePerm('requirement', 'delete') }, async (request) => {
    const id = request.params.id;
    const row = get('SELECT * FROM requirement WHERE id = ?', id);
    if (!row) throw notFound();
    // 已关联开发/测试任务的需求不可删除
    if (linkedTaskCount(row.req_code) > 0) throw badRequest('该需求已关联开发/测试任务，无法删除');
    run('DELETE FROM requirement WHERE id = ?', id);
    auditDelete('requirement', id, row.req_code, request.currentUser?.name);
    return ok(null, '删除成功');
  });

  // 导出
  fastify.post('/requirements/export', { preHandler: fastify.requirePerm('requirement', 'export') }, async (request, reply) => {
    const body = request.body || {};
    const { where: baseWhere, params: baseParams } = inClause('release_point_id', windowIds(body));
    const result = listQuery({
      table: 'requirement', columns: COLUMNS, searchColumns: SEARCH,
      query: { ...body, pageSize: 0 }, baseWhere, baseParams,
    });
    const cols = [
      { key: 'req_code', title: '需求编号' }, { key: 'title', title: '需求标题' },
      { key: 'status', title: '需求状态' }, { key: 'req_type', title: '需求类型' },
      { key: 'proposer', title: '提出人' }, { key: 'propose_time', title: '提出时间' },
    ];
    const buf = await exportXlsx(cols, result.list, '需求清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=requirements.xlsx');
    return reply.send(buf);
  });

  // 导入模板
  fastify.get('/requirements/template', { preHandler: fastify.requirePerm('requirement', 'import') }, async (request, reply) => {
    const buf = await exportXlsx(IO_COLUMNS, [], '需求模板');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=requirements_template.xlsx');
    return reply.send(buf);
  });

  // 导入（按 需求编号 去重；计划投产点按日期匹配 release_point；编号留空则自动生成）
  fastify.post('/requirements/import', { preHandler: fastify.requirePerm('requirement', 'import') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = data.fields?.mode?.value || 'skip';
    const buffer = await data.toBuffer();
    const rows = await parseXlsx(buffer, IO_COLUMNS);
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0 };
    const apply = () => {
      for (const r of rows) {
        if (!r.title) { stat.skipped++; continue; }
        // 解析计划投产点（YYYYMMDD）
        const rp = r.release_date ? get('SELECT id FROM release_point WHERE release_date = ?', String(r.release_date).trim()) : null;
        let code = String(r.req_code || '').trim();
        const exists = code ? get('SELECT * FROM requirement WHERE req_code = ?', code) : null;
        if (exists) {
          if (mode === 'skip') { stat.skipped++; continue; }
          if (mode === 'rollback') throw badRequest(`需求编号重复：${code}，已回滚`);
          run(`UPDATE requirement SET title=?, summary=?, status=?, req_type=?, proposer=?, propose_time=?, updated_at=datetime('now','localtime') WHERE id=?`,
            r.title, r.summary || null, r.status || exists.status, r.req_type || null, r.proposer || null, r.propose_time || null, exists.id);
          auditUpdate('requirement', exists.id, code, request.currentUser?.name, exists, r, LABELS);
          stat.updated++;
        } else {
          if (!rp) { stat.skipped++; continue; } // 无法确定投产窗口
          if (!code) code = genRequirementCode(get('SELECT release_date FROM release_point WHERE id = ?', rp.id).release_date);
          const res = run(
            `INSERT INTO requirement (req_code, title, summary, status, req_type, proposer, propose_time, release_point_id, registrar, register_time)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            code, r.title, r.summary || null, r.status || '需求登记', r.req_type || null, r.proposer || null,
            r.propose_time || null, rp.id, request.currentUser?.name, new Date().toISOString().slice(0, 10),
          );
          auditCreate('requirement', res.lastInsertRowid, code, request.currentUser?.name);
          stat.inserted++;
        }
      }
    };
    if (mode === 'rollback') tx(apply); else apply();
    return ok(stat, '导入完成');
  });
}

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
import {
  resolveDictAttr,
  resolveSystemCode,
  resolveSystemCodes,
  resolveReleasePoint,
  formatAttachments,
} from '../../lib/resolver.js';

// 导入/导出列定义
const IO_COLUMNS = [
  { key: 'req_code', title: '需求编号' },
  { key: 'title', title: '需求标题' },
  { key: 'summary', title: '需求概述' },
  { key: 'status', title: '需求状态' },
  { key: 'req_type', title: '需求类型' },
  { key: 'propose_dept', title: '农信提出部门' },
  { key: 'proposer', title: '农信提出人' },
  { key: 'yn_owner', title: '云南农信业务负责人' },
  { key: 'jk_owner', title: '建信金科业务负责人' },
  { key: 'propose_time', title: '提出时间' },
  { key: 'release_date', title: '计划投产点' },
  { key: 'main_systems', title: '主责系统' },
  { key: 'collab_dev_systems', title: '协同改造系统' },
  { key: 'collab_test_systems', title: '协同测试系统' },
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
    throw badRequest('分析完成（终态）时，主责系统至少填写 1 个');
  }
  const cnt = countByFields('requirement', reqId, ['需求说明书']);
  if (cnt === 0) throw badRequest('分析完成（终态）时，需求说明书附件或路径至少填写 1 个');
}

export default async function requirementRoutes(fastify) {
  // 列表（按所选投产窗口过滤；多选用 IN，留空=全部）
  fastify.post('/requirements/list', { preHandler: fastify.requirePerm('requirement', 'view') }, async (request) => {
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
          wh.push(`EXISTS (SELECT 1 FROM json_each(requirement.main_systems) WHERE value IN (${placeholders}))`);
          params.push(...codes);
        }
      } else if (f.field === 'collab_systems') {
        const codes = Array.isArray(f.value) ? f.value : [f.value];
        if (codes.length) {
          const placeholders = codes.map(() => '?').join(',');
          wh.push(`(
            EXISTS (SELECT 1 FROM json_each(requirement.collab_dev_systems) WHERE value IN (${placeholders})) OR
            EXISTS (SELECT 1 FROM json_each(requirement.collab_test_systems) WHERE value IN (${placeholders}))
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
      table: 'requirement', columns: COLUMNS, searchColumns: SEARCH,
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

    // 仅针对当前页的需求编号做关联查询，避免随翻页整表扫描 dev_task/test_task/release_task
    const pageCodes = result.list.map((r) => r.req_code).filter(Boolean);
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
      decoded.has_tasks = linkedCodes.has(decoded.req_code);

      const rtStatus = rtMap[decoded.req_code] || null;
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

  // 详情（含附件）
  fastify.get('/requirements/:id', { preHandler: fastify.requirePerm('requirement', 'view') }, async (request) => {
    const row = get('SELECT * FROM requirement WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    return ok({ ...decode(row), has_tasks: linkedTaskCount(row.req_code) > 0, attachments: listByEntity('requirement', row.id) });
  });

  // 按需求编号查询（供详情单页通过 URL 编号直达）
  fastify.get('/requirements/by-code/:code', { preHandler: fastify.requirePerm('requirement', 'view') }, async (request) => {
    const row = get('SELECT * FROM requirement WHERE req_code = ?', request.params.code);
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

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    const cols = [
      { key: 'req_code', title: '需求编号' },
      { key: 'title', title: '需求标题' },
      { key: 'summary', title: '需求概述' },
      { key: 'status', title: '需求状态' },
      { key: 'req_type', title: '需求类型' },
      { key: 'propose_dept', title: '农信提出部门' },
      { key: 'proposer', title: '农信提出人' },
      { key: 'yn_owner', title: '云南农信业务负责人' },
      { key: 'jk_owner', title: '建信金科业务负责人' },
      { key: 'propose_time', title: '提出时间' },
      { key: 'release_date', title: '计划投产点' },
      { key: 'main_systems', title: '主责系统' },
      { key: 'collab_dev_systems', title: '协同改造系统' },
      { key: 'collab_test_systems', title: '协同测试系统' },
      { key: 'registrar', title: '登记人' },
      { key: 'register_time', title: '登记时间' },
      { key: 'attachments', title: '需求说明书' },
    ];

    const mappedList = result.list.map(row => {
      const main = row.main_systems ? JSON.parse(row.main_systems) : [];
      const collabDev = row.collab_dev_systems ? JSON.parse(row.collab_dev_systems) : [];
      const collabTest = row.collab_test_systems ? JSON.parse(row.collab_test_systems) : [];
      const attaches = all("SELECT * FROM attachment WHERE entity_type = 'requirement' AND entity_id = ?", row.id);

      return {
        ...row,
        release_date: rpMap[row.release_point_id] || '',
        main_systems: main.map(c => sysMap[c] || c).join(', '),
        collab_dev_systems: collabDev.map(c => sysMap[c] || c).join(', '),
        collab_test_systems: collabTest.map(c => sysMap[c] || c).join(', '),
        attachments: formatAttachments(attaches, '需求说明书'),
      };
    });

    const buf = await exportXlsx(cols, mappedList, '需求清单');
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

  // 导入（按 需求编号 去重；计划投产点按日期匹配 release_point；编号留空则自动生成；支持兼容性处理与回滚）
  fastify.post('/requirements/import', { preHandler: fastify.requirePerm('requirement', 'import') }, async (request) => {
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
          if (!r.title) throw new Error('需求标题不能为空');
          if (!r.release_date) throw new Error('计划投产点不能为空');

          // 解析计划投产点
          const rpId = resolveReleasePoint(r.release_date);
          if (!rpId) throw new Error(`计划投产点投产日期 [${r.release_date}] 不存在`);

          // 兼容性字典转换
          const status = resolveDictAttr('process_status', r.status) || '需求登记';
          const reqType = resolveDictAttr('req_type', r.req_type);
          const proposeDept = resolveDictAttr('org', r.propose_dept);

          // 兼容性系统转换
          const mainSystems = resolveSystemCodes(r.main_systems);
          const collabDevSystems = resolveSystemCodes(r.collab_dev_systems);
          const collabTestSystems = resolveSystemCodes(r.collab_test_systems);

          let code = String(r.req_code || '').trim();
          const exists = code ? get('SELECT * FROM requirement WHERE req_code = ?', code) : null;

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
              throw new Error(`需求编号 [${code}] 已存在，无法覆盖`);
            }

            // overwrite 模式：比对并更新
            const changes = [];
            const compareAndPush = (fieldKey, fieldName, oldVal, newVal) => {
              if (oldVal !== newVal) {
                changes.push({ field: fieldName, old: oldVal, new: newVal });
              }
            };

            compareAndPush('title', '需求标题', exists.title || '', r.title || '');
            compareAndPush('summary', '需求概述', exists.summary || '', r.summary || '');
            compareAndPush('status', '需求状态', exists.status || '', status || '');
            compareAndPush('req_type', '需求类型', exists.req_type || '', reqType || '');
            compareAndPush('propose_dept', '农信提出部门', exists.propose_dept || '', proposeDept || '');
            compareAndPush('proposer', '农信提出人', exists.proposer || '', r.proposer || '');
            compareAndPush('yn_owner', '云南农信业务负责人', exists.yn_owner || '', r.yn_owner || '');
            compareAndPush('jk_owner', '建信金科业务负责人', exists.jk_owner || '', r.jk_owner || '');
            compareAndPush('propose_time', '提出时间', exists.propose_time || '', r.propose_time || '');
            
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
                `UPDATE requirement SET 
                   title=?, summary=?, status=?, req_type=?, propose_dept=?, proposer=?, yn_owner=?, jk_owner=?, 
                   propose_time=?, release_point_id=?, main_systems=?, collab_dev_systems=?, collab_test_systems=?, 
                   updated_at=datetime('now','localtime') 
                 WHERE id=?`,
                r.title, r.summary || null, status, reqType || null, proposeDept || null, r.proposer || null,
                r.yn_owner || null, r.jk_owner || null, r.propose_time || null, rpId,
                mainSystems, collabDevSystems, collabTestSystems, exists.id
              );
              auditUpdate('requirement', exists.id, code, request.currentUser?.name, exists, {
                title: r.title, summary: r.summary || null, status, req_type: reqType || null,
                propose_dept: proposeDept || null, proposer: r.proposer || null, yn_owner: r.yn_owner || null,
                jk_owner: r.jk_owner || null, propose_time: r.propose_time || null, release_point_id: rpId,
                main_systems: mainSystems, collab_dev_systems: collabDevSystems, collab_test_systems: collabTestSystems
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
            if (!code) code = genRequirementCode(rpMap[rpId]);
            const res = run(
              `INSERT INTO requirement 
                 (req_code, title, summary, status, req_type, propose_dept, proposer, yn_owner, jk_owner, 
                  propose_time, release_point_id, main_systems, collab_dev_systems, collab_test_systems, registrar, register_time)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              code, r.title, r.summary || null, status, reqType || null, proposeDept || null, r.proposer || null,
              r.yn_owner || null, r.jk_owner || null, r.propose_time || null, rpId,
              mainSystems, collabDevSystems, collabTestSystems, request.currentUser?.name, new Date().toISOString().slice(0, 10)
            );
            auditCreate('requirement', res.lastInsertRowid, code, request.currentUser?.name);
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
            key: r.req_code || '未知编号',
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

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
import { exportXlsx, parseXlsx } from '../../lib/excel.js';
import { resolveDictAttr, resolveSystemCode, formatAttachments } from '../../lib/resolver.js';

// 导入模板和常用列定义
const IO_COLUMNS = [
  { key: 'req_code', title: '关联需求编号' },
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
          wh.push(`req_code IN (SELECT req_code FROM requirement WHERE release_point_id IN (${placeholders}))`);
          params.push(...ids);
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
      const sub = inClause('release_point_id', windowIds(body));
      if (sub.where) {
        wh.push(`req_code IN (SELECT req_code FROM requirement WHERE ${sub.where})`);
        params.push(...sub.params);
      }
    }

    const newBody = { ...body, filters: normalFilters };
    const baseWhere = wh.join(' AND ');

    const result = listQuery({ table: 'dev_task', columns: COLUMNS, searchColumns: SEARCH, query: newBody, baseWhere, baseParams: params });

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
  // 组装开发任务详情：附带关联需求标题（供详情联动展示）
  const buildDevDetail = (row) => {
    const reqRow = get('SELECT title FROM requirement WHERE req_code = ?', row.req_code);
    return { ...row, req_title: reqRow?.title || null, attachments: listByEntity('dev', row.id) };
  };

  fastify.get('/dev-tasks/:id', { preHandler: fastify.requirePerm('dev', 'view') }, async (request) => {
    const row = get('SELECT * FROM dev_task WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    return ok(buildDevDetail(row));
  });

  // 按开发任务编号查询（供详情单页通过 URL 编号直达）
  fastify.get('/dev-tasks/by-code/:code', { preHandler: fastify.requirePerm('dev', 'view') }, async (request) => {
    const row = get('SELECT * FROM dev_task WHERE task_code = ?', request.params.code);
    if (!row) throw notFound();
    return ok(buildDevDetail(row));
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

  // 导出
  fastify.post('/dev-tasks/export', { preHandler: fastify.requirePerm('dev', 'export') }, async (request, reply) => {
    const body = request.body || {};
    const { where: baseWhere, params: baseParams } = inClause('req_code', body.req_code ? [body.req_code] : []);
    
    // 如果没有指定 req_code，根据窗口过滤
    let finalWhere = baseWhere;
    let finalParams = [...baseParams];
    if (!body.req_code) {
      const win = inClause('req_code', all("SELECT req_code FROM requirement WHERE release_point_id IN (SELECT id FROM release_point WHERE is_default = 1 OR release_date >= date('now'))").map(r => r.req_code));
      if (win.where) {
        finalWhere = win.where;
        finalParams = win.params;
      }
    }

    const result = listQuery({
      table: 'dev_task', columns: COLUMNS, searchColumns: SEARCH,
      query: { ...body, pageSize: 0 }, baseWhere: finalWhere, baseParams: finalParams,
    });

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const cols = [
      { key: 'req_code', title: '关联需求编号' },
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
    ];

    const mappedList = result.list.map(row => {
      const attaches = all("SELECT * FROM attachment WHERE entity_type = 'dev' AND entity_id = ?", row.id);
      return {
        ...row,
        impl_system: sysMap[row.impl_system] || row.impl_system,
        deviation_rate: row.deviation_rate != null ? `${row.deviation_rate}%` : '0%',
        design_brief: formatAttachments(attaches, '概要设计'),
        design_detail: formatAttachments(attaches, '详细设计'),
        code_review: formatAttachments(attaches, '代码走查'),
        unit_test: formatAttachments(attaches, '单元测试报告'),
      };
    });

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

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    const apply = () => {
      for (const r of rows) {
        const rowNum = r.__rowNum__;
        try {
          if (!r.req_code) throw new Error('关联需求编号不能为空');
          if (!r.task_name) throw new Error('开发任务名称不能为空');

          // 校验关联需求编号是否存在
          const req = get('SELECT id FROM requirement WHERE req_code = ?', r.req_code);
          if (!req) throw new Error(`关联需求编号 [${r.req_code}] 不存在`);

          // 兼容性字典/系统转换
          const status = resolveDictAttr('process_status', r.status) || '开发承接';
          const implOrg = resolveDictAttr('org', r.impl_org);
          const implSystem = resolveSystemCode(r.impl_system);

          let code = String(r.task_code || '').trim();
          const exists = code ? get('SELECT * FROM dev_task WHERE task_code = ?', code) : null;

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
              run(
                `UPDATE dev_task SET 
                   task_name=?, content=?, status=?, owner=?, impl_system=?, impl_org=?, 
                   plan_start=?, plan_end=?, actual_start=?, actual_end=?, deviation_rate=?, 
                   updated_at=datetime('now','localtime') 
                 WHERE id=?`,
                r.task_name, r.content || null, status, r.owner || null, implSystem || null, implOrg || null,
                r.plan_start || null, r.plan_end || null, r.actual_start || null, r.actual_end || null, devRate, exists.id
              );
              auditUpdate('dev', exists.id, code, request.currentUser?.name, exists, {
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
            if (!code) code = genDevCode(r.req_code);
            const devRate = calcDeviation(r.plan_start, r.plan_end, r.actual_end);
            const res = run(
              `INSERT INTO dev_task 
                 (req_code, task_code, task_name, content, status, owner, impl_system, impl_org, 
                  plan_start, plan_end, actual_start, actual_end, deviation_rate, registrar, register_time)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              r.req_code, code, r.task_name, r.content || null, status, r.owner || null, implSystem || null, implOrg || null,
              r.plan_start || null, r.plan_end || null, r.actual_start || null, r.actual_end || null, devRate,
              request.currentUser?.name, new Date().toISOString().slice(0, 10)
            );
            auditCreate('dev', res.lastInsertRowid, code, request.currentUser?.name);
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

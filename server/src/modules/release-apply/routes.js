/**
 * 文件：modules/release-apply/routes.js
 * 用途：投产申请（版本变更申请）模块接口。变更申请 CRUD（全字段可改并留痕）、变更编号生成、
 *       默认按当前投产窗口过滤、导入导出。评审状态由所关联需求的投产审批评审状态派生（取最弱）。
 * 作者：hengguan
 * 说明：ref_codes（问题/需求编号）以 JSON 数组入库；change_system 存系统编号；制品类型/摆渡状态取自字典。
 */

import { get, run, tx, all } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { genReleaseApplyCode } from '../../lib/code-gen.js';
import { auditCreate, auditUpdate, auditDelete } from '../../lib/audit.js';
import { exportXlsx, parseXlsx } from '../../lib/excel.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, notFound, badRequest } from '../../lib/http.js';

// 列表查询可排序/筛选的列白名单（不含派生 review_status）
const COLUMNS = [
  'id', 'change_code', 'change_content', 'impact_scope', 'change_system', 'impl_org', 'delivery_units',
  'release_point_id', 'registrar', 'register_time', 'created_at',
];
const SEARCH = ['change_code', 'change_content', 'change_system'];
const JSON_FIELDS = ['ref_codes', 'delivery_units'];
const WRITABLE = [
  'change_code', 'change_content', 'impact_scope', 'change_system', 'impl_org', 'delivery_units',
  'ref_codes', 'out_dept', 'deploy_dept', 'release_point_id',
];
const LABELS = {
  change_code: '变更编号', change_content: '变更内容', impact_scope: '影响范围', change_system: '变更系统',
  impl_org: '实施机构', delivery_units: '交付制品',
  ref_codes: '问题/需求编号', out_dept: '变更负责部门（输出口径）', deploy_dept: '变更负责部门（部署口径）',
  release_point_id: '计划投产点',
};

// 交付制品分组字段
const UNIT_KEYS = ['artifact_type', 'delivery_unit', 'new_version', 'ferry_status'];

/** 规整交付制品数组：仅保留组内字段，过滤全空组，摆渡状态缺省为未摆渡 */
function normalizeUnits(units) {
  if (!Array.isArray(units)) return [];
  return units
    .map((u) => ({
      artifact_type: u?.artifact_type ?? null,
      delivery_unit: u?.delivery_unit ?? null,
      new_version: u?.new_version ?? null,
      ferry_status: u?.ferry_status || '未摆渡',
    }))
    .filter((u) => u.artifact_type || u.delivery_unit || u.new_version);
}

// 评审状态强弱排序（数值越小越弱）：评审拒绝 < 评审撤销 < 待评审 < 应急审批 < 评审同意
const REVIEW_RANK = { '评审拒绝': 0, '评审撤销': 1, '待评审': 2, '应急审批': 3, '评审同意': 4 };

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
  if (out.delivery_units !== undefined) out.delivery_units = normalizeUnits(out.delivery_units);
  return out;
}

/**
 * 由关联的需求/问题编号派生评审状态：从投产审批表（release_task）取各需求的评审状态，取最弱。
 * 仅需求编号在投产审批表中有记录；问题编号无评审状态。无任何匹配则返回 null。
 */
function deriveReviewStatus(refCodes) {
  if (!Array.isArray(refCodes) || !refCodes.length) return null;
  let weakest = null;
  let weakestRank = Infinity;
  for (const code of refCodes) {
    const rt = get('SELECT review_status FROM release_task WHERE req_code = ?', code);
    if (!rt || !rt.review_status) continue;
    const rank = REVIEW_RANK[rt.review_status] ?? 2;
    if (rank < weakestRank) { weakestRank = rank; weakest = rt.review_status; }
  }
  return weakest;
}

/** 解析投产窗口对应的版本年月（YYYYMM）；缺省回退到当前月 */
function yearMonthOf(releasePointId) {
  if (releasePointId) {
    const rp = get('SELECT release_date FROM release_point WHERE id = ?', releasePointId);
    if (rp?.release_date) return String(rp.release_date).slice(0, 6);
  }
  return new Date().toISOString().slice(0, 7).replace('-', '');
}

export default async function releaseApplyRoutes(fastify) {
  // 列表（默认按当前投产窗口过滤）
  fastify.post('/release-apply/list', { preHandler: fastify.requirePerm('release_apply', 'view') }, async (request) => {
    const body = request.body || {};
    const wh = [];
    const params = [];

    // 默认投产窗口过滤
    const win = inClause('release_point_id', windowIds(body));
    if (win.where) { wh.push(win.where); params.push(...win.params); }

    const filters = Array.isArray(body.filters) ? body.filters : [];
    const normalFilters = [];
    for (const f of filters) {
      if (!f || f.value === undefined || f.value === null || f.value === '') continue;
      if (f.field === 'change_code') {
        wh.push('change_code LIKE ?');
        params.push(`%${f.value}%`);
      } else if (f.field === 'content') {
        wh.push('(change_content LIKE ? OR impact_scope LIKE ?)');
        params.push(`%${f.value}%`, `%${f.value}%`);
      } else if (['change_system', 'impl_org'].includes(f.field)) {
        const vals = Array.isArray(f.value) ? f.value : [f.value];
        if (vals.length) {
          wh.push(`${f.field} IN (${vals.map(() => '?').join(',')})`);
          params.push(...vals);
        }
      } else if (['artifact_type', 'ferry_status'].includes(f.field)) {
        // 交付制品为 JSON 数组，按组内字段匹配
        const vals = Array.isArray(f.value) ? f.value : [f.value];
        if (vals.length) {
          wh.push(`EXISTS (SELECT 1 FROM json_each(delivery_units) WHERE json_extract(value, '$.${f.field}') IN (${vals.map(() => '?').join(',')}))`);
          params.push(...vals);
        }
      } else {
        normalFilters.push(f);
      }
    }

    const newBody = { ...body, filters: normalFilters };
    const baseWhere = wh.join(' AND ');
    const result = listQuery({
      table: 'release_apply', columns: COLUMNS, searchColumns: SEARCH,
      query: newBody, baseWhere, baseParams: params,
    });

    // 主数据映射
    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;
    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    // 逐行补充派生字段（ref_codes 解码、评审状态实时派生、系统名称、投产点日期）
    const pageRows = result.list.map((r) => get('SELECT * FROM release_apply WHERE id = ?', r.id));
    result.list = pageRows.map((row) => {
      const decoded = decode(row);
      decoded.review_status = deriveReviewStatus(decoded.ref_codes);
      decoded.change_system_name = row.change_system ? `${row.change_system} - ${sysMap[row.change_system] || row.change_system}` : null;
      decoded.release_date = rpMap[row.release_point_id] || null;
      return decoded;
    });

    return ok(result);
  });

  // 详情
  fastify.get('/release-apply/:id', { preHandler: fastify.requirePerm('release_apply', 'view') }, async (request) => {
    const row = get('SELECT * FROM release_apply WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    const decoded = decode(row);
    decoded.review_status = deriveReviewStatus(decoded.ref_codes);
    return ok(decoded);
  });

  // 新增
  fastify.post('/release-apply', { preHandler: fastify.requirePerm('release_apply', 'create') }, async (request) => {
    const body = request.body || {};
    if (!body.change_content) throw badRequest('变更内容必填');

    // 变更编号：手填校验唯一，否则按规则生成
    let code = (body.change_code || '').trim();
    if (code) {
      if (get('SELECT id FROM release_apply WHERE change_code = ?', code)) throw badRequest('变更编号已存在');
    } else {
      code = genReleaseApplyCode(yearMonthOf(body.release_point_id));
    }

    const picked = pick(body);
    const reviewStatus = deriveReviewStatus(Array.isArray(body.ref_codes) ? body.ref_codes : []);
    const data = encodeField(picked);

    const id = tx(() => {
      const fields = ['change_code', 'review_status', 'registrar', 'register_time', ...Object.keys(data).filter((k) => k !== 'change_code')];
      const values = [
        code,
        reviewStatus,
        request.currentUser?.name,
        new Date().toISOString().slice(0, 10),
        ...Object.keys(data).filter((k) => k !== 'change_code').map((k) => data[k]),
      ];
      const res = run(
        `INSERT INTO release_apply (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
        ...values,
      );
      return res.lastInsertRowid;
    });
    auditCreate('release_apply', id, code, request.currentUser?.name);
    return ok({ id, change_code: code });
  });

  // 修改（留痕）
  fastify.put('/release-apply/:id', { preHandler: fastify.requirePerm('release_apply', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = get('SELECT * FROM release_apply WHERE id = ?', id);
    if (!old) throw notFound();
    const body = request.body || {};
    const picked = pick(body);

    // 变更编号唯一性校验（排除自身）
    if (picked.change_code && picked.change_code !== old.change_code) {
      const dup = get('SELECT id FROM release_apply WHERE change_code = ? AND id != ?', picked.change_code, id);
      if (dup) throw badRequest('变更编号已存在，请更换');
    }

    const data = encodeField(picked);
    // 评审状态随 ref_codes 实时重算
    const newRefs = picked.ref_codes !== undefined
      ? (Array.isArray(picked.ref_codes) ? picked.ref_codes : [])
      : (old.ref_codes ? JSON.parse(old.ref_codes) : []);
    data.review_status = deriveReviewStatus(newRefs);

    const keys = Object.keys(data);
    if (keys.length) {
      run(
        `UPDATE release_apply SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
        ...keys.map((k) => data[k]), id,
      );
      const oldReadable = decode(old);
      const newReadable = { ...picked };
      auditUpdate('release_apply', id, old.change_code, request.currentUser?.name, oldReadable, newReadable, LABELS);
    }
    return ok({ id });
  });

  // 生成变更编号
  fastify.get('/release-apply/gen-code', { preHandler: fastify.requirePerm('release_apply', 'view') }, async (request) => {
    const releasePointId = request.query.releasePointId;
    return ok({ change_code: genReleaseApplyCode(yearMonthOf(releasePointId)) });
  });

  // 校验编号唯一性
  fastify.get('/release-apply/check-code', { preHandler: fastify.requirePerm('release_apply', 'view') }, async (request) => {
    const { code, excludeId } = request.query;
    if (!code) return ok({ exists: false });
    const row = excludeId
      ? get('SELECT id FROM release_apply WHERE change_code = ? AND id != ?', code, excludeId)
      : get('SELECT id FROM release_apply WHERE change_code = ?', code);
    return ok({ exists: !!row });
  });

  // 删除
  fastify.delete('/release-apply/:id', { preHandler: fastify.requirePerm('release_apply', 'delete') }, async (request) => {
    const id = request.params.id;
    const row = get('SELECT * FROM release_apply WHERE id = ?', id);
    if (!row) throw notFound();
    run('DELETE FROM release_apply WHERE id = ?', id);
    auditDelete('release_apply', id, row.change_code, request.currentUser?.name);
    return ok(null, '删除成功');
  });

  // 导出
  fastify.post('/release-apply/export', { preHandler: fastify.requirePerm('release_apply', 'export') }, async (request, reply) => {
    const body = request.body || {};
    const { where: baseWhere, params: baseParams } = inClause('release_point_id', windowIds(body));
    const result = listQuery({
      table: 'release_apply', columns: COLUMNS, searchColumns: SEARCH,
      query: { ...body, pageSize: 0 }, baseWhere, baseParams,
    });

    const systems = all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;
    const rps = all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    const cols = [
      { key: 'change_code', title: '变更编号' },
      { key: 'change_content', title: '变更内容' },
      { key: 'impact_scope', title: '影响范围' },
      { key: 'change_system', title: '变更系统' },
      { key: 'impl_org', title: '实施机构' },
      { key: 'delivery_units', title: '交付制品（制品类型/交付单元/新版本号/摆渡状态）' },
      { key: 'ref_codes', title: '问题/需求编号' },
      { key: 'review_status', title: '评审状态' },
      { key: 'out_dept', title: '变更负责部门（输出口径）' },
      { key: 'deploy_dept', title: '变更负责部门（部署口径）' },
      { key: 'release_date', title: '计划投产点' },
      { key: 'registrar', title: '登记人' },
      { key: 'register_time', title: '登记时间' },
    ];

    const mappedList = result.list.map((row) => {
      const refs = row.ref_codes ? JSON.parse(row.ref_codes) : [];
      let units = [];
      try { units = row.delivery_units ? JSON.parse(row.delivery_units) : []; } catch { units = []; }
      const unitsText = units
        .map((u) => [u.artifact_type, u.delivery_unit, u.new_version, u.ferry_status].filter(Boolean).join(' / '))
        .join('\n');
      return {
        ...row,
        change_system: row.change_system ? `${row.change_system} - ${sysMap[row.change_system] || row.change_system}` : '',
        delivery_units: unitsText,
        ref_codes: refs.join('、'),
        review_status: deriveReviewStatus(refs) || '',
        release_date: rpMap[row.release_point_id] || '',
      };
    });

    const buf = await exportXlsx(cols, mappedList, '投产申请清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=release_apply.xlsx');
    return reply.send(buf);
  });

  // 导入模板
  const IO_COLUMNS = [
    { key: 'change_code', title: '变更编号' },
    { key: 'change_content', title: '变更内容' },
    { key: 'impact_scope', title: '影响范围' },
    { key: 'change_system', title: '变更系统' },
    { key: 'impl_org', title: '实施机构' },
    { key: 'artifact_type', title: '制品类型' },
    { key: 'delivery_unit', title: '交付单元名称' },
    { key: 'new_version', title: '新版本号' },
    { key: 'ref_codes', title: '问题/需求编号' },
    { key: 'out_dept', title: '变更负责部门（输出口径）' },
    { key: 'deploy_dept', title: '变更负责部门（部署口径）' },
    { key: 'ferry_status', title: '摆渡状态' },
  ];

  fastify.get('/release-apply/template', { preHandler: fastify.requirePerm('release_apply', 'import') }, async (request, reply) => {
    const buf = await exportXlsx(IO_COLUMNS, [], '投产申请模板');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=release_apply_template.xlsx');
    return reply.send(buf);
  });

  // 导入（按变更编号去重；编号留空则自动生成；ref_codes 支持「、,，」分隔）
  fastify.post('/release-apply/import', { preHandler: fastify.requirePerm('release_apply', 'import') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = data.fields?.mode?.value || 'skip';
    const buffer = await data.toBuffer();
    const rows = await parseXlsx(buffer, IO_COLUMNS);
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
    const details = [];

    const splitCodes = (v) => String(v || '').split(/[、,，\s]+/).map((s) => s.trim()).filter(Boolean);

    const apply = () => {
      for (const r of rows) {
        const rowNum = r.__rowNum__;
        try {
          if (!r.change_content) throw new Error('变更内容不能为空');
          const refs = splitCodes(r.ref_codes);
          const reviewStatus = deriveReviewStatus(refs);
          // 导入按单组交付制品处理（多组请在页面维护）
          const units = JSON.stringify(normalizeUnits([{
            artifact_type: r.artifact_type || null, delivery_unit: r.delivery_unit || null,
            new_version: r.new_version || null, ferry_status: r.ferry_status || '未摆渡',
          }]));
          let code = String(r.change_code || '').trim();
          const exists = code ? get('SELECT * FROM release_apply WHERE change_code = ?', code) : null;

          if (exists) {
            if (mode === 'skip') {
              stat.skipped++;
              details.push({ key: code, title: r.change_content, action: 'skip', status: 'success', __rowNum__: rowNum });
              continue;
            }
            if (mode === 'rollback') throw new Error(`变更编号 [${code}] 已存在，无法覆盖`);
            run(
              `UPDATE release_apply SET change_content=?, impact_scope=?, change_system=?, impl_org=?, delivery_units=?,
                 ref_codes=?, review_status=?, out_dept=?, deploy_dept=?,
                 updated_at=datetime('now','localtime') WHERE id=?`,
              r.change_content, r.impact_scope || null, r.change_system || null, r.impl_org || null, units,
              JSON.stringify(refs), reviewStatus, r.out_dept || null, r.deploy_dept || null, exists.id,
            );
            auditUpdate('release_apply', exists.id, code, request.currentUser?.name, exists, {
              change_content: r.change_content, impact_scope: r.impact_scope || null,
            }, LABELS);
            stat.updated++;
            details.push({ key: code, title: r.change_content, action: 'update', status: 'success', __rowNum__: rowNum });
          } else {
            if (!code) code = genReleaseApplyCode(yearMonthOf(null));
            const res = run(
              `INSERT INTO release_apply
                 (change_code, change_content, impact_scope, change_system, impl_org, delivery_units,
                  ref_codes, review_status, out_dept, deploy_dept, registrar, register_time)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
              code, r.change_content, r.impact_scope || null, r.change_system || null, r.impl_org || null,
              units, JSON.stringify(refs), reviewStatus, r.out_dept || null, r.deploy_dept || null,
              request.currentUser?.name, new Date().toISOString().slice(0, 10),
            );
            auditCreate('release_apply', res.lastInsertRowid, code, request.currentUser?.name);
            stat.inserted++;
            details.push({ key: code, title: r.change_content, action: 'insert', status: 'success', __rowNum__: rowNum });
          }
        } catch (err) {
          stat.failed++;
          details.push({ key: r.change_code || '未知编号', title: r.change_content || '空内容', status: 'fail', __rowNum__: rowNum, error: err.message });
          if (mode === 'rollback') throw err;
        }
      }
    };

    if (mode === 'rollback') {
      try { tx(apply); } catch (err) {
        for (const item of details) if (item.status === 'success') item.action = 'skip';
        stat.inserted = 0; stat.updated = 0;
      }
    } else {
      apply();
    }

    return ok({ stat, details }, '导入完成');
  });
}

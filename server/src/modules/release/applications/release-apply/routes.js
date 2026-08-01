/**
 * 文件：server/src/modules/release/applications/release-apply/routes.js
 * 说明：ref_codes（需求/工单编号）以 JSON 数组入库；change_system 存系统编号；制品类型/摆渡状态取自字典。
 * 用途：投产申请（版本变更申请）模块接口。变更申请 CRUD（全字段可改并留痕）、变更编号生成、
 *       默认按当前投产窗口过滤、导入导出。评审状态由所关联需求的投产审批评审状态派生（取最弱）。
 * 作者：hengguan
 */

import { get, run, tx, all, dialect, listQuery } from '../../../../platform/persistence/index.js';
import { claimReleaseApplyCode, previewReleaseApplyCode } from './index.js';
import { auditCreate, auditUpdate, auditDelete } from '../../../../platform/audit/index.js';
import { exportXlsx, parseXlsx } from '../../../../platform/import-export/index.js';
import { windowIds, inClause, resolveOrganizationValues } from '../../../settings/reference-data/index.js';
import { ok, notFound, badRequest, forbidden, parseJsonArray, parseJsonObject } from '../../../../platform/runtime/index.js';
import {
  buildExtensionListFilter, defaultDictAttr,
} from '../../../settings/process-configuration/index.js';
import { getWorkItem } from '../../../development/index.js';
import { isOrganizationRestricted, organizationMatches, workItemMatchesOrganization } from '../../../../shared/utils/organization-scope.js';
import {
  appendStageExcelValues,
  appendStageListValues,
  extensionValuesFromExcelRow,
  getStageExcelColumns,
  saveExtensionValues,
  validateStageContent,
} from '../../../settings/process-configuration/index.js';

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
  ref_codes: '关联需求/工单', out_dept: '变更负责部门（输出口径）', deploy_dept: '变更负责部门（部署口径）',
  release_point_id: '申请投产点', review_status: '评审状态',
};

// 交付制品分组字段
const UNIT_KEYS = ['artifact_type', 'delivery_unit', 'new_version', 'ferry_status'];

/** 规整关联编号并去重，避免同一申请写入重复关系行或触发无效评审查询。 */
function normalizeRefCodes(refCodes) {
  return [...new Set((Array.isArray(refCodes) ? refCodes : [])
    .map((code) => String(code || '').trim())
    .filter(Boolean))];
}

/** 同步 JSON 兼容字段对应的索引读模型；调用方须在写入事务内执行。 */
async function syncReleaseApplyReferences(releaseApplyId, refCodes, releasePointId) {
  await run('DELETE FROM release_apply_reference WHERE release_apply_id = ?', releaseApplyId);
  for (const code of normalizeRefCodes(refCodes)) {
    await run(
      'INSERT INTO release_apply_reference (release_apply_id, ref_code, release_point_id) VALUES (?,?,?)',
      releaseApplyId, code, releasePointId ?? null,
    );
  }
}

/** 规整交付制品数组：仅保留组内字段，过滤全空组，摆渡状态取字典默认值 */
async function normalizeUnits(units) {
  if (!Array.isArray(units)) return [];
  const defaultFerryStatus = await defaultDictAttr('ferry_status', '未摆渡');
  return units
    .map((u) => ({
      artifact_type: u?.artifact_type ?? null,
      delivery_unit: u?.delivery_unit ?? null,
      new_version: u?.new_version ?? null,
      ferry_status: u?.ferry_status || defaultFerryStatus,
    }))
    .filter((u) => u.artifact_type || u.delivery_unit || u.new_version);
}

/** 把 JSON 字符串字段解析为数组返回给前端 */
function decode(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of JSON_FIELDS) out[f] = parseJsonArray(row[f]);
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
async function pick(body) {
  const out = {};
  for (const k of WRITABLE) if (body[k] !== undefined) out[k] = body[k];
  if (out.delivery_units !== undefined) out.delivery_units = await normalizeUnits(out.delivery_units);
  return out;
}

/**
 * 由关联的需求/工单编号派生评审状态：从投产审批表（release_task）取评审状态，取最弱。
 * 无任何匹配则返回 null。
 */
async function deriveReviewStatus(refCodes, releasePointId) {
  const codes = normalizeRefCodes(refCodes);
  if (!codes.length) return null;
  const placeholders = codes.map(() => '?').join(',');
  const rows = await all(
    `SELECT DISTINCT review_status FROM release_task
      WHERE req_code IN (${placeholders})
        AND (release_point_id = ? OR (release_point_id IS NULL AND ? IS NULL))`,
    ...codes, releasePointId ?? null, releasePointId ?? null,
  );
  if (!rows.length) return null;
  const statuses = rows.map((row) => row.review_status).filter(Boolean);
  const statusPlaceholders = statuses.map(() => '?').join(',');
  const rankRows = await all(
    `SELECT attr_value, sort, extra FROM dict_item
      WHERE category = 'review_status' AND attr_value IN (${statusPlaceholders})`,
    ...statuses,
  );
  const rankMap = new Map();
  for (const row of rankRows) {
    const rank = Number(parseJsonObject(row.extra).rank);
    const fallbackRank = Number(row.sort);
    rankMap.set(row.attr_value, Number.isFinite(rank) ? rank : (Number.isFinite(fallbackRank) ? fallbackRank : Number.POSITIVE_INFINITY));
  }
  let weakest = null;
  let weakestRank = Infinity;
  for (const status of statuses) {
    const rank = rankMap.get(status) ?? Number.POSITIVE_INFINITY;
    if (rank < weakestRank) { weakestRank = rank; weakest = status; }
  }
  return weakest;
}

/** 解析投产点对应的窗口日期；当前日期占位符由编号服务统一提供。 */
async function releaseWindowOf(releasePointId) {
  if (releasePointId) {
    const rp = await get('SELECT release_date FROM release_point WHERE id = ?', releasePointId);
    const releaseDate = String(rp?.release_date || '').trim();
    if (/^\d{8}$/.test(releaseDate)) return releaseDate;
  }
  return undefined;
}

async function workItemCodeFor(refCodes) {
  return normalizeRefCodes(refCodes)[0] || '';
}

async function assertReleaseApplyOrganizationAccess(row, user) {
  if (!isOrganizationRestricted(user)) return;
  const organizations = await resolveOrganizationValues(user?.org);
  if (!organizations.length) throw forbidden('无该机构数据权限');
  const system = row?.change_system ? await get('SELECT org FROM system WHERE sys_code = ?', row.change_system) : null;
  if (!system || !organizationMatches(system.org, organizations)) throw forbidden('无该机构数据权限');
}

async function assertWorkItemReferencesOrganizationAccess(refCodes, user) {
  if (!isOrganizationRestricted(user)) return;
  const systems = await all('SELECT sys_code, org FROM system');
  const orgByCode = Object.fromEntries(systems.map((s) => [s.sys_code, s.org]));
  for (const code of normalizeRefCodes(refCodes)) {
    const item = await getWorkItem(code);
    if (!item || !workItemMatchesOrganization(item, await resolveOrganizationValues(user?.org), orgByCode)) throw forbidden('关联需求/工单不属于本人机构');
  }
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
    if (isOrganizationRestricted(request.currentUser)) {
      const organizations = await resolveOrganizationValues(request.currentUser?.org);
      if (!organizations.length) wh.push('1=0');
      else { wh.push(`change_system IN (SELECT sys_code FROM system WHERE org IN (${organizations.map(() => '?').join(',')}))`); params.push(...organizations); }
    }

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
          wh.push(dialect.jsonObjectFieldIn('delivery_units', f.field, vals.map(() => '?').join(',')));
          params.push(...vals);
        }
      } else {
        normalFilters.push(f);
      }
    }

    const newBody = { ...body, filters: normalFilters };
    const baseWhere = wh.join(' AND ');
    const result = await listQuery({
      table: 'release_apply', columns: COLUMNS, searchColumns: SEARCH,
      query: newBody, baseWhere, baseParams: params, extensionScopeKey: 'release_apply', extensionEntityType: 'release_apply',
      extensionFilterBuilder: buildExtensionListFilter,
    });

    // 主数据映射
    const rps = await all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;
    const systems = await all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;

    // 逐行补充派生字段（ref_codes 解码、评审状态实时派生、系统名称、投产点日期）
    const pageRows = await Promise.all(result.list.map((r) => get('SELECT * FROM release_apply WHERE id = ?', r.id)));
    result.list = await Promise.all(pageRows.map(async (row) => {
      const decoded = decode(row);
      decoded.review_status = await deriveReviewStatus(decoded.ref_codes, row.release_point_id);
      decoded.change_system_name = row.change_system ? `${row.change_system} - ${sysMap[row.change_system] || row.change_system}` : null;
      decoded.release_date = rpMap[row.release_point_id] || null;
      return decoded;
    }));
    result.list = await appendStageListValues('release_apply', result.list);

    return ok(result);
  });

  // 详情
  fastify.get('/release-apply/:id', { preHandler: fastify.requirePerm('release_apply', 'view') }, async (request) => {
    const row = await get('SELECT * FROM release_apply WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    await assertReleaseApplyOrganizationAccess(row, request.currentUser);
    const decoded = decode(row);
    decoded.review_status = await deriveReviewStatus(decoded.ref_codes, row.release_point_id);
    return ok(decoded);
  });

  // 按变更编号查询（供详情单页通过 URL 编号直达）
  fastify.get('/release-apply/by-code/:code', { preHandler: fastify.requirePerm('release_apply', 'view') }, async (request) => {
    const row = await get('SELECT * FROM release_apply WHERE change_code = ?', request.params.code);
    if (!row) throw notFound();
    await assertReleaseApplyOrganizationAccess(row, request.currentUser);
    const decoded = decode(row);
    decoded.review_status = await deriveReviewStatus(decoded.ref_codes, row.release_point_id);
    return ok(decoded);
  });

  // 新增
  fastify.post('/release-apply', { preHandler: fastify.requirePerm('release_apply', 'create') }, async (request) => {
    const body = request.body || {};

    const picked = await pick(body);
    if (picked.change_content === undefined) picked.change_content = '';
    const refCodes = Array.isArray(body.ref_codes) ? body.ref_codes : [];
    await assertReleaseApplyOrganizationAccess({ change_system: body.change_system }, request.currentUser);
    await assertWorkItemReferencesOrganizationAccess(refCodes, request.currentUser);
    const reviewStatus = await deriveReviewStatus(refCodes, body.release_point_id ?? null);
    await validateStageContent('release_apply', { ...picked, ref_codes: refCodes, review_status: reviewStatus });
    const data = encodeField(picked);

    const result = await tx(async () => {
      let code = (body.change_code || '').trim();
      // 预览编号仅在 INSERT 前确认占用；并发抢占时改取下一个可用编号，
      // 关闭未保存的申请不会留下跳号。
      const used = code && await get('SELECT id FROM release_apply WHERE change_code = ?', code);
      const releaseWindow = await releaseWindowOf(body.release_point_id);
      const workItemCode = await workItemCodeFor(refCodes);
      code = used
        ? await claimReleaseApplyCode(releaseWindow, '', workItemCode)
        : await claimReleaseApplyCode(releaseWindow, code, workItemCode);

      const fields = ['change_code', 'review_status', 'registrar', 'register_time', ...Object.keys(data).filter((k) => k !== 'change_code')];
      const values = [
        code,
        reviewStatus,
        request.currentUser?.name,
        new Date().toISOString().slice(0, 10),
        ...Object.keys(data).filter((k) => k !== 'change_code').map((k) => data[k]),
      ];
      const res = await run(
        `INSERT INTO release_apply (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`,
        ...values,
      );
      await syncReleaseApplyReferences(res.lastInsertRowid, refCodes, body.release_point_id ?? null);
      return { id: res.lastInsertRowid, code };
    });

    await auditCreate('release_apply', result.id, result.code, request.currentUser?.name);
    return ok({ id: result.id, change_code: result.code });
  });

  // 修改（留痕）
  fastify.put('/release-apply/:id', { preHandler: fastify.requirePerm('release_apply', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = await get('SELECT * FROM release_apply WHERE id = ?', id);
    if (!old) throw notFound();
    await assertReleaseApplyOrganizationAccess(old, request.currentUser);
    const body = request.body || {};
    const picked = await pick(body);

    // 变更编号唯一性校验（排除自身）
    if (picked.change_code && picked.change_code !== old.change_code) {
      const dup = await get('SELECT id FROM release_apply WHERE change_code = ? AND id != ?', picked.change_code, id);
      if (dup) throw badRequest('变更编号已存在，请更换');
    }

    const data = encodeField(picked);
    // 评审状态随 ref_codes 实时重算
    const newRefs = picked.ref_codes !== undefined
      ? (Array.isArray(picked.ref_codes) ? picked.ref_codes : [])
      : parseJsonArray(old.ref_codes);
    await assertReleaseApplyOrganizationAccess({ change_system: picked.change_system ?? old.change_system }, request.currentUser);
    await assertWorkItemReferencesOrganizationAccess(newRefs, request.currentUser);
    const nextReleasePointId = picked.release_point_id !== undefined ? picked.release_point_id : old.release_point_id;
    data.review_status = await deriveReviewStatus(newRefs, nextReleasePointId ?? null);
    await validateStageContent('release_apply', { ...decode(old), ...picked, ref_codes: newRefs, review_status: data.review_status });

    const keys = Object.keys(data);
    if (keys.length) {
      await tx(async () => {
        await run(
          `UPDATE release_apply SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE id=?`,
          ...keys.map((k) => data[k]), id,
        );
        if (picked.ref_codes !== undefined || picked.release_point_id !== undefined) {
          await syncReleaseApplyReferences(id, newRefs, nextReleasePointId ?? null);
        }
      });
      const oldReadable = decode(old);
      const newReadable = { ...picked };
      await auditUpdate('release_apply', id, old.change_code, request.currentUser?.name, oldReadable, newReadable, LABELS);
    }
    return ok({ id });
  });

  // 预览变更编号（不占用序列）
  fastify.get('/release-apply/gen-code', { preHandler: fastify.requirePerm('release_apply', 'view') }, async (request) => {
    const releasePointId = request.query.releasePointId;
    return ok({
      change_code: await previewReleaseApplyCode(
        await releaseWindowOf(releasePointId),
        String(request.query.workItemCode || '').trim(),
      ),
    });
  });

  // 校验编号唯一性
  fastify.get('/release-apply/check-code', { preHandler: fastify.requirePerm('release_apply', 'view') }, async (request) => {
    const { code, excludeId } = request.query;
    if (!code) return ok({ exists: false });
    const row = excludeId
      ? await get('SELECT id FROM release_apply WHERE change_code = ? AND id != ?', code, excludeId)
      : await get('SELECT id FROM release_apply WHERE change_code = ?', code);
    return ok({ exists: !!row });
  });

  // 删除
  fastify.delete('/release-apply/:id', { preHandler: fastify.requirePerm('release_apply', 'delete') }, async (request) => {
    const id = request.params.id;
    const row = await get('SELECT * FROM release_apply WHERE id = ?', id);
    if (!row) throw notFound();
    await assertReleaseApplyOrganizationAccess(row, request.currentUser);
    await run('DELETE FROM release_apply WHERE id = ?', id);
    await auditDelete('release_apply', id, row.change_code, request.currentUser?.name);
    return ok(null, '删除成功');
  });

  // 导出
  fastify.post('/release-apply/export', { preHandler: fastify.requirePerm('release_apply', 'export') }, async (request, reply) => {
    const body = request.body || {};
    const { where: initialWhere, params: initialParams } = inClause('release_point_id', windowIds(body));
    const exportWh = initialWhere ? [initialWhere] : [];
    const exportParams = [...initialParams];
    if (isOrganizationRestricted(request.currentUser)) {
      const organizations = await resolveOrganizationValues(request.currentUser?.org);
      if (!organizations.length) exportWh.push('1=0');
      else { exportWh.push(`change_system IN (SELECT sys_code FROM system WHERE org IN (${organizations.map(() => '?').join(',')}))`); exportParams.push(...organizations); }
    }
    const baseWhere = exportWh.join(' AND ');
    const baseParams = exportParams;
    const result = await listQuery({
      table: 'release_apply', columns: COLUMNS, searchColumns: SEARCH,
      query: { ...body, pageSize: 0 }, baseWhere, baseParams,
    });

    const systems = await all('SELECT sys_code, sys_name FROM system');
    const sysMap = {};
    for (const s of systems) sysMap[s.sys_code] = s.sys_name;
    const rps = await all('SELECT id, release_date FROM release_point');
    const rpMap = {};
    for (const rp of rps) rpMap[rp.id] = rp.release_date;

    const cols = [
      { key: 'change_code', title: '变更编号' },
      { key: 'change_content', title: '变更内容' },
      { key: 'impact_scope', title: '影响范围' },
      { key: 'change_system', title: '变更系统' },
      { key: 'impl_org', title: '实施机构' },
      { key: 'delivery_units', title: '交付制品（制品类型/交付单元/新版本号/摆渡状态）' },
      { key: 'ref_codes', title: '关联需求/工单' },
      { key: 'review_status', title: '评审状态' },
      { key: 'out_dept', title: '变更负责部门（输出口径）' },
      { key: 'deploy_dept', title: '变更负责部门（部署口径）' },
      { key: 'release_date', title: '申请投产点' },
      { key: 'registrar', title: '登记人' },
      { key: 'register_time', title: '登记时间' },
    ];

    const mappedList = await Promise.all(result.list.map(async (row) => {
      const refs = parseJsonArray(row.ref_codes);
      const units = parseJsonArray(row.delivery_units);
      const unitsText = units
        .map((u) => [u.artifact_type, u.delivery_unit, u.new_version, u.ferry_status].filter(Boolean).join(' / '))
        .join('\n');
      return {
        ...row,
        change_system: row.change_system ? `${row.change_system} - ${sysMap[row.change_system] || row.change_system}` : '',
        delivery_units: unitsText,
        ref_codes: refs.join('、'),
        review_status: await deriveReviewStatus(refs, row.release_point_id) || '',
        release_date: rpMap[row.release_point_id] || '',
      };
    }));

    const extensionColumns = await getStageExcelColumns('release_apply');
    const exportRows = await appendStageExcelValues('release_apply', mappedList);
    const buf = await exportXlsx([...cols, ...extensionColumns], exportRows, '投产申请清单');
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
    { key: 'ref_codes', title: '关联需求/工单' },
    { key: 'out_dept', title: '变更负责部门（输出口径）' },
    { key: 'deploy_dept', title: '变更负责部门（部署口径）' },
    { key: 'ferry_status', title: '摆渡状态' },
  ];

  fastify.get('/release-apply/template', { preHandler: fastify.requirePerm('release_apply', 'import') }, async (request, reply) => {
    const buf = await exportXlsx([...IO_COLUMNS, ...await getStageExcelColumns('release_apply')], [], '投产申请模板');
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
    const rows = await parseXlsx(buffer, [...IO_COLUMNS, ...await getStageExcelColumns('release_apply')]);
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0, failed: 0 };
    const details = [];

    const splitCodes = (v) => String(v || '').split(/[、,，\s]+/).map((s) => s.trim()).filter(Boolean);

    const apply = async () => {
      for (const r of rows) {
        const rowNum = r.__rowNum__;
        try {
          if (!r.change_content) throw new Error('变更内容不能为空');
          const refs = splitCodes(r.ref_codes);
          let code = String(r.change_code || '').trim();
          const exists = code ? await get('SELECT * FROM release_apply WHERE change_code = ?', code) : null;
          const reviewStatus = await deriveReviewStatus(refs, exists?.release_point_id ?? null);
          const extensionValues = await extensionValuesFromExcelRow('release_apply', r);
          // 导入按单组交付制品处理（多组请在页面维护）
          const units = JSON.stringify(await normalizeUnits([{
            artifact_type: r.artifact_type || null, delivery_unit: r.delivery_unit || null,
            new_version: r.new_version || null, ferry_status: r.ferry_status || null,
          }]));
          if (exists) {
            if (mode === 'skip') {
              stat.skipped++;
              details.push({ key: code, title: r.change_content, action: 'skip', status: 'success', __rowNum__: rowNum });
              continue;
            }
            if (mode === 'rollback') throw new Error(`变更编号 [${code}] 已存在，无法覆盖`);
            await run(
              `UPDATE release_apply SET change_content=?, impact_scope=?, change_system=?, impl_org=?, delivery_units=?,
                 ref_codes=?, review_status=?, out_dept=?, deploy_dept=?,
                 updated_at=datetime('now','localtime') WHERE id=?`,
              r.change_content, r.impact_scope || null, r.change_system || null, r.impl_org || null, units,
              JSON.stringify(refs), reviewStatus, r.out_dept || null, r.deploy_dept || null, exists.id,
            );
            await syncReleaseApplyReferences(exists.id, refs, exists.release_point_id ?? null);
            await auditUpdate('release_apply', exists.id, code, request.currentUser?.name, exists, {
              change_content: r.change_content,
              impact_scope: r.impact_scope || null,
              change_system: r.change_system || null,
              impl_org: r.impl_org || null,
              delivery_units: units,
              ref_codes: JSON.stringify(refs),
              review_status: reviewStatus,
              out_dept: r.out_dept || null,
              deploy_dept: r.deploy_dept || null,
            }, LABELS);
            await saveExtensionValues('release_apply', exists.id, extensionValues, request.currentUser?.name);
            stat.updated++;
            details.push({ key: code, title: r.change_content, action: 'update', status: 'success', __rowNum__: rowNum });
          } else {
            // 导入空编号按真实已用记录确认，避免旧预览操作造成无意义跳号。
            if (!code) code = await claimReleaseApplyCode(
              await releaseWindowOf(null), '', await workItemCodeFor(refs),
            );
            const res = await run(
              `INSERT INTO release_apply
                 (change_code, change_content, impact_scope, change_system, impl_org, delivery_units,
                  ref_codes, review_status, out_dept, deploy_dept, registrar, register_time)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
              code, r.change_content, r.impact_scope || null, r.change_system || null, r.impl_org || null,
              units, JSON.stringify(refs), reviewStatus, r.out_dept || null, r.deploy_dept || null,
              request.currentUser?.name, new Date().toISOString().slice(0, 10),
            );
            await syncReleaseApplyReferences(res.lastInsertRowid, refs, null);
            await auditCreate('release_apply', res.lastInsertRowid, code, request.currentUser?.name);
            await saveExtensionValues('release_apply', res.lastInsertRowid, extensionValues, request.currentUser?.name);
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
      try { await tx(apply); } catch (err) {
        for (const item of details) if (item.status === 'success') item.action = 'skip';
        stat.inserted = 0; stat.updated = 0;
      }
    } else {
      await apply();
    }

    return ok({ stat, details }, '导入完成');
  });
}

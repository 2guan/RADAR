/**
 * 文件：modules/release-points/routes.js
 * 用途：投产点（投产版本窗口）管理接口。除标准 CRUD 外，提供"设为默认/取消默认"，
 *       以及"当前投产窗口"判定接口（供顶栏全局选择器初始化）。
 * 作者：hengguan
 * 说明：默认投产窗口判定：① 若有 is_default=1 的投产点取之；② 否则取今天起最近的未来投产点；
 *       ③ 再否则取最新日期投产点；若只有非日期投产点则取最新一条。同一时刻最多一个默认投产点。
 */

import { get, all, run, tx } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { registerIO } from '../../lib/io.js';
import { auditCreate, auditUpdate, auditDelete } from '../../lib/audit.js';
import { ok, notFound, badRequest } from '../../lib/http.js';

const COLUMNS = ['id', 'release_date', 'version_type', 'remark', 'is_default', 'is_archived', 'created_at'];
const LABELS = { release_date: '投产日期', version_type: '版本类型', remark: '备注' };
const PENDING_RELEASE_DATE = '投产点待定';
const DATE_RE = /^\d{8}$/;

/** 取当天 YYYYMMDD */
function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function isReleaseDate(v) {
  return DATE_RE.test(String(v || '').trim());
}

function normalizeReleaseDate(v) {
  const value = String(v || '').trim();
  if (!value) throw badRequest('投产日期必填');
  if (value === PENDING_RELEASE_DATE || isReleaseDate(value)) return value;
  throw badRequest('投产日期需为 YYYYMMDD 或 投产点待定');
}

/** 计算当前投产窗口 */
function resolveCurrent() {
  const def = get('SELECT * FROM release_point WHERE is_default = 1 AND is_archived = 0 LIMIT 1');
  if (def) return def;
  const today = todayStr();
  const list = all('SELECT * FROM release_point WHERE is_archived = 0');
  const dated = list.filter((p) => isReleaseDate(p.release_date));
  const future = dated.filter((p) => p.release_date >= today)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));
  if (future.length) return future[0];
  const past = dated.sort((a, b) => b.release_date.localeCompare(a.release_date));
  if (past.length) return past[0];
  return list.sort((a, b) => (b.id || 0) - (a.id || 0))[0] || null;
}

export default async function releasePointRoutes(fastify) {
  // 列表
  fastify.post('/release-points/list', { preHandler: fastify.requirePerm('settings', 'view') }, async (request) => {
    const body = request.body || {};
    const wh = [];
    const params = [];
    const filters = Array.isArray(body.filters) ? body.filters : [];
    const normalFilters = [];

    for (const f of filters) {
      if (!f || f.value === undefined || f.value === null || f.value === '') continue;
      
      if (f.field === 'release_date') {
        const dates = Array.isArray(f.value) ? f.value : [f.value];
        if (dates.length) {
          wh.push(`release_date IN (${dates.map(() => '?').join(',')})`);
          params.push(...dates);
        }
      } else if (f.field === 'version_type_query') {
        wh.push('(version_type LIKE ? OR remark LIKE ?)');
        params.push(`%${f.value}%`, `%${f.value}%`);
      } else {
        normalFilters.push(f);
      }
    }

    const newBody = { ...body, filters: normalFilters };
    if (!Array.isArray(newBody.sort) || newBody.sort.length === 0) {
      newBody.sort = [{ field: 'release_date', order: 'asc' }];
    }
    const baseWhere = wh.join(' AND ');

    return ok(listQuery({
      table: 'release_point', columns: COLUMNS,
      searchColumns: ['release_date', 'version_type', 'remark'],
      query: newBody,
      baseWhere,
      baseParams: params,
    }));
  });

  // 全部（供顶栏选择器，任意登录用户）
  fastify.get('/release-points/all', { preHandler: fastify.authenticate }, async () => {
    const today = todayStr();
    const list = all('SELECT * FROM release_point WHERE is_archived = 0');
    const dated = list.filter((p) => isReleaseDate(p.release_date));
    const pending = list.filter((p) => !isReleaseDate(p.release_date)).sort((a, b) => (b.id || 0) - (a.id || 0));
    const future = dated.filter((p) => p.release_date >= today).sort((a, b) => a.release_date.localeCompare(b.release_date));
    const past = dated.filter((p) => p.release_date < today).sort((a, b) => a.release_date.localeCompare(b.release_date));
    return ok([...future, ...past, ...pending]);
  });

  // 当前投产窗口
  fastify.get('/release-points/current', { preHandler: fastify.authenticate }, async () => {
    return ok(resolveCurrent() || null);
  });

  // 新增
  fastify.post('/release-points', { preHandler: fastify.requirePerm('settings', 'create') }, async (request) => {
    const { release_date, version_type, remark } = request.body || {};
    const dateValue = normalizeReleaseDate(release_date);
    const res = run(
      'INSERT INTO release_point (release_date, version_type, remark) VALUES (?,?,?)',
      dateValue, version_type || null, remark || null,
    );
    auditCreate('release_point', res.lastInsertRowid, dateValue, request.currentUser?.name);
    return ok({ id: res.lastInsertRowid });
  });

  // 修改
  fastify.put('/release-points/:id', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = get('SELECT * FROM release_point WHERE id = ?', id);
    if (!old) throw notFound();
    const { release_date, version_type, remark } = request.body || {};
    const data = {
      release_date: release_date === undefined ? old.release_date : normalizeReleaseDate(release_date),
      version_type: version_type ?? old.version_type,
      remark: remark ?? old.remark,
    };
    run(
      `UPDATE release_point SET release_date=?, version_type=?, remark=?, updated_at=datetime('now','localtime') WHERE id=?`,
      data.release_date, data.version_type, data.remark, id,
    );
    auditUpdate('release_point', id, old.release_date, request.currentUser?.name, old, data, LABELS);
    return ok({ id });
  });

  // 删除
  fastify.delete('/release-points/:id', { preHandler: fastify.requirePerm('settings', 'delete') }, async (request) => {
    const id = request.params.id;
    const row = get('SELECT * FROM release_point WHERE id = ?', id);
    if (!row) throw notFound();
    const used = get('SELECT COUNT(*) AS c FROM requirement WHERE release_point_id = ?', id);
    if (used?.c > 0) throw badRequest('该投产点已被需求引用，无法删除');
    run('DELETE FROM release_point WHERE id = ?', id);
    auditDelete('release_point', id, row.release_date, request.currentUser?.name);
    return ok(null, '删除成功');
  });

  // 设为默认（先清除其它默认，保证唯一）
  fastify.post('/release-points/:id/set-default', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    const id = request.params.id;
    const row = get('SELECT * FROM release_point WHERE id = ?', id);
    if (!row) throw notFound();
    tx(() => {
      run('UPDATE release_point SET is_default = 0 WHERE is_default = 1');
      run('UPDATE release_point SET is_default = 1 WHERE id = ?', id);
    });
    return ok(null, '已设为默认投产点');
  });

  // 取消默认
  fastify.post('/release-points/:id/cancel-default', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    run('UPDATE release_point SET is_default = 0 WHERE id = ?', request.params.id);
    return ok(null, '已取消默认');
  });

  // 导入/导出/模板
  registerIO(fastify, {
    prefix: '/release-points', module: 'settings', name: '投产点',
    columns: [
      { key: 'release_date', title: '投产日期' }, { key: 'version_type', title: '版本类型' },
      { key: 'remark', title: '备注' }, { key: 'is_default', title: '默认' },
    ],
    list: (q) => listQuery({ table: 'release_point', columns: COLUMNS, searchColumns: ['release_date', 'version_type', 'remark'], query: q })
      .list.map((r) => ({ ...r, is_default: r.is_default ? '是' : '' })),
    upsert: (r, mode) => {
      if (!r.release_date) return 'skipped';
      const releaseDate = normalizeReleaseDate(r.release_date);
      const exists = get('SELECT id FROM release_point WHERE release_date = ?', releaseDate);
      if (exists) {
        if (mode === 'skip') return 'skipped';
        if (mode === 'rollback') throw badRequest(`投产日期重复：${releaseDate}，已回滚`);
        run('UPDATE release_point SET version_type=?, remark=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?',
          r.version_type || null, r.remark || null, exists.id);
        return 'updated';
      }
      run('INSERT INTO release_point (release_date, version_type, remark) VALUES (?,?,?)',
        releaseDate, r.version_type || null, r.remark || null);
      return 'inserted';
    },
  });
}

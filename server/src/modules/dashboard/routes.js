/**
 * 文件：modules/dashboard/routes.js
 * 用途：效能仪表盘接口。5 原子指标卡（终态计数）、分析图表数据聚合（多维度组合/分组归并/
 *       局部过滤/透视）、维度元数据、钻取记录列表，以及系统图表/我的图表的增删改查。
 * 作者：hengguan
 * 说明：聚合在内存按维度分桶（见 lib/chart-dims.js）；系统图表(scope=system)由 dashboard:manage
 *       权限维护、对所有人可见；我的图表(scope=user)按用户隔离。
 */

import { get, all, run } from '../../db/index.js';
import { isTerminalStatus } from '../../lib/status.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, badRequest, notFound, forbidden } from '../../lib/http.js';
import {
  SOURCES, DIMENSIONS, CHART_TYPES, buildContext, aggregate, extract, matchFilters, isValidDim, testTypeOf,
} from '../../lib/chart-dims.js';

/** 取所选投产窗口下的需求编号集合；ids 为空返回 null（=全部，不过滤） */
function reqCodesInWindow(ids) {
  if (!ids?.length) return null;
  const sub = inClause('release_point_id', ids);
  return all(`SELECT req_code FROM requirement WHERE ${sub.where}`, ...sub.params).map((r) => r.req_code);
}

/** 计数终态记录 */
function countTerminal(rows) {
  return rows.filter((r) => isTerminalStatus(r.status)).length;
}

/** 载入某数据源的记录，并按投产窗口（req_code 集合）过滤 */
function loadRows(source, codes) {
  let rows;
  switch (source) {
    case 'requirement': rows = all('SELECT * FROM requirement'); break;
    case 'dev': rows = all('SELECT * FROM dev_task'); break;
    case 'sit': case 'uat': case 'nft': case 'sec':
      rows = all('SELECT * FROM test_task WHERE test_type = ?', testTypeOf(source)); break;
    case 'releaseSystem':
      rows = all(`SELECT rs.*, rt.req_code AS req_code FROM release_system rs
                  JOIN release_task rt ON rt.id = rs.release_task_id`); break;
    case 'all': {
      const requirement = loadRows('requirement', null).map((r) => ({ ...r, _source: 'requirement' }));
      const dev = loadRows('dev', null).map((r) => ({ ...r, _source: 'dev' }));
      const sit = loadRows('sit', null).map((r) => ({ ...r, _source: 'sit' }));
      const uat = loadRows('uat', null).map((r) => ({ ...r, _source: 'uat' }));
      const nft = loadRows('nft', null).map((r) => ({ ...r, _source: 'nft' }));
      const sec = loadRows('sec', null).map((r) => ({ ...r, _source: 'sec' }));
      const releaseSystem = loadRows('releaseSystem', null).map((r) => ({ ...r, _source: 'releaseSystem' }));
      rows = [...requirement, ...dev, ...sit, ...uat, ...nft, ...sec, ...releaseSystem];
      break;
    }
    default: throw badRequest('未知数据源');
  }
  if (!codes) return rows;
  if (!codes.length) return [];
  const set = new Set(codes);
  return rows.filter((r) => set.has(r.req_code));
}

/** 钻取：把一条记录投影成列表展示行 */
function projectRecord(source, row, ctx) {
  const realSource = source === 'all' ? row._source : source;
  const sysName = (code) => ctx.sysMap[code]?.name || code;
  const systems = extract(realSource, 'system', row, ctx).map(sysName).join('、');
  if (realSource === 'requirement') {
    const proposerNames = (() => {
      if (!row.proposer) return '';
      try {
        const parsed = JSON.parse(row.proposer);
        return Array.isArray(parsed) ? parsed.join('、') : row.proposer;
      } catch {
        return row.proposer;
      }
    })();
    return { req_code: row.req_code, code: row.req_code, name: row.title, status: row.status, system: systems, org: extract(realSource, 'org', row, ctx).join('、'), owner: proposerNames };
  }
  if (realSource === 'releaseSystem') {
    return { req_code: row.req_code, code: row.system_code, name: sysName(row.system_code), status: row.status, system: systems, org: row.impl_org || '', owner: '' };
  }
  return { req_code: row.req_code, code: row.task_code, name: row.task_name || row.task_code, status: row.status, system: systems, org: row.impl_org || '', owner: row.owner || '' };
}

/** 当前用户是否可管理系统图表 */
function canManageSystem(fastify, request) {
  if (request.currentUser.is_super) return true;
  return fastify.loadUserPermissions(request.currentUser.id).has('dashboard:manage');
}

export default async function dashboardRoutes(fastify) {
  // 5 原子指标卡（每项返回 总数 total 与 终态完成数 terminal）
  fastify.get('/dashboard/metrics', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const winIds = windowIds(request.query);
    const codes = reqCodesInWindow(winIds);
    const inWindow = (table, extraWhere = '') => {
      if (!codes) return all(`SELECT status FROM ${table} ${extraWhere ? 'WHERE ' + extraWhere : ''}`);
      if (!codes.length) return [];
      const ph = codes.map(() => '?').join(',');
      const where = `req_code IN (${ph})${extraWhere ? ' AND ' + extraWhere : ''}`;
      return all(`SELECT status FROM ${table} WHERE ${where}`, ...codes);
    };

    const reqRows = codes
      ? (codes.length ? all(`SELECT status FROM requirement WHERE req_code IN (${codes.map(() => '?').join(',')})`, ...codes) : [])
      : all('SELECT status FROM requirement');

    // 投产申请（变更单）：按所选投产点过滤（窗口为空=全部）
    let applyRows;
    if (!winIds?.length) {
      applyRows = all('SELECT ref_codes, delivery_units FROM release_apply');
    } else {
      const sub = inClause('release_point_id', winIds);
      applyRows = all(`SELECT ref_codes, delivery_units FROM release_apply WHERE ${sub.where}`, ...sub.params);
    }

    // 投产系统：对应投产点提交了投产申请的变更单数；完成=全部交付单元已摆渡
    const releaseSystem = {
      total: applyRows.length,
      terminal: applyRows.filter((r) => {
        let units = [];
        try { units = r.delivery_units ? JSON.parse(r.delivery_units) : []; } catch { units = []; }
        return units.length > 0 && units.every((u) => u.ferry_status === '已摆渡');
      }).length,
    };

    // 投产问题：上述变更单关联的「问题」数（去重）；完成=问题状态终态（已解决/待验证）
    const refSet = new Set();
    for (const r of applyRows) {
      let refs = [];
      try { refs = r.ref_codes ? JSON.parse(r.ref_codes) : []; } catch { refs = []; }
      for (const c of refs) if (c) refSet.add(c);
    }
    let issueRows = [];
    if (refSet.size) {
      const arr = [...refSet];
      issueRows = all(`SELECT status FROM issue WHERE issue_code IN (${arr.map(() => '?').join(',')})`, ...arr);
    }
    const ISSUE_TERMINAL = new Set(['已解决', '待验证']);
    const issue = { total: issueRows.length, terminal: issueRows.filter((r) => ISSUE_TERMINAL.has(r.status)).length };

    const dev = inWindow('dev_task');
    const sit = inWindow('test_task', "test_type='SIT'");
    const uat = inWindow('test_task', "test_type='UAT'");

    return ok({
      requirement: { total: reqRows.length, terminal: countTerminal(reqRows) },
      issue,
      dev: { total: dev.length, terminal: countTerminal(dev) },
      sit: { total: sit.length, terminal: countTerminal(sit) },
      uat: { total: uat.length, terminal: countTerminal(uat) },
      releaseSystem,
    });
  });

  // 维度元数据：某数据源可用的维度、图表类型、各数据源清单
  // 不带 source 时一次性返回所有数据源的维度（dimsBySource），供前端一个请求预载全部元数据，
  // 免去逐源 7 次往返（公网下尤为关键）。
  fastify.get('/dashboard/dimensions', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const source = request.query.source;
    const sources = Object.entries(SOURCES).map(([value, v]) => ({ value, label: v.label }));
    const chartTypes = CHART_TYPES;
    const dimsOf = (src) => SOURCES[src].dims.map((key) => ({ key, ...DIMENSIONS[key] }));
    if (!source || !SOURCES[source]) {
      const dimsBySource = {};
      for (const src of Object.keys(SOURCES)) dimsBySource[src] = dimsOf(src);
      return ok({ sources, chartTypes, dimensions: [], dimsBySource });
    }
    return ok({ sources, chartTypes, dimensions: dimsOf(source) });
  });

  // 分析图表数据聚合（1D/2D + 过滤 + 分组归并）
  fastify.post('/dashboard/chart-data', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const { source = 'requirement', dimension, xAxisDimension, filters, groups, xAxisGroups } = request.body || {};
    if (!SOURCES[source]) throw badRequest('未知数据源');
    if (!isValidDim(source, dimension)) throw badRequest('非法的统计维度');
    const xDim = xAxisDimension && isValidDim(source, xAxisDimension) ? xAxisDimension : undefined;

    const codes = reqCodesInWindow(windowIds(request.body));
    const ctx = buildContext();
    const rows = loadRows(source, codes);
    const data = aggregate({ source, dimension, xAxisDimension: xDim, filters, groups, xAxisGroups, rows, ctx });
    return ok({ data });
  });

  // 批量聚合：一次请求算出多张图表，按数据源仅载入一次、上下文仅构造一次，
  // 取代「每张图表各发一次请求 + 各自整表扫描」的放大开销（仪表盘打开瞬时返回）。
  fastify.post('/dashboard/chart-data-batch', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const { charts = [] } = request.body || {};
    const codes = reqCodesInWindow(windowIds(request.body));
    const ctx = buildContext();
    const rowsCache = new Map(); // source → 该窗口下的记录集（同源复用）
    const loadOnce = (source) => {
      if (!rowsCache.has(source)) rowsCache.set(source, loadRows(source, codes));
      return rowsCache.get(source);
    };

    const result = {};
    for (const ch of charts) {
      const cfg = ch?.config || {};
      const source = cfg.source || 'requirement';
      // 非法配置返回空数据而非整体失败，保证其余图表正常
      if (!SOURCES[source] || !isValidDim(source, cfg.dimension)) { result[ch.id] = []; continue; }
      const xDim = cfg.xAxisDimension && isValidDim(source, cfg.xAxisDimension) ? cfg.xAxisDimension : undefined;
      try {
        result[ch.id] = aggregate({
          source, dimension: cfg.dimension, xAxisDimension: xDim,
          filters: cfg.filters, groups: cfg.groups, xAxisGroups: cfg.xAxisGroups,
          rows: loadOnce(source), ctx,
        });
      } catch { result[ch.id] = []; }
    }
    return ok({ data: result });
  });

  // 钻取：返回与图元对应的底层记录列表
  fastify.post('/dashboard/chart-drilldown', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const { source = 'requirement', filters } = request.body || {};
    if (!SOURCES[source]) throw badRequest('未知数据源');
    const codes = reqCodesInWindow(windowIds(request.body));
    const ctx = buildContext();
    const rows = loadRows(source, codes);
    // 复用聚合的过滤规则筛出明细
    const data = rows
      .filter((r) => matchFilters(source, r, filters, ctx))
      .map((r) => projectRecord(source, r, ctx));
    return ok({ data });
  });

  // 我的图表 + 系统图表：列表
  fastify.get('/dashboard/charts', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const rows = all(
      `SELECT * FROM dashboard_chart
        WHERE scope = 'system' OR (scope = 'user' AND user_id = ?)
        ORDER BY scope DESC, sort, id`,
      request.currentUser.id,
    );
    return ok(rows);
  });

  // 新增图表
  fastify.post('/dashboard/charts', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const { title, chart_type, config, sort, scope = 'user', col_span = 12, height = 320 } = request.body || {};
    if (!title || !chart_type) throw badRequest('标题与图表类型必填');
    if (scope === 'system' && !canManageSystem(fastify, request)) throw forbidden('无管理系统图表权限');
    const res = run(
      'INSERT INTO dashboard_chart (user_id, title, chart_type, config, sort, scope, col_span, height) VALUES (?,?,?,?,?,?,?,?)',
      request.currentUser.id, title, chart_type, JSON.stringify(config || {}), sort || 0, scope, col_span, height,
    );
    return ok({ id: res.lastInsertRowid });
  });

  // 修改图表
  fastify.put('/dashboard/charts/:id', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const row = get('SELECT * FROM dashboard_chart WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    // 系统图表需 manage；个人图表仅本人
    if (row.scope === 'system') {
      if (!canManageSystem(fastify, request)) throw forbidden('无管理系统图表权限');
    } else if (row.user_id !== request.currentUser.id) {
      throw forbidden('只能修改自己的图表');
    }
    const { title, chart_type, config, sort, col_span, height } = request.body || {};
    run(
      `UPDATE dashboard_chart SET title=?, chart_type=?, config=?, sort=?, col_span=?, height=?, updated_at=datetime('now','localtime') WHERE id=?`,
      title ?? row.title, chart_type ?? row.chart_type,
      config !== undefined ? JSON.stringify(config) : row.config,
      sort ?? row.sort, col_span ?? row.col_span, height ?? row.height, row.id,
    );
    return ok({ id: row.id });
  });

  // 删除图表
  fastify.delete('/dashboard/charts/:id', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const row = get('SELECT * FROM dashboard_chart WHERE id = ?', request.params.id);
    if (!row) return ok(null, '已删除');
    if (row.scope === 'system') {
      if (!canManageSystem(fastify, request)) throw forbidden('无管理系统图表权限');
    } else if (row.user_id !== request.currentUser.id) {
      throw forbidden('只能删除自己的图表');
    }
    run('DELETE FROM dashboard_chart WHERE id = ?', row.id);
    return ok(null, '已删除');
  });
}

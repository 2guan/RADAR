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
  SOURCES, DIMENSIONS, CHART_TYPES, ANALYTICS_DIMENSIONS, ANALYTICS_STAGES,
  buildContext, aggregate, extract, matchFilters, isValidDim, testTypeOf,
} from '../../lib/chart-dims.js';
import { parseJsonArray } from '../../lib/json.js';

/** 取所选投产窗口下的需求/工单编号集合；ids 为空返回 null（=全部，不过滤） */
async function workItemCodesInWindow(ids) {
  if (!ids?.length) return null;
  const sub = inClause('release_point_id', ids);
  return [
    ...(await all(`SELECT req_code AS code FROM requirement WHERE ${sub.where}`, ...sub.params)).map((r) => r.code),
    ...(await all(`SELECT ticket_code AS code FROM ticket WHERE ${sub.where}`, ...sub.params)).map((r) => r.code),
  ];
}

/** 计数终态记录 */
function countTerminal(rows) {
  return rows.filter((r) => isTerminalStatus(r.status)).length;
}

/** 载入某数据源的记录，并按投产窗口（req_code 集合）过滤 */
async function loadRows(source, codes) {
  let rows;
  switch (source) {
    case 'requirement': rows = await all('SELECT * FROM requirement'); break;
    case 'ticket': rows = await all('SELECT *, ticket_code AS req_code FROM ticket'); break;
    case 'dev': rows = await all('SELECT * FROM dev_task'); break;
    case 'sit': case 'uat': case 'nft': case 'sec':
      rows = await all('SELECT * FROM test_task WHERE test_type = ?', testTypeOf(source)); break;
    case 'releaseSystem':
      rows = await all(`SELECT rs.*, rt.req_code AS req_code FROM release_system rs
                  JOIN release_task rt ON rt.id = rs.release_task_id`); break;
    case 'all': {
      const requirement = (await loadRows('requirement', null)).map((r) => ({ ...r, _source: 'requirement' }));
      const ticket = (await loadRows('ticket', null)).map((r) => ({ ...r, _source: 'ticket' }));
      const dev = (await loadRows('dev', null)).map((r) => ({ ...r, _source: 'dev' }));
      const sit = (await loadRows('sit', null)).map((r) => ({ ...r, _source: 'sit' }));
      const uat = (await loadRows('uat', null)).map((r) => ({ ...r, _source: 'uat' }));
      const nft = (await loadRows('nft', null)).map((r) => ({ ...r, _source: 'nft' }));
      const sec = (await loadRows('sec', null)).map((r) => ({ ...r, _source: 'sec' }));
      const releaseSystem = (await loadRows('releaseSystem', null)).map((r) => ({ ...r, _source: 'releaseSystem' }));
      rows = [...requirement, ...ticket, ...dev, ...sit, ...uat, ...nft, ...sec, ...releaseSystem];
      break;
    }
    default: throw badRequest('未知数据源');
  }
  if (!codes) return rows;
  if (!codes.length) return [];
  const set = new Set(codes);
  return rows.filter((r) => set.has(r.req_code || r.ticket_code));
}

/**
 * 新效能仪表盘：以需求/工单为关联主线，根据“统计维度 × 统计阶段”取数。
 * 每条阶段记录都携带所属工作项，保证计划/申请投产点、提出部门、需求类型等维度在所有阶段可用。
 */
async function loadAnalyticsRows(statDimension = 'requirement', statStage = 'all', codes, ctx) {
  const codeSet = codes ? new Set(codes) : null;
  const inWindow = (row) => !codeSet || codeSet.has(row.req_code || row.ticket_code);
  const requirements = (await all('SELECT * FROM requirement')).map((r) => ({ ...r, _entityType: 'requirement' }));
  const tickets = (await all('SELECT *, ticket_code AS req_code FROM ticket')).map((r) => ({ ...r, _entityType: 'ticket' }));
  const items = [...requirements, ...tickets].filter(inWindow);
  const itemMap = Object.fromEntries(items.map((r) => [r.req_code, r]));
  const keepType = (item) => item && (statDimension === 'all' || item._entityType === statDimension);
  const withItem = (row, stage) => {
    const item = itemMap[row.req_code];
    return keepType(item) ? { ...row, _workItem: item, _entityType: item._entityType, _analyticsStage: stage } : null;
  };
  const analysis = items.filter((r) => keepType(r)).map((r) => ({ ...r, _workItem: r, _analyticsStage: 'analysis' }));
  const dev = (await all('SELECT * FROM dev_task')).filter(inWindow).map((r) => withItem(r, 'dev')).filter(Boolean);
  const tests = await all('SELECT * FROM test_task');
  const stageRows = {
    analysis,
    dev,
    sit: tests.filter((r) => r.test_type === 'SIT' && inWindow(r)).map((r) => withItem(r, 'sit')).filter(Boolean),
    uat: tests.filter((r) => r.test_type === 'UAT' && inWindow(r)).map((r) => withItem(r, 'uat')).filter(Boolean),
    nft: tests.filter((r) => r.test_type === 'NFT' && inWindow(r)).map((r) => withItem(r, 'nft')).filter(Boolean),
    sec: tests.filter((r) => r.test_type === 'SEC' && inWindow(r)).map((r) => withItem(r, 'sec')).filter(Boolean),
    release: (await all('SELECT * FROM release_task')).filter(inWindow).map((r) => withItem(r, 'release')).filter(Boolean),
  };
  // “全部”是全量需求/工单的统计口径，不应将同一工作项在开发、测试、审批阶段重复累加。
  // 阶段明细仅在用户明确选择某一统计阶段时作为该阶段的数据集。
  if (statStage === 'all') return analysis;
  return stageRows[statStage] || [];
}

function normalizeAnalyticsConfig(cfg = {}) {
  // 新图表使用统一口径；历史图表继续走原数据源，首次编辑/保存后才转换，避免已有看板失效。
  if (cfg.source === 'analytics') return {
    statDimension: cfg.statDimension || 'requirement', statStage: cfg.statStage || 'all', source: 'analytics',
  };
  if (cfg.statDimension || cfg.statStage) {
    const legacy = {
    requirement: ['requirement', 'analysis'], ticket: ['ticket', 'analysis'], dev: ['all', 'dev'],
    sit: ['all', 'sit'], uat: ['all', 'uat'], nft: ['all', 'nft'], sec: ['all', 'sec'], releaseSystem: ['all', 'release'],
    all: ['all', 'all'],
    }[cfg.source] || ['all', 'all'];
    return { statDimension: cfg.statDimension || legacy[0], statStage: cfg.statStage || legacy[1], source: 'analytics' };
  }
  return null;
}

/** 钻取：把一条记录投影成列表展示行 */
function projectRecord(source, row, ctx) {
  const realSource = source === 'all' ? row._source : source;
  const sysName = (code) => ctx.sysMap[code]?.name || code;
  const systems = extract(realSource, 'system', row, ctx).map(sysName).join('、');
  if (realSource === 'analytics') {
    const item = row._workItem || row;
    const code = item.req_code || item.ticket_code;
    return {
      req_code: code, code: row.task_code || code, name: row.task_name || item.title || code,
      status: row.status || item.status, system: systems,
      org: extract(realSource, 'org', row, ctx).join('、'), owner: row.owner || '',
    };
  }
  if (realSource === 'requirement' || realSource === 'ticket') {
    const proposerNames = parseJsonArray(row.proposer).join('、');
    const code = realSource === 'ticket' ? row.ticket_code : row.req_code;
    return { req_code: code, code, name: row.title, status: row.status, system: systems, org: extract(realSource, 'org', row, ctx).join('、'), owner: proposerNames };
  }
  if (realSource === 'releaseSystem') {
    return { req_code: row.req_code, code: row.system_code, name: sysName(row.system_code), status: row.status, system: systems, org: row.impl_org || '', owner: '' };
  }
  return { req_code: row.req_code, code: row.task_code, name: row.task_name || row.task_code, status: row.status, system: systems, org: row.impl_org || '', owner: row.owner || '' };
}

/** 当前用户是否可管理系统图表 */
async function canManageSystem(fastify, request) {
  if (request.currentUser.is_super) return true;
  const permissions = await fastify.loadUserPermissions(request.currentUser.id);
  return permissions.has('dashboard:manage');
}

export default async function dashboardRoutes(fastify) {
  // 原子指标卡（每项返回 总数 total 与 终态计数 terminal）
  fastify.get('/dashboard/metrics', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const winIds = windowIds(request.query);
    const codes = await workItemCodesInWindow(winIds);
    const inWindow = async (table, extraWhere = '') => {
      if (!codes) return await all(`SELECT status FROM ${table} ${extraWhere ? 'WHERE ' + extraWhere : ''}`);
      if (!codes.length) return [];
      const ph = codes.map(() => '?').join(',');
      const where = `req_code IN (${ph})${extraWhere ? ' AND ' + extraWhere : ''}`;
      return await all(`SELECT status FROM ${table} WHERE ${where}`, ...codes);
    };

    const reqRows = codes
      ? (codes.length ? await all(`SELECT status FROM requirement WHERE req_code IN (${codes.map(() => '?').join(',')})`, ...codes) : [])
      : await all('SELECT status FROM requirement');

    const ticketRows = codes
      ? (codes.length ? await all(`SELECT status FROM ticket WHERE ticket_code IN (${codes.map(() => '?').join(',')})`, ...codes) : [])
      : await all('SELECT status FROM ticket');

    // 投产申请（变更单）：按所选投产点过滤（窗口为空=全部）
    let applyRows;
    if (!winIds?.length) {
      applyRows = await all('SELECT ref_codes, delivery_units FROM release_apply');
    } else {
      const sub = inClause('release_point_id', winIds);
      applyRows = await all(`SELECT ref_codes, delivery_units FROM release_apply WHERE ${sub.where}`, ...sub.params);
    }

    // 投产系统：对应投产点提交了投产申请的变更单数；完成=全部交付单元已摆渡
    const releaseSystem = {
      total: applyRows.length,
      terminal: applyRows.filter((r) => {
        const units = parseJsonArray(r.delivery_units);
        return units.length > 0 && units.every((u) => u.ferry_status === '已摆渡');
      }).length,
    };

    const dev = await inWindow('dev_task');
    const sit = await inWindow('test_task', "test_type='SIT'");
    const uat = await inWindow('test_task', "test_type='UAT'");

    return ok({
      requirement: { total: reqRows.length, terminal: countTerminal(reqRows) },
      ticket: { total: ticketRows.length, terminal: countTerminal(ticketRows) },
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
    const sources = [{ value: 'analytics', label: '效能统计' }];
    const chartTypes = CHART_TYPES;
    const dimsOf = (src) => SOURCES[src].dims.map((key) => ({ key, ...DIMENSIONS[key] }));
    if (!source || !SOURCES[source]) {
      const dimsBySource = {};
      dimsBySource.analytics = dimsOf('analytics');
      return ok({ sources, chartTypes, dimensions: [], dimsBySource, statDimensions: ANALYTICS_DIMENSIONS, statStages: ANALYTICS_STAGES });
    }
    return ok({ sources, chartTypes, dimensions: dimsOf(source), statDimensions: ANALYTICS_DIMENSIONS, statStages: ANALYTICS_STAGES });
  });

  // 分析图表数据聚合（1D/2D + 过滤 + 分组归并）
  fastify.post('/dashboard/chart-data', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const cfg = request.body || {};
    const analytics = normalizeAnalyticsConfig(cfg);
    const { dimension, xAxisDimension, filters, groups, xAxisGroups } = cfg;
    const source = analytics?.source || cfg.source;
    if (!SOURCES[source]) throw badRequest('未知数据源');
    if (!isValidDim(source, dimension)) throw badRequest('非法的统计维度');
    const xDim = xAxisDimension && isValidDim(source, xAxisDimension) ? xAxisDimension : undefined;

    const codes = await workItemCodesInWindow(windowIds(request.body));
    const ctx = await buildContext();
    const rows = source === 'analytics'
      ? await loadAnalyticsRows(analytics.statDimension, analytics.statStage, codes, ctx)
      : await loadRows(source, codes);
    const data = aggregate({ source, dimension, xAxisDimension: xDim, filters, groups, xAxisGroups, rows, ctx });
    return ok({ data });
  });

  // 批量聚合：一次请求算出多张图表，按数据源仅载入一次、上下文仅构造一次，
  // 取代「每张图表各发一次请求 + 各自整表扫描」的放大开销（仪表盘打开瞬时返回）。
  fastify.post('/dashboard/chart-data-batch', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const { charts = [] } = request.body || {};
    const codes = await workItemCodesInWindow(windowIds(request.body));
    const ctx = await buildContext();
    const rowsCache = new Map(); // source → 该窗口下的记录集（同源复用）
    const loadOnce = async (source) => {
      if (!rowsCache.has(source)) rowsCache.set(source, await loadRows(source, codes));
      return rowsCache.get(source);
    };

    const result = {};
    for (const ch of charts) {
      const cfg = ch?.config || {};
      const analytics = normalizeAnalyticsConfig(cfg);
      const source = analytics?.source || cfg.source || 'analytics';
      // 非法配置返回空数据而非整体失败，保证其余图表正常
      if (!SOURCES[source] || !isValidDim(source, cfg.dimension)) { result[ch.id] = []; continue; }
      const xDim = cfg.xAxisDimension && isValidDim(source, cfg.xAxisDimension) ? cfg.xAxisDimension : undefined;
      try {
        result[ch.id] = aggregate({
          source, dimension: cfg.dimension, xAxisDimension: xDim,
          filters: cfg.filters, groups: cfg.groups, xAxisGroups: cfg.xAxisGroups,
          rows: source === 'analytics'
            ? await loadAnalyticsRows(analytics.statDimension, analytics.statStage, codes, ctx)
            : await loadOnce(source), ctx,
        });
      } catch { result[ch.id] = []; }
    }
    return ok({ data: result });
  });

  // 钻取：返回与图元对应的底层记录列表
  fastify.post('/dashboard/chart-drilldown', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const cfg = request.body || {};
    const analytics = normalizeAnalyticsConfig(cfg);
    const { filters } = cfg;
    const source = analytics?.source || cfg.source || 'analytics';
    if (!SOURCES[source]) throw badRequest('未知数据源');
    const codes = await workItemCodesInWindow(windowIds(request.body));
    const ctx = await buildContext();
    const rows = source === 'analytics'
      ? await loadAnalyticsRows(analytics.statDimension, analytics.statStage, codes, ctx)
      : await loadRows(source, codes);
    // 复用聚合的过滤规则筛出明细
    const data = rows
      .filter((r) => matchFilters(source, r, filters, ctx))
      .map((r) => projectRecord(source, r, ctx));
    return ok({ data });
  });

  // 我的图表 + 系统图表：列表
  fastify.get('/dashboard/charts', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const rows = await all(
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
    if (scope === 'system' && !(await canManageSystem(fastify, request))) throw forbidden('无管理系统图表权限');
    const res = await run(
      'INSERT INTO dashboard_chart (user_id, title, chart_type, config, sort, scope, col_span, height) VALUES (?,?,?,?,?,?,?,?)',
      request.currentUser.id, title, chart_type, JSON.stringify(config || {}), sort || 0, scope, col_span, height,
    );
    return ok({ id: res.lastInsertRowid });
  });

  // 修改图表
  fastify.put('/dashboard/charts/:id', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const row = await get('SELECT * FROM dashboard_chart WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    // 系统图表需 manage；个人图表仅本人
    if (row.scope === 'system') {
      if (!(await canManageSystem(fastify, request))) throw forbidden('无管理系统图表权限');
    } else if (row.user_id !== request.currentUser.id) {
      throw forbidden('只能修改自己的图表');
    }
    const { title, chart_type, config, sort, col_span, height } = request.body || {};
    await run(
      `UPDATE dashboard_chart SET title=?, chart_type=?, config=?, sort=?, col_span=?, height=?, updated_at=datetime('now','localtime') WHERE id=?`,
      title ?? row.title, chart_type ?? row.chart_type,
      config !== undefined ? JSON.stringify(config) : row.config,
      sort ?? row.sort, col_span ?? row.col_span, height ?? row.height, row.id,
    );
    return ok({ id: row.id });
  });

  // 删除图表
  fastify.delete('/dashboard/charts/:id', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const row = await get('SELECT * FROM dashboard_chart WHERE id = ?', request.params.id);
    if (!row) return ok(null, '已删除');
    if (row.scope === 'system') {
      if (!(await canManageSystem(fastify, request))) throw forbidden('无管理系统图表权限');
    } else if (row.user_id !== request.currentUser.id) {
      throw forbidden('只能删除自己的图表');
    }
    await run('DELETE FROM dashboard_chart WHERE id = ?', row.id);
    return ok(null, '已删除');
  });
}

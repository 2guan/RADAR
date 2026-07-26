/**
 * 文件：modules/dashboard/routes.js
 * 说明：聚合在内存按维度分桶（见 reporting/application/chart-dims.js）；系统图表(scope=system)由 dashboard:manage
 *       权限维护、对所有人可见；我的图表(scope=user)按用户隔离。
 * 用途：效能仪表盘接口。5 原子指标卡（终态计数）、分析图表数据聚合（多维度组合/分组归并/
 *       局部过滤/透视）、维度元数据、钻取记录列表，以及系统图表/我的图表的增删改查。
 * 作者：hengguan
 */

import { get, all, run, dialect } from '../../platform/persistence/index.js';
import { isTerminalStatus } from '../process-configuration/index.js';
import { windowIds, inClause } from '../reference-data/index.js';
import { ok, badRequest, notFound, forbidden } from '../../platform/runtime/index.js';
import {
  SOURCES, DIMENSIONS, CHART_TYPES, ANALYTICS_DIMENSIONS, ANALYTICS_STAGES,
  buildContext, aggregate, extract, matchFilters, isValidDim, testTypeOf,
} from '../reporting/index.js';
import { parseJsonArray } from '../../platform/runtime/index.js';

const DYNAMIC_STAGE_SCOPE = {
  analysis: { requirement: 'requirement', ticket: 'ticket' }, dev: 'dev', sit: 'test.SIT',
  uat: 'test.UAT', nft: 'test.NFT', sec: 'test.SEC', release: 'release',
};

/** 仅公开管理员勾选为仪表盘维度的扩展字段；键使用稳定 ID，页面只展示字段名称。 */
async function dynamicDashboardDimensions() {
  const rows = await all(`SELECT id, scope_key, label, input_type, source_key, multiple
    FROM stage_field_definition
    WHERE field_kind = 'extension' AND dashboard_dimension = 1 AND visible = 1 AND deleted_at IS NULL
    ORDER BY scope_key, sort, id`);
  return rows.map((row) => ({
    key: `extension:${row.scope_key}:${row.id}`,
    label: row.label,
    optionSource: row.source_key || 'free',
    isDate: ['date', 'datetime'].includes(row.input_type),
    scopeKey: row.scope_key,
    multiple: !!row.multiple,
  }));
}

function allowedDynamicScopes(analytics) {
  if (!analytics || analytics.statStage === 'all') return [];
  if (analytics.statStage === 'analysis') {
    return analytics.statDimension === 'all' ? ['requirement', 'ticket'] : [analytics.statDimension];
  }
  return DYNAMIC_STAGE_SCOPE[analytics.statStage] ? [DYNAMIC_STAGE_SCOPE[analytics.statStage]] : [];
}

function isChartDimensionAllowed(source, dimension, analytics, dynamicDimensions) {
  if (isValidDim(source, dimension) && !String(dimension).startsWith('extension:')) return true;
  if (source !== 'analytics') return false;
  const definition = dynamicDimensions.find((item) => item.key === dimension);
  return !!definition && allowedDynamicScopes(analytics).includes(definition.scopeKey);
}

/** 取所选投产窗口下的需求/工单编号集合；ids 为空返回 null（=全部，不过滤） */
async function workItemCodesInWindow(ids) {
  if (!ids?.length) return null;
  const sub = inClause('release_point_id', ids);
  return [
    ...(await all(`SELECT req_code AS code FROM requirement WHERE ${sub.where}`, ...sub.params)).map((r) => r.code),
    ...(await all(`SELECT ticket_code AS code FROM ticket WHERE ${sub.where}`, ...sub.params)).map((r) => r.code),
  ];
}

/** 将 SQL 的状态分组结果转换为总量与终态量，避免为指标卡传输全量状态行。 */
function summarizeStatusRows(rows) {
  return rows.reduce((summary, row) => {
    const count = Number(row.count || 0);
    summary.total += count;
    if (isTerminalStatus(row.status)) summary.terminal += count;
    return summary;
  }, { total: 0, terminal: 0 });
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
    return keepType(item) ? { ...row, _workItem: item, _entityType: item._entityType, _analyticsStage: stage, _stageScope: DYNAMIC_STAGE_SCOPE[stage] } : null;
  };
  const analysis = items.filter((r) => keepType(r)).map((r) => ({ ...r, _workItem: r, _analyticsStage: 'analysis', _stageScope: DYNAMIC_STAGE_SCOPE.analysis[r._entityType] }));
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
    const primarySystems = extract(realSource, 'system', { ...row, impl_system: null }, ctx).map(sysName).join('、');
    const latestTaskStatus = extract(realSource, 'current_task_status', row, ctx)[0];
    return {
      req_code: code, code, name: item.title || code,
      status: latestTaskStatus || row.status || item.status, system: primarySystems,
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
    const groupedStatus = async (table, where = '', params = []) => await all(
      `SELECT status, COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ''} GROUP BY status`,
      ...params,
    );
    const pointFilter = (column) => {
      if (!winIds?.length) return { where: '', params: [] };
      return { where: `${column} IN (${winIds.map(() => '?').join(',')})`, params: winIds };
    };
    const taskWindowFilter = (taskAlias, testType = null) => {
      const params = [];
      const pieces = [];
      if (testType) { pieces.push(`${taskAlias}.test_type = ?`); params.push(testType); }
      if (winIds?.length) {
        const placeholders = winIds.map(() => '?').join(',');
        pieces.push(`(
          EXISTS (SELECT 1 FROM requirement r WHERE r.req_code = ${taskAlias}.req_code AND r.release_point_id IN (${placeholders}))
          OR EXISTS (SELECT 1 FROM ticket t WHERE t.ticket_code = ${taskAlias}.req_code AND t.release_point_id IN (${placeholders}))
        )`);
        params.push(...winIds, ...winIds);
      }
      return { where: pieces.join(' AND '), params };
    };

    const reqFilter = pointFilter('release_point_id');
    const ticketFilter = pointFilter('release_point_id');
    const devFilter = taskWindowFilter('dev_task');
    const sitFilter = taskWindowFilter('test_task', 'SIT');
    const uatFilter = taskWindowFilter('test_task', 'UAT');

    // 投产申请（变更单）：按所选投产点过滤（窗口为空=全部）
    let applyRows;
    if (!winIds?.length) {
      applyRows = await all('SELECT delivery_units FROM release_apply');
    } else {
      const sub = inClause('release_point_id', winIds);
      applyRows = await all(`SELECT delivery_units FROM release_apply WHERE ${sub.where}`, ...sub.params);
    }

    // 投产系统：对应投产点提交了投产申请的变更单数；完成=全部交付单元已摆渡
    const releaseSystem = {
      total: applyRows.length,
      terminal: applyRows.filter((r) => {
        const units = parseJsonArray(r.delivery_units);
        return units.length > 0 && units.every((u) => u.ferry_status === '已摆渡');
      }).length,
    };

    const [reqRows, ticketRows, devRows, sitRows, uatRows] = await Promise.all([
      groupedStatus('requirement', reqFilter.where, reqFilter.params),
      groupedStatus('ticket', ticketFilter.where, ticketFilter.params),
      groupedStatus('dev_task', devFilter.where, devFilter.params),
      groupedStatus('test_task', sitFilter.where, sitFilter.params),
      groupedStatus('test_task', uatFilter.where, uatFilter.params),
    ]);

    return ok({
      requirement: summarizeStatusRows(reqRows),
      ticket: summarizeStatusRows(ticketRows),
      dev: summarizeStatusRows(devRows),
      sit: summarizeStatusRows(sitRows),
      uat: summarizeStatusRows(uatRows),
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
    const dynamicDims = await dynamicDashboardDimensions();
    const dimsOf = (src) => [...SOURCES[src].dims.map((key) => ({ key, ...DIMENSIONS[key] })), ...(src === 'analytics' ? dynamicDims : [])];
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
    const dynamicDims = await dynamicDashboardDimensions();
    if (!isChartDimensionAllowed(source, dimension, analytics, dynamicDims)) throw badRequest('非法的统计维度');
    const xDim = xAxisDimension && isChartDimensionAllowed(source, xAxisDimension, analytics, dynamicDims) ? xAxisDimension : undefined;

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
      if (!rowsCache.has(source)) rowsCache.set(source, loadRows(source, codes));
      return rowsCache.get(source);
    };
    const dynamicDims = await dynamicDashboardDimensions();
    const analyticsRowsCache = new Map(); // 统计口径 → Promise<记录集>，同口径图表只扫描一次
    const loadAnalyticsOnce = (analytics) => {
      const key = `${analytics.statDimension}::${analytics.statStage}`;
      if (!analyticsRowsCache.has(key)) {
        analyticsRowsCache.set(key, loadAnalyticsRows(analytics.statDimension, analytics.statStage, codes, ctx));
      }
      return analyticsRowsCache.get(key);
    };

    const result = {};
    for (const ch of charts) {
      const cfg = ch?.config || {};
      const analytics = normalizeAnalyticsConfig(cfg);
      const source = analytics?.source || cfg.source || 'analytics';
      // 非法配置返回空数据而非整体失败，保证其余图表正常
      if (!SOURCES[source] || !isChartDimensionAllowed(source, cfg.dimension, analytics, dynamicDims)) { result[ch.id] = []; continue; }
      const xDim = cfg.xAxisDimension && isChartDimensionAllowed(source, cfg.xAxisDimension, analytics, dynamicDims) ? cfg.xAxisDimension : undefined;
      try {
        result[ch.id] = aggregate({
          source, dimension: cfg.dimension, xAxisDimension: xDim,
          filters: cfg.filters, groups: cfg.groups, xAxisGroups: cfg.xAxisGroups,
          rows: source === 'analytics'
            ? await loadAnalyticsOnce(analytics)
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
    // 仅更新请求实际携带的字段。左右移动只提交 sort，避免在 TDSQL 上重复回写 JSON 配置
    // 时触发驱动对 JSON 返回值类型的兼容问题。
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push('title=?'); params.push(title); }
    if (chart_type !== undefined) { updates.push('chart_type=?'); params.push(chart_type); }
    if (config !== undefined) { updates.push('config=?'); params.push(JSON.stringify(config)); }
    if (sort !== undefined) { updates.push('sort=?'); params.push(sort); }
    if (col_span !== undefined) { updates.push('col_span=?'); params.push(col_span); }
    if (height !== undefined) { updates.push('height=?'); params.push(height); }
    updates.push(`updated_at=${dialect.now}`);
    params.push(row.id);
    await run(`UPDATE dashboard_chart SET ${updates.join(', ')} WHERE id=?`, ...params);
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

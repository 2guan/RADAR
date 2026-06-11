/**
 * 文件：modules/dashboard/routes.js
 * 用途：效能仪表盘接口。顶置 5 原子指标卡（终态计数）、自定义图表数据聚合
 *       （按机构/板块/系统/各阶段状态等维度分组）、用户自定义图表的增删改查。
 * 作者：hengguan
 * 说明：聚合在内存中按维度分桶，数组型维度（系统）按元素展开计数。
 */

import { get, all, run } from '../../db/index.js';
import { isTerminalStatus } from '../../lib/status.js';
import { windowIds, inClause } from '../../lib/window.js';
import { ok, badRequest, notFound } from '../../lib/http.js';

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

export default async function dashboardRoutes(fastify) {
  // 5 原子指标卡（每项返回 总数 total 与 终态完成数 terminal）
  fastify.get('/dashboard/metrics', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const codes = reqCodesInWindow(windowIds(request.query));
    const inWindow = (table, extra = '') => {
      if (!codes) return all(`SELECT status FROM ${table} ${extra ? 'WHERE ' + extra : ''}`);
      if (!codes.length) return [];
      const ph = codes.map(() => '?').join(',');
      const where = `req_code IN (${ph})${extra ? ' AND ' + extra : ''}`;
      return all(`SELECT status FROM ${table} WHERE ${where}`, ...codes);
    };

    const reqRows = codes
      ? (codes.length ? all(`SELECT status FROM requirement WHERE req_code IN (${codes.map(() => '?').join(',')})`, ...codes) : [])
      : all('SELECT status FROM requirement');

    // 投产系统：总数 + 已投产（终态）数
    let relSys = [];
    if (!codes) relSys = all('SELECT status FROM release_system');
    else if (codes.length) {
      const ph = codes.map(() => '?').join(',');
      relSys = all(
        `SELECT rs.status FROM release_system rs
           JOIN release_task rt ON rt.id = rs.release_task_id
          WHERE rt.req_code IN (${ph})`, ...codes,
      );
    }

    const dev = inWindow('dev_task');
    const sit = inWindow('test_task', "test_type='SIT'");
    const uat = inWindow('test_task', "test_type='UAT'");

    return ok({
      requirement: { total: reqRows.length, terminal: countTerminal(reqRows) },
      dev: { total: dev.length, terminal: countTerminal(dev) },
      sit: { total: sit.length, terminal: countTerminal(sit) },
      uat: { total: uat.length, terminal: countTerminal(uat) },
      releaseSystem: { total: relSys.length, terminal: relSys.filter((r) => r.status === '已投产').length },
    });
  });

  // 自定义图表数据聚合
  fastify.post('/dashboard/chart-data', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const { source = 'requirement', dimension = 'status' } = request.body || {};
    const codes = reqCodesInWindow(windowIds(request.body));

    // 载入源记录
    let records;
    const filterByWindow = (rows) => (codes ? rows.filter((r) => codes.includes(r.req_code)) : rows);
    switch (source) {
      case 'requirement': records = filterByWindow(all('SELECT * FROM requirement')); break;
      case 'dev': records = filterByWindow(all('SELECT * FROM dev_task')); break;
      case 'sit': records = filterByWindow(all("SELECT * FROM test_task WHERE test_type='SIT'")); break;
      case 'uat': records = filterByWindow(all("SELECT * FROM test_task WHERE test_type='UAT'")); break;
      case 'nft': records = filterByWindow(all("SELECT * FROM test_task WHERE test_type='NFT'")); break;
      case 'sec': records = filterByWindow(all("SELECT * FROM test_task WHERE test_type='SEC'")); break;
      default: throw badRequest('未知数据源');
    }

    // 维度取值（可能多值，如系统数组）
    const dimValues = (r) => {
      switch (dimension) {
        case 'status': return [r.status || '未知'];
        case 'org': return [r.impl_org || (r.main_systems ? sysOrgs(r.main_systems) : null) || r.propose_dept || '未分配'].flat();
        case 'system':
          if (r.impl_system) return [sysName(r.impl_system)];
          if (r.main_systems) return JSON.parse(r.main_systems).map(sysName);
          return ['未指定'];
        case 'sector':
          if (r.impl_system) return [sysSector(r.impl_system)];
          if (r.main_systems) return JSON.parse(r.main_systems).map(sysSector);
          return ['未指定'];
        default: return [r[dimension] || '未知'];
      }
    };

    const buckets = {};
    for (const r of records) {
      for (const v of dimValues(r)) {
        const key = v || '未知';
        buckets[key] = (buckets[key] || 0) + 1;
      }
    }
    const data = Object.entries(buckets).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return ok({ data });
  });

  // 我的图表配置：列表
  fastify.get('/dashboard/charts', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    return ok(all('SELECT * FROM dashboard_chart WHERE user_id = ? ORDER BY sort, id', request.currentUser.id));
  });

  // 新增图表
  fastify.post('/dashboard/charts', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const { title, chart_type, config, sort } = request.body || {};
    if (!title || !chart_type) throw badRequest('标题与图表类型必填');
    const res = run(
      'INSERT INTO dashboard_chart (user_id, title, chart_type, config, sort) VALUES (?,?,?,?,?)',
      request.currentUser.id, title, chart_type, JSON.stringify(config || {}), sort || 0,
    );
    return ok({ id: res.lastInsertRowid });
  });

  // 修改图表
  fastify.put('/dashboard/charts/:id', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    const row = get('SELECT * FROM dashboard_chart WHERE id = ? AND user_id = ?', request.params.id, request.currentUser.id);
    if (!row) throw notFound();
    const { title, chart_type, config, sort } = request.body || {};
    run(
      `UPDATE dashboard_chart SET title=?, chart_type=?, config=?, sort=?, updated_at=datetime('now','localtime') WHERE id=?`,
      title ?? row.title, chart_type ?? row.chart_type,
      config !== undefined ? JSON.stringify(config) : row.config, sort ?? row.sort, row.id,
    );
    return ok({ id: row.id });
  });

  // 删除图表
  fastify.delete('/dashboard/charts/:id', { preHandler: fastify.requirePerm('dashboard', 'view') }, async (request) => {
    run('DELETE FROM dashboard_chart WHERE id = ? AND user_id = ?', request.params.id, request.currentUser.id);
    return ok(null, '已删除');
  });
}

// ---- 系统维度辅助 ----
function sysName(code) { return get('SELECT sys_name FROM system WHERE sys_code = ?', code)?.sys_name || code; }
function sysSector(code) { return get('SELECT sector FROM system WHERE sys_code = ?', code)?.sector || '未分类'; }
function sysOrgs(mainJson) {
  try { const arr = JSON.parse(mainJson); return arr.map((c) => get('SELECT org FROM system WHERE sys_code = ?', c)?.org).filter(Boolean); }
  catch { return []; }
}

/**
 * 文件：modules/issues/routes.js
 * 用途：问题管理模块接口（只读展示 + 外部同步）。提供问题列表、问题详情，
 *       以及「同步问题」（拉取概述列表）与「同步问题详情」（后台逐条慢速更新明细）两个同步端点。
 * 作者：hengguan
 * 说明：数据来源为外部 PAMS 系统，本平台不提供新增/编辑/删除；以 issue_code 为同步主键做 upsert。
 *       JSON 字段（analysis_log/tags/linked_cases）入库为字符串、出参解析为数组；is_major/is_common 出参转布尔。
 *       后台同步状态（bgState）保存在内存中，服务重启后重置；前端通过轮询 /issues/sync-detail-status 获取进度。
 */

import { get, run, all, tx } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { ok, notFound, badRequest } from '../../lib/http.js';
import { fetchIssueOverview, fetchIssueDetail } from '../../lib/pams.js';

// 列表查询可排序/筛选的列白名单
const COLUMNS = [
  'id', 'issue_code', 'status', 'category', 'detailed_classification', 'system', 'module',
  'business_group', 'urgency', 'round', 'summary', 'create_time', 'plan_resolve_time', 'synced_at',
];
// 关键字模糊检索列
const SEARCH = ['issue_code', 'summary', 'system', 'detailed_classification'];
// 出参需解析为数组的 JSON 字段
const JSON_FIELDS = ['analysis_log', 'tags', 'linked_cases'];

/** 把存储的 JSON 字符串字段解析为数组、is_major/is_common 转布尔，返回给前端 */
function decode(row) {
  if (!row) return row;
  const out = { ...row };
  for (const f of JSON_FIELDS) {
    try {
      out[f] = row[f] ? JSON.parse(row[f]) : [];
    } catch {
      out[f] = [];
    }
  }
  out.is_major = !!row.is_major;
  out.is_common = !!row.is_common;
  return out;
}

/** 把任意值安全序列化为 JSON 字符串（用于数组/对象字段入库） */
function toJson(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v; // 已是字符串则原样存储
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

/** 把外部布尔/数值统一转为 0/1 */
function toBit(v) {
  return v === true || v === 1 || v === '1' ? 1 : 0;
}

// 概述同步：外部字段 → 本地列（仅 5 个列表字段）
const OVERVIEW_MAP = {
  status: 'status',
  detailed_classification: 'detailed_classification',
  system: 'system',
  summary: 'summary',
};

// 明细同步：外部字段 → 本地列（全字段）
const DETAIL_FIELDS = [
  'round', 'urgency', 'handling_method', 'version_codes', 'business_group', 'module', 'system',
  'work_order_no', 'create_time', 'plan_resolve_time', 'status', 'category', 'detailed_classification',
  'summary', 'details', 'tracker_name', 'tracker_org', 'tracker_contact', 'reporter_name', 'reporter_org',
  'reporter_contact', 'handler_name', 'handler_org', 'handler_contact', 'linked_case_code', 'linked_case_name',
  'root_cause', 'solution', 'release_status',
];

// ── 后台同步状态（内存，重启重置） ──────────────────────────────────────────
const bgState = {
  running: false,
  total: 0,
  done: 0,
  failed: 0,
  startTime: null,
  lastFinishTime: null, // 最近一次完成时间（本地时间字符串）
};

/** 后台逐条同步问题详情，每条间隔 1 秒；不阻塞请求线程 */
async function runBgSyncDetail(codes) {
  bgState.running = true;
  bgState.total = codes.length;
  bgState.done = 0;
  bgState.failed = 0;
  bgState.startTime = new Date().toISOString();

  for (const code of codes) {
    try {
      const d = await fetchIssueDetail(code);
      if (!d) { bgState.failed++; continue; }

      const setData = {};
      for (const f of DETAIL_FIELDS) if (d[f] !== undefined) setData[f] = d[f] ?? null;
      setData.analysis_log = toJson(d.analysis_log);
      setData.tags         = toJson(d.tags);
      setData.linked_cases = toJson(d.linked_cases);
      setData.is_major     = toBit(d.is_major);
      setData.is_common    = toBit(d.is_common);
      setData.synced_at    = new Date().toISOString().slice(0, 19).replace('T', ' ');

      const keys = Object.keys(setData);
      const exists = get('SELECT id FROM issue WHERE issue_code = ?', code);
      if (exists) {
        run(
          `UPDATE issue SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE issue_code=?`,
          ...keys.map((k) => setData[k]), code,
        );
      } else {
        run(
          `INSERT INTO issue (issue_code, ${keys.join(',')}) VALUES (?, ${keys.map(() => '?').join(',')})`,
          code, ...keys.map((k) => setData[k]),
        );
      }
      bgState.done++;
    } catch {
      bgState.failed++;
    }
    // 每条间隔 1 秒，避免对 PAMS 造成压力
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  bgState.running = false;
  // 本地时间格式：MM-DD HH:MM
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  bgState.lastFinishTime = `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export default async function issueRoutes(fastify) {
  // 列表
  fastify.post('/issues/list', { preHandler: fastify.requirePerm('issue', 'view') }, async (request) => {
    const result = listQuery({
      table: 'issue', columns: COLUMNS, searchColumns: SEARCH,
      query: request.body || {},
    });
    return ok(result);
  });

  // 详情
  fastify.get('/issues/:id', { preHandler: fastify.requirePerm('issue', 'view') }, async (request) => {
    const row = get('SELECT * FROM issue WHERE id = ?', request.params.id);
    if (!row) throw notFound();
    return ok(decode(row));
  });

  // 同步问题：拉取外部概述列表，按 issue_code upsert（仅更新列表展示字段）
  fastify.post('/issues/sync', { preHandler: fastify.requirePerm('issue', 'sync') }, async () => {
    const list = await fetchIssueOverview();
    let inserted = 0;
    let updated = 0;
    const failed = [];

    tx(() => {
      for (const item of list) {
        const code = (item.issue_id || '').trim();
        if (!code) { failed.push({ issue_id: item.issue_id, error: '缺少 issue_id' }); continue; }
        const exists = get('SELECT id FROM issue WHERE issue_code = ?', code);
        const cols = Object.values(OVERVIEW_MAP);
        const vals = Object.keys(OVERVIEW_MAP).map((k) => item[k] ?? null);
        if (exists) {
          run(
            `UPDATE issue SET ${cols.map((c) => `${c}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE issue_code=?`,
            ...vals, code,
          );
          updated++;
        } else {
          run(
            `INSERT INTO issue (issue_code, ${cols.join(',')}) VALUES (?, ${cols.map(() => '?').join(',')})`,
            code, ...vals,
          );
          inserted++;
        }
      }
    });

    return ok({ total: list.length, inserted, updated, failed }, '同步问题完成');
  });

  // 同步问题详情：逐条按问题编号拉取明细并更新整条记录
  // body 可传 { codes: [...] } 指定范围，缺省则同步库内全部问题
  fastify.post('/issues/sync-detail', { preHandler: fastify.requirePerm('issue', 'sync') }, async (request) => {
    const body = request.body || {};
    let codes = Array.isArray(body.codes) ? body.codes.filter(Boolean) : null;
    if (!codes || !codes.length) {
      codes = all('SELECT issue_code FROM issue ORDER BY id ASC').map((r) => r.issue_code);
    }
    if (!codes.length) throw badRequest('暂无可同步的问题，请先点击「同步问题」');

    let updated = 0;
    const failed = [];

    // 逐条拉取，单条失败不影响其余；网络请求需在事务外，避免长事务占用连接
    for (const code of codes) {
      try {
        const d = await fetchIssueDetail(code);
        if (!d) { failed.push({ code, error: '未返回明细' }); continue; }

        const setData = {};
        for (const f of DETAIL_FIELDS) if (d[f] !== undefined) setData[f] = d[f] ?? null;
        setData.analysis_log = toJson(d.analysis_log);
        setData.tags = toJson(d.tags);
        setData.linked_cases = toJson(d.linked_cases);
        setData.is_major = toBit(d.is_major);
        setData.is_common = toBit(d.is_common);
        setData.synced_at = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const keys = Object.keys(setData);
        const exists = get('SELECT id FROM issue WHERE issue_code = ?', code);
        if (exists) {
          run(
            `UPDATE issue SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE issue_code=?`,
            ...keys.map((k) => setData[k]), code,
          );
        } else {
          // 概述中尚不存在该问题时，按明细新建
          run(
            `INSERT INTO issue (issue_code, ${keys.join(',')}) VALUES (?, ${keys.map(() => '?').join(',')})`,
            code, ...keys.map((k) => setData[k]),
          );
        }
        updated++;
      } catch (err) {
        failed.push({ code, error: err.message || '同步失败' });
      }
    }

    return ok({ total: codes.length, updated, failed }, '同步问题详情完成');
  });

  // 启动后台同步：立即返回，任务在后台以每秒一条的速度执行
  fastify.post('/issues/sync-detail-bg', { preHandler: fastify.requirePerm('issue', 'sync') }, async (request) => {
    if (bgState.running) return ok(bgState, '后台同步已在运行中');
    const body = request.body || {};
    let codes = Array.isArray(body.codes) ? body.codes.filter(Boolean) : null;
    if (!codes || !codes.length) {
      codes = all('SELECT issue_code FROM issue ORDER BY id ASC').map((r) => r.issue_code);
    }
    if (!codes.length) throw badRequest('暂无可同步的问题，请先点击「同步问题」');
    // 不 await，让任务在后台运行
    runBgSyncDetail(codes).catch(() => { bgState.running = false; });
    return ok({ ...bgState, total: codes.length }, '后台同步已启动');
  });

  // 查询后台同步状态
  fastify.get('/issues/sync-detail-status', { preHandler: fastify.requirePerm('issue', 'view') }, async () => {
    return ok({ ...bgState });
  });
}

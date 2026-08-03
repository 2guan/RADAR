/**
 * 文件：server/src/modules/issues/application/sync.js
 * 说明：同步仅写入 issues 模块拥有的问题快照表，失败明细会被隔离记录。
 * 用途：执行问题概述与明细的同步编排，不依赖 Fastify 路由。
 * 作者：hengguan
 */
import { all, get, run, tx } from '../../../platform/persistence/index.js';
import { fetchIssueOverview, fetchIssueDetail } from './pams.js';
import { beijingDateTimeString } from '../../../shared/utils/time.js';

const OVERVIEW_MAP = {
  status: 'status', detailed_classification: 'detailed_classification', system: 'system',
  summary: 'summary', work_order_no: 'work_order_no', details: 'details',
};
const DETAIL_FIELDS = [
  'round', 'urgency', 'handling_method', 'version_codes', 'business_group', 'module', 'system',
  'work_order_no', 'create_time', 'plan_resolve_time', 'status', 'category', 'detailed_classification',
  'summary', 'details', 'tracker_name', 'tracker_org', 'tracker_contact', 'reporter_name', 'reporter_org',
  'reporter_contact', 'handler_name', 'handler_org', 'handler_contact', 'linked_case_code', 'linked_case_name',
  'root_cause', 'solution', 'release_status',
];
const state = { running: false, total: 0, done: 0, failed: 0, startTime: null, lastFinishTime: null };
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const toJson = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return null; }
};
const toBit = (value) => value === true || value === 1 || ['1', 'true', 'yes', 'y', '是'].includes(String(value ?? '').trim().toLowerCase()) ? 1 : 0;

async function saveDetail(code, detail) {
  if (!detail) return false;
  const data = {};
  for (const key of DETAIL_FIELDS) if (detail[key] !== undefined) data[key] = detail[key] ?? null;
  data.analysis_log = toJson(detail.analysis_log);
  data.tags = toJson(detail.tags);
  data.linked_cases = toJson(detail.linked_cases);
  data.is_major = toBit(detail.is_major);
  data.is_common = toBit(detail.is_common);
  data.synced_at = beijingDateTimeString().slice(0, 16);
  const keys = Object.keys(data);
  // 以问题编号幂等写入：已有快照更新，不存在时再创建。
  const existing = await get('SELECT id FROM issue WHERE issue_code = ?', code);
  if (existing) {
    await run(`UPDATE issue SET ${keys.map((key) => `${key}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE issue_code=?`, ...keys.map((key) => data[key]), code);
  } else {
    await run(`INSERT INTO issue (issue_code, ${keys.join(',')}) VALUES (?, ${keys.map(() => '?').join(',')})`, code, ...keys.map((key) => data[key]));
  }
  return true;
}

async function runDetailSync(codes) {
  Object.assign(state, { running: true, total: codes.length, done: 0, failed: 0, startTime: new Date().toISOString() });
  // 串行拉取避免短时间内压垮问题工具，并逐条隔离失败。
  for (const code of codes) {
    try {
      if (await saveDetail(code, await fetchIssueDetail(code))) state.done++;
      else state.failed++;
    } catch { state.failed++; }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  state.running = false;
  state.lastFinishTime = new Date().toISOString();
}

export function getIssueSyncState() { return { ...state }; }
export function resetIssueSyncState() { Object.assign(state, { running: false, total: 0, done: 0, failed: 0, startTime: null, lastFinishTime: null }); }

export async function startIssueDetailSync(codes = null) {
  if (state.running) return { started: false, ...getIssueSyncState() };
  const targetCodes = Array.isArray(codes) && codes.length
    ? codes.filter(Boolean)
    : (await all('SELECT issue_code FROM issue ORDER BY id ASC')).map((row) => row.issue_code);
  if (!targetCodes.length) return { started: false, empty: true, ...getIssueSyncState() };
  runDetailSync(targetCodes).catch(() => { state.running = false; });
  return { started: true, ...getIssueSyncState(), total: targetCodes.length };
}

export async function syncIssueOverview() {
  const list = await fetchIssueOverview();
  let inserted = 0;
  let updated = 0;
  const failed = [];
  // 概述全量同步在同一事务中完成，避免部分批次成功造成快照不一致。
  await tx(async () => {
    for (const item of list) {
      const code = String(item.issue_id || '').trim();
      if (!code) { failed.push({ issue_id: item.issue_id, error: '缺少 issue_id' }); continue; }
      const existing = await get('SELECT id FROM issue WHERE issue_code = ?', code);
      const pairs = Object.entries(OVERVIEW_MAP).filter(([key]) => hasOwn(item, key));
      const columns = pairs.map(([, column]) => column);
      const values = pairs.map(([key]) => item[key] ?? null);
      if (existing) {
        if (columns.length) await run(`UPDATE issue SET ${columns.map((column) => `${column}=?`).join(',')}, updated_at=datetime('now','localtime') WHERE issue_code=?`, ...values, code);
        updated++;
      } else {
        if (columns.length) await run(`INSERT INTO issue (issue_code, ${columns.join(',')}) VALUES (?, ${columns.map(() => '?').join(',')})`, code, ...values);
        else await run('INSERT INTO issue (issue_code) VALUES (?)', code);
        inserted++;
      }
    }
  });
  return { total: list.length, inserted, updated, failed };
}

export async function syncIssueDetails(codes) {
  const targetCodes = Array.isArray(codes) && codes.length
    ? codes.filter(Boolean)
    : (await all('SELECT issue_code FROM issue ORDER BY id ASC')).map((row) => row.issue_code);
  const failed = [];
  let updated = 0;
  for (const code of targetCodes) {
    try {
      if (await saveDetail(code, await fetchIssueDetail(code))) updated++;
      else failed.push({ code, error: '未返回明细' });
    } catch (error) { failed.push({ code, error: error.message || '同步失败' }); }
  }
  return { total: targetCodes.length, updated, failed };
}

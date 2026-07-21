/**
 * 文件：lib/issue-sync-scheduler.js
 * 用途：按系统设置定时拉取已同步问题的详情，支持每日、每 N 小时、每 N 分钟。
 * 说明：配置保存在 app_config；单进程内只运行一个检查定时器，任务执行中不重复启动。
 */

import { all, get, run } from '../db/index.js';
import { startIssueDetailSync, syncIssueOverview } from '../modules/issues/routes.js';
import { logger } from './logger.js';

const CONFIG_KEYS = [
  'issue.sync.enabled',
  'issue.sync.scheduleMode',
  'issue.sync.dailyTime',
  'issue.sync.interval',
  'issue.sync.lastRunAt',
  'issue.sync.overview.enabled',
  'issue.sync.overview.scheduleMode',
  'issue.sync.overview.dailyTime',
  'issue.sync.overview.interval',
  'issue.sync.overview.lastRunAt',
];

let timer = null;
let ticking = false;

function readSchedule(values, prefix) {
  const key = (name) => `${prefix}.${name}`;
  return {
    enabled: values[key('enabled')] === 'true' || values[key('enabled')] === '1',
    mode: values[key('scheduleMode')] || 'daily',
    dailyTime: values[key('dailyTime')] || '02:00',
    interval: Math.max(1, Number.parseInt(values[key('interval')], 10) || 1),
    lastRunAt: values[key('lastRunAt')] || '',
  };
}

async function readConfig() {
  const rows = await all(`SELECT key, value FROM app_config WHERE key IN (${CONFIG_KEYS.map(() => '?').join(',')})`, ...CONFIG_KEYS);
  const values = Object.fromEntries(rows.map((row) => [row.key, String(row.value || '').trim()]));
  return {
    overview: readSchedule(values, 'issue.sync.overview'),
    detail: readSchedule(values, 'issue.sync'),
  };
}

function isDue(schedule, now) {
  if (!schedule.enabled) return false;
  const parsedLast = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;
  const last = parsedLast && !Number.isNaN(parsedLast.getTime()) ? parsedLast : null;
  if (schedule.mode === 'daily') {
    const match = /^(\d{1,2}):(\d{2})$/.exec(schedule.dailyTime);
    if (!match) return false;
    const due = new Date(now);
    due.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return now >= due && (!last || last < due);
  }
  const unitMs = schedule.mode === 'hours' ? 60 * 60 * 1000 : 60 * 1000;
  return !last || now.getTime() - last.getTime() >= schedule.interval * unitMs;
}

async function markRunStarted(key, now) {
  await run(
    `INSERT INTO app_config (key, value, remark) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')`,
    key, now.toISOString(), '问题定时同步最近启动时间',
  );
}

function scheduleLabel(schedule) {
  return schedule.mode === 'daily' ? '每日' : `每${schedule.interval}${schedule.mode === 'hours' ? '小时' : '分钟'}`;
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    const schedules = await readConfig();
    if (isDue(schedules.overview, now)) {
      await syncIssueOverview();
      await markRunStarted('issue.sync.overview.lastRunAt', now);
      logger.info(`[问题同步] 已按${scheduleLabel(schedules.overview)}计划完成概述同步`);
    }
    if (isDue(schedules.detail, now)) {
      const result = await startIssueDetailSync();
      if (result.started || result.empty) {
        await markRunStarted('issue.sync.lastRunAt', now);
        logger.info(`[问题同步] 已按${scheduleLabel(schedules.detail)}计划${result.empty ? '完成空详情同步' : '启动详情同步'}`);
      }
    }
  } catch (err) {
    logger.error('[问题同步] 定时详情同步启动失败：', err.message || err);
  } finally {
    ticking = false;
  }
}

/** 启动调度器；首次检查立即执行，之后每 30 秒检查一次配置与到期状态。 */
export function startIssueSyncScheduler() {
  if (timer) return;
  tick();
  timer = setInterval(tick, 30 * 1000);
}

/** 保存设置后立即重新检查一次，配置无需重启即可生效。 */
export function triggerIssueSyncSchedule() {
  return tick();
}

export function stopIssueSyncScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

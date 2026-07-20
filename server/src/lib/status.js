/**
 * 文件：lib/status.js
 * 用途：流程状态相关判定工具。判断某状态是否为"终态"，用于触发终态业务校验。
 * 作者：hengguan
 * 说明：终态标识来自字典 process_status 的 extra.isTerminal。
 */

import { all, get, dialect } from '../db/index.js';
import { parseJsonObject } from './json.js';

const STATUS_CATEGORIES = ['process_status', 'issue_status'];
let semanticCache = new Map();

function normalizeStateType(extra = {}) {
  const raw = String(extra.stateType || '').trim();
  if (raw === 'initial') return 'initial';
  if (raw === 'final' || extra.isTerminal === true) return 'final';
  return 'inProgress';
}

function fallbackStateType(category, statusAttr) {
  const val = String(statusAttr || '');
  if (!val) return 'initial';
  if (category === 'issue_status') {
    return ['已解决', '待验证'].includes(val) ? 'final' : 'inProgress';
  }
  if (val.includes('登记') || val.includes('承接') || val.includes('初始') || val.includes('新建')) return 'initial';
  if (['分析完成', '开发完成', '测试完成', '已上线', '已签署'].includes(val)
    || val.includes('完成')
    || val.includes('已上线')) return 'final';
  return 'inProgress';
}

export async function refreshStatusSemantics() {
  const next = new Map();
  for (const category of STATUS_CATEGORIES) {
    const rows = await all('SELECT attr_value, extra FROM dict_item WHERE category = ?', category);
    const map = new Map();
    for (const row of rows) {
      const extra = parseJsonObject(row.extra);
      map.set(row.attr_value, {
        stateType: normalizeStateType(extra),
        isTerminal: normalizeStateType(extra) === 'final',
      });
    }
    next.set(category, map);
  }
  semanticCache = next;
}

function statusTypeFromCache(category, statusAttr) {
  if (!statusAttr) return false;
  const item = semanticCache.get(category)?.get(statusAttr);
  return item?.stateType || fallbackStateType(category, statusAttr);
}

function isTerminalDictAttr(category, statusAttr) {
  if (!statusAttr) return false;
  return statusTypeFromCache(category, statusAttr) === 'final';
}

/**
 * 判断给定状态属性值是否为终态。
 * @param {string} statusAttr 状态属性值（中文）
 * @returns {boolean}
 */
export function isTerminalStatus(statusAttr) {
  return isTerminalDictAttr('process_status', statusAttr);
}

/**
 * 判断 PAMS 问题状态是否为终态，终态标识来自 issue_status.extra.isTerminal。
 */
export function isIssueTerminalStatus(statusAttr) {
  return isTerminalDictAttr('issue_status', statusAttr);
}

export async function statusTypeForProcessStatus(statusAttr) {
  if (!statusAttr) return 'initial';
  const row = await get('SELECT extra FROM dict_item WHERE category = ? AND attr_value = ?', 'process_status', statusAttr);
  if (row?.extra) return normalizeStateType(parseJsonObject(row.extra));
  return fallbackStateType('process_status', statusAttr);
}

/**
 * 按阶段与状态类型读取默认流程状态。优先取字典中排序最靠前的项。
 */
export async function defaultProcessStatus(stage, stateType = 'initial', fallback = null) {
  const row = await get(
    `SELECT attr_value FROM dict_item
      WHERE category = ?
        AND ${dialect.jsonExtract('extra', '$.stage')} = ?
        AND ${dialect.jsonExtract('extra', '$.stateType')} = ?
      ORDER BY sort, id
      LIMIT 1`,
    'process_status', stage, stateType,
  );
  return row?.attr_value || fallback;
}

/**
 * 读取普通字典的默认值。约定取排序最靠前的项，作为新增/导入时的兜底值。
 */
export async function defaultDictAttr(category, fallback = null) {
  const row = await get(
    `SELECT attr_value FROM dict_item
      WHERE category = ?
      ORDER BY sort, id
      LIMIT 1`,
    category,
  );
  return row?.attr_value || fallback;
}

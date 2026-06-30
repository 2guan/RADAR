/**
 * 文件：lib/status.js
 * 用途：流程状态相关判定工具。判断某状态是否为"终态"，用于触发终态业务校验。
 * 作者：hengguan
 * 说明：终态标识来自字典 process_status 的 extra.isTerminal。
 */

import { get } from '../db/index.js';

function isTerminalDictAttr(category, statusAttr) {
  if (!statusAttr) return false;
  const row = get('SELECT extra FROM dict_item WHERE category = ? AND attr_value = ?', category, statusAttr);
  if (!row?.extra) return false;
  try {
    return !!JSON.parse(row.extra).isTerminal;
  } catch {
    return false;
  }
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

/**
 * 按阶段与状态类型读取默认流程状态。优先取字典中排序最靠前的项。
 */
export function defaultProcessStatus(stage, stateType = 'initial', fallback = null) {
  const row = get(
    `SELECT attr_value FROM dict_item
      WHERE category = ?
        AND json_extract(extra, '$.stage') = ?
        AND json_extract(extra, '$.stateType') = ?
      ORDER BY sort, id
      LIMIT 1`,
    'process_status', stage, stateType,
  );
  return row?.attr_value || fallback;
}

/**
 * 读取普通字典的默认值。约定取排序最靠前的项，作为新增/导入时的兜底值。
 */
export function defaultDictAttr(category, fallback = null) {
  const row = get(
    `SELECT attr_value FROM dict_item
      WHERE category = ?
      ORDER BY sort, id
      LIMIT 1`,
    category,
  );
  return row?.attr_value || fallback;
}

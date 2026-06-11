/**
 * 文件：lib/status.js
 * 用途：流程状态相关判定工具。判断某状态是否为"终态"，用于触发终态业务校验。
 * 作者：hengguan
 * 说明：终态标识来自字典 process_status 的 extra.isTerminal。
 */

import { get } from '../db/index.js';

/**
 * 判断给定状态属性值是否为终态。
 * @param {string} statusAttr 状态属性值（中文）
 * @returns {boolean}
 */
export function isTerminalStatus(statusAttr) {
  if (!statusAttr) return false;
  const row = get('SELECT extra FROM dict_item WHERE category = ? AND attr_value = ?', 'process_status', statusAttr);
  if (!row?.extra) return false;
  try {
    return !!JSON.parse(row.extra).isTerminal;
  } catch {
    return false;
  }
}

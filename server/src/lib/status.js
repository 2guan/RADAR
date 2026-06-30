/**
 * 文件：lib/status.js
 * 用途：流程状态相关判定工具。判断某状态是否为"终态"，用于触发终态业务校验。
 * 作者：hengguan
 * 说明：终态标识来自字典 process_status 的 extra.isTerminal。
 */

import { get, dialect } from '../db/index.js';

function terminalFallback(category, statusAttr) {
  const val = String(statusAttr || '');
  if (category === 'issue_status') return ['已解决', '待验证'].includes(val);
  return ['分析完成', '开发完成', '测试完成', '已上线', '已签署'].includes(val)
    || val.includes('完成')
    || val.includes('已上线');
}

function isTerminalDictAttr(category, statusAttr) {
  if (!statusAttr) return false;
  return terminalFallback(category, statusAttr);
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

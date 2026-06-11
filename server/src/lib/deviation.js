/**
 * 文件：lib/deviation.js
 * 用途：排期偏差率演算。基于计划/实际起止时间计算延期百分比，集中实现便于后续调整公式。
 * 作者：hengguan
 * 说明：公式 = round((实际结束 - 计划结束) / max(计划结束 - 计划开始, 1天) * 100)，
 *       正值表示延期，负值表示提前；信息不全时返回 null。
 */

const DAY = 24 * 60 * 60 * 1000;

/** 解析日期字符串为时间戳，失败返回 null */
function ts(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * 计算排期偏差率（整数百分比）。
 * @param {string} planStart 计划开始
 * @param {string} planEnd 计划结束
 * @param {string} actualEnd 实际结束
 * @returns {number|null}
 */
export function calcDeviation(planStart, planEnd, actualEnd) {
  const ps = ts(planStart);
  const pe = ts(planEnd);
  const ae = ts(actualEnd);
  if (pe == null || ae == null) return null;
  const planSpan = ps != null ? Math.max(pe - ps, DAY) : DAY;
  return Math.round(((ae - pe) / planSpan) * 100);
}

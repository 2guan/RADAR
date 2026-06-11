/**
 * 文件：lib/window.js
 * 用途：投产窗口过滤辅助。从请求体/查询参数解析"投产点 id 集合"，支持多选与留空（=全部）。
 * 作者：hengguan
 * 说明：前端可传 releasePointIds（数组，POST body）或逗号串（GET query）；兼容旧的 releasePointId 单值。
 */

/** 解析投产点 id 数组（空数组表示"全部投产点"） */
export function windowIds(src) {
  if (!src) return [];
  let v = src.releasePointIds;
  if (typeof v === 'string') v = v.split(',').map((s) => s.trim()).filter(Boolean); // 来自 query 的逗号串，剔除空串
  if (Array.isArray(v)) return v.map(Number).filter(Number.isFinite);
  if (src.releasePointId) {                               // 兼容旧单值
    const n = Number(src.releasePointId);
    return Number.isFinite(n) ? [n] : [];
  }
  return [];
}

/**
 * 生成 IN 过滤片段。
 * @param {string} col 列名（或表达式）
 * @param {number[]} ids id 数组
 * @returns {{where:string, params:number[]}} 空 ids 返回空 where（即不过滤=全部）
 */
export function inClause(col, ids) {
  if (!ids.length) return { where: '', params: [] };
  return { where: `${col} IN (${ids.map(() => '?').join(',')})`, params: ids };
}

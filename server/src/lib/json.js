/**
 * 文件：lib/json.js
 * 用途：统一处理数据库 JSON 字段的解析兼容。SQLite 通常返回 JSON 字符串，
 *       TDSQL/MySQL 驱动可能直接返回数组或对象，本工具负责抹平差异。
 * 作者：hengguan
 * 说明：业务模块读取 JSON 字段时应优先使用这里的 parseJsonArray/parseJsonObject，
 *       避免直接 JSON.parse 导致 TDSQL 返回对象时发生异常。
 */

/** 按通用 JSON 值解析；对象/数组原样返回，字符串尝试 JSON.parse，失败则返回兜底值。 */
export function parseJsonValue(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/** 将数据库值规整为数组；非数组的有效值会包成单元素数组。 */
export function parseJsonArray(value) {
  const parsed = parseJsonValue(value, []);
  if (Array.isArray(parsed)) return parsed;
  if (parsed === null || parsed === undefined || parsed === '') return [];
  return [parsed];
}

/** 将数据库值规整为普通对象；数组、空值和非法 JSON 都返回空对象。 */
export function parseJsonObject(value) {
  const parsed = parseJsonValue(value, {});
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

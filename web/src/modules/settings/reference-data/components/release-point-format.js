/**
 * 文件：web/src/modules/settings/reference-data/components/release-point-format.js
 * 说明：投产点是稳定业务标识，不适用通用人可读日期展示格式。
 * 用途：集中保留投产点的 YYYYMMDD 及“投产点待定”文本语义。
 * 作者：hengguan
 */

const NUMERIC_RELEASE_POINT_RE = /^\d+$/;

export function isNumericReleasePoint(value) {
  return NUMERIC_RELEASE_POINT_RE.test(String(value || ''));
}

/** 数值投产点按原始八位业务标识展示，其他历史文本原样保留。 */
export function formatReleasePointDate(value) {
  return String(value || '');
}

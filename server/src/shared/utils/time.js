/**
 * 文件：server/src/shared/utils/time.js
 * 说明：服务端统一以北京时间处理当前日历日和无时区日期时间。
 * 用途：避免用 UTC 截取或主机本地时区生成业务日期。
 * 作者：hengguan
 */

export const BEIJING_TIME_ZONE = 'Asia/Shanghai';

const partFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: BEIJING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const pad2 = (value) => String(value).padStart(2, '0');

function validDateParts(year, month, day) {
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day;
}

export function beijingDateTimeParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const values = partFormatter.formatToParts(date).reduce((out, part) => {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
    return out;
  }, {});
  return values.year && values.month && values.day ? values : null;
}

/** 返回北京时间日历日，供业务字段以 YYYY-MM-DD 存储。 */
export function beijingDateString(value = new Date()) {
  const parts = beijingDateTimeParts(value);
  return parts ? `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}` : null;
}

/** 返回北京时间日历日，供投产点等既有 YYYYMMDD 字段存储。 */
export function beijingCompactDateString(value = new Date()) {
  const date = beijingDateString(value);
  return date?.replaceAll('-', '') || null;
}

/** 返回北京时间墙上时间，供既有无时区日期时间字段存储。 */
export function beijingDateTimeString(value = new Date()) {
  const parts = beijingDateTimeParts(value);
  return parts ? `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}` : null;
}

/** 严格校验机器可读 YYYY-MM-DD 业务日期，不通过时区解析。 */
export function isValidDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  return !!match && validDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

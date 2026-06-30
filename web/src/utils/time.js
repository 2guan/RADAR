/**
 * 文件：utils/time.js
 * 用途：前端时间格式化工具。历史记录统一按北京时间展示。
 * 作者：hengguan
 * 说明：兼容后端返回的 Date、时间戳、ISO 字符串，以及数据库无时区时间字符串。
 */

const BEIJING_TIME_ZONE = 'Asia/Shanghai';

const pad2 = (n) => String(n).padStart(2, '0');

function formatParts(year, month, day, hour, minute, second) {
  return `${year}-${Number(month)}-${Number(day)} ${pad2(hour)}:${pad2(minute)}:${pad2(second)}`;
}

function formatDateInBeijing(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '—';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BEIJING_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  return formatParts(parts.year, parts.month, parts.day, parts.hour, parts.minute, parts.second);
}

/**
 * 历史记录时间统一格式：2026-5-31 18:05:02。
 * 带时区的时间转换为北京时间；数据库无时区字符串按北京时间墙上时间展示。
 */
export function formatBeijingDateTime(value) {
  if (!value) return '—';
  if (value instanceof Date || typeof value === 'number') return formatDateInBeijing(new Date(value));

  const text = String(value).trim();
  if (!text) return '—';

  const naive = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.\d+)?$/);
  if (naive) {
    const [, year, month, day, hour, minute, second = '0'] = naive;
    return formatParts(year, month, day, hour, minute, second);
  }

  const zonedText = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text.replace(' ', 'T') : text;
  return formatDateInBeijing(new Date(zonedText));
}

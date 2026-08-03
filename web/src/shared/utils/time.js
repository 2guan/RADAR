/**
 * 文件：web/src/shared/utils/time.js
 * 说明：兼容后端返回的 Date、时间戳、ISO 字符串，以及数据库无时区时间字符串。
 * 用途：前端时间格式化工具。历史记录统一按北京时间展示。
 * 作者：hengguan
 */

const BEIJING_TIME_ZONE = 'Asia/Shanghai';

const pad2 = (n) => String(n).padStart(2, '0');

function formatDateParts(year, month, day) {
  return `${Number(year)}-${Number(month)}-${Number(day)}`;
}

function formatDateTimeParts(year, month, day, hour, minute) {
  return `${formatDateParts(year, month, day)} ${pad2(hour)}:${pad2(minute)}`;
}

function datePartsInBeijing(date) {
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

  return parts;
}

function formatDateInBeijing(date) {
  const parts = datePartsInBeijing(date);
  return parts === '—' ? parts : formatDateParts(parts.year, parts.month, parts.day);
}

function formatDateTimeInBeijing(date) {
  const parts = datePartsInBeijing(date);
  return parts === '—' ? parts : formatDateTimeParts(parts.year, parts.month, parts.day, parts.hour, parts.minute);
}

function parseNaive(value) {
  return /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::\d{1,2})?(?:\.\d+)?)?$/.exec(String(value || '').trim());
}

/** 业务纯日期保持原日历日，默认显示为 YYYY-M-D。 */
export function formatBeijingDate(value) {
  if (!value) return '—';
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(String(value).trim());
  if (compact) return formatDateParts(compact[1], compact[2], compact[3]);
  const naive = parseNaive(value);
  if (naive) return formatDateParts(naive[1], naive[2], naive[3]);
  return formatDateInBeijing(new Date(value));
}

/** 明确标注为紧凑位置时，显示 M-D。 */
export function formatBeijingShortDate(value) {
  if (!value) return '—';
  const date = formatBeijingDate(value);
  const match = /^(\d+)-(\d+)-(\d+)$/.exec(date);
  return match ? `${match[2]}-${match[3]}` : date;
}

/**
 * 默认日期时间统一格式：2026-5-31 18:05。
 * 带时区的时间转换为北京时间；数据库无时区字符串按北京时间墙上时间展示。
 */
export function formatBeijingDateTime(value) {
  if (!value) return '—';
  if (value instanceof Date || typeof value === 'number') return formatDateTimeInBeijing(new Date(value));

  const text = String(value).trim();
  if (!text) return '—';

  const naive = parseNaive(text);
  if (naive) {
    const [, year, month, day, hour, minute] = naive;
    return hour === undefined ? formatDateParts(year, month, day) : formatDateTimeParts(year, month, day, hour, minute);
  }

  const zonedText = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text.replace(' ', 'T') : text;
  return formatDateTimeInBeijing(new Date(zonedText));
}

/** 明确标注为紧凑位置的日期时间：M-D HH:mm。 */
export function formatBeijingShortDateTime(value) {
  const formatted = formatBeijingDateTime(value);
  const match = /^(\d+)-(\d+)-(\d+)\s+(\d{2}:\d{2})$/.exec(formatted);
  return match ? `${match[2]}-${match[3]} ${match[4]}` : formatted;
}

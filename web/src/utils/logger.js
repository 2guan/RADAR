/**
 * 文件：utils/logger.js
 * 用途：统一前端控制台日志级别，便于生产环境按需关闭非关键输出。
 * 作者：hengguan
 */

const LEVELS = { silent: -1, error: 0, warn: 1, info: 2 };

function normalizeLogLevel(level, fallback = 'warn') {
  const normalized = String(level || fallback || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, normalized) ? normalized : fallback;
}

const currentLevel = normalizeLogLevel(import.meta.env.VITE_LOG_LEVEL);

function shouldLog(level) {
  return LEVELS[currentLevel] >= LEVELS[level];
}

export const logger = {
  info: (...args) => { if (shouldLog('info')) console.info(...args); },
  warn: (...args) => { if (shouldLog('warn')) console.warn(...args); },
  error: (...args) => { if (shouldLog('error')) console.error(...args); },
};

/**
 * 文件：lib/logger.js
 * 用途：统一运行时日志级别控制，避免生产环境被请求或初始化信息刷屏。
 * 作者：hengguan
 * 说明：LOG_LEVEL 支持 info / warn / error / silent；默认生产 info，开发 warn。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
loadEnvFile(path.join(REPO_ROOT, '.env'));

const LEVELS = { silent: -1, error: 0, warn: 1, info: 2 };
const DEFAULT_LEVEL = process.env.NODE_ENV === 'production' ? 'info' : 'warn';

export function normalizeLogLevel(level, fallback = DEFAULT_LEVEL) {
  const normalized = String(level || fallback || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, normalized) ? normalized : fallback;
}

const currentLevel = normalizeLogLevel(process.env.LOG_LEVEL);

function shouldLog(level) {
  return LEVELS[currentLevel] >= LEVELS[level];
}

export const logger = {
  info: (...args) => { if (shouldLog('info')) console.info(...args); },
  warn: (...args) => { if (shouldLog('warn')) console.warn(...args); },
  error: (...args) => { if (shouldLog('error')) console.error(...args); },
};

/**
 * 文件：server/src/platform/runtime/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：平台公共能力入口，隐藏内部实现细节。
 * 作者：hengguan
 */

/** Public runtime utilities available to platform and business modules. */
export { HttpError, ok, badRequest, unauthorized, forbidden, notFound } from './http.js';
export { parseJsonArray, parseJsonObject } from './json.js';
export { sanitizeText } from './sanitize.js';
export { logger, normalizeLogLevel } from '../observability/logger.js';
export { loadEnvFile } from './env.js';

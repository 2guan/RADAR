/**
 * 文件：server/src/platform/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：平台公共能力入口，隐藏内部实现细节。
 * 作者：hengguan
 */

/** Runtime/platform public boundary. */
export { config } from './runtime/config.js';
export { dbClient, dialect, get, all, run, exec, tx } from './persistence/index.js';

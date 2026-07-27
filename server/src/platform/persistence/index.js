/**
 * 文件：server/src/platform/persistence/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：平台公共能力入口，隐藏内部实现细节。
 * 作者：hengguan
 */

/** Public persistence platform contract. SQLite and TDSQL/MySQL remain supported. */
export { config } from '../runtime/config.js';
export { dbClient, dialect, get, all, run, exec, tx, isSqlite, isTdsql } from './engine/index.js';
export { listQuery } from './list-query.js';
export { getCodeSequenceNext, reserveCodeSequence } from './code-sequence.js';
export { getAttachmentStorageRoot } from './environment.js';
export { MODULE_CONTRACT as persistenceContract } from './contracts/index.js';

/**
 * 文件：server/src/platform/audit/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：平台公共能力入口，隐藏内部实现细节。
 * 作者：hengguan
 */

/** Public audit platform contract. */
export { auditCreate, auditUpdate, auditDelete } from './audit.js';
export { auditEvidenceChange } from './evidence.js';
export { MODULE_CONTRACT as auditContract } from './contracts/index.js';

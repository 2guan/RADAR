/**
 * 文件：server/src/modules/reporting/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

/** Public boundary: reporting is read-only and exposes no business writes. */
export { MODULE_CONTRACT as reportingContract } from './contracts/index.js';

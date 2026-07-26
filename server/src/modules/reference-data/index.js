/**
 * 文件：server/src/modules/reference-data/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

/** Public boundary: reference-data capabilities are added here before cross-module use. */
export { MODULE_CONTRACT as referenceDataContract } from './contracts/index.js';

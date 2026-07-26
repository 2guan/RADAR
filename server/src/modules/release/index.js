/**
 * 文件：server/src/modules/release/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

/** Public boundary: release currently exposes no cross-module mutable operations. */
export { buildReleaseWordDoc, formatWordDateTime } from './application/release-word.js';
export { MODULE_CONTRACT as releaseContract } from './contracts/index.js';

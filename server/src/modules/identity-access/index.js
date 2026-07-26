/**
 * 文件：server/src/modules/identity-access/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

/** Public boundary: this module currently exposes no cross-module mutable operations. */
export { MODULE_CONTRACT as identityAccessContract } from './contracts/index.js';

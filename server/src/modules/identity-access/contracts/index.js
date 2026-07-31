/**
 * 文件：server/src/modules/identity-access/contracts/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开契约与稳定数据约定。
 * 作者：hengguan
 */

/** Stable, dependency-free metadata for the identity and access boundary. */
export const MODULE_CONTRACT = Object.freeze({ module: 'identity-access', version: '1.1' });

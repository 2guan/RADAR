/**
 * 文件：server/src/modules/settings/api/routes.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块 API 兼容入口，将路由注册委托给模块实现。
 * 作者：hengguan
 */

/** Compatibility API entry; HTTP registration remains backward compatible. */
export { default } from '../routes.js';

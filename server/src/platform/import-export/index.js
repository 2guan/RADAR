/**
 * 文件：server/src/platform/import-export/index.js
 * 说明：导入、导出和简单配置 CRUD 均为跨业务模块复用的技术能力，不承载业务领域规则。
 * 用途：提供导入导出平台的唯一公开入口，避免业务模块依赖历史 lib 目录。
 * 作者：hengguan
 */

export { exportXlsx, parseXlsx } from './excel.js';
export { registerIO } from './io.js';
export { registerCrud } from './crud.js';

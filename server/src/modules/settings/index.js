/**
 * 文件：server/src/modules/settings/index.js
 * 说明：统一暴露系统设置域的参考数据与流程配置公共契约。
 * 用途：作为设置模块的跨模块访问入口，避免业务模块依赖内部子目录。
 * 作者：hengguan
 */

export * from './reference-data/index.js';
export * from './process-configuration/index.js';

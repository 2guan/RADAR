/**
 * 文件：modules/process-configuration/index.js
 * 说明：阶段内容配置模块对旧详情组件和新模块页面提供稳定的前端公开入口。
 * 用途：统一导出阶段配置的数据访问能力，避免调用方依赖模块内部文件路径。
 * 作者：hengguan
 */

export {
  invalidateStageContentData,
  loadStageContentSchema,
  loadStageContentValues,
  patchStageContentValues,
} from './api/stageContentDataCache.js';

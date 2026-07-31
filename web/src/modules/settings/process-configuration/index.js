/**
 * 文件：web/src/modules/settings/process-configuration/index.js
 * 说明：阶段内容配置模块对旧详情组件和新模块页面提供稳定的前端公开入口。
 * 用途：统一导出阶段配置的数据访问能力，避免调用方依赖模块内部文件路径。
 * 作者：hengguan
 */

export {
  invalidateStageContentData,
  loadStageContentSchema,
  loadStageContentValues,
  patchStageContentValues,
  subscribeStageContentConfigUpdated,
} from './api/stageContentDataCache.js';
export { default as StageConfiguration } from './components/StageConfiguration.jsx';
export { default as StageContentPanel } from './components/StageContentPanel.jsx';
export { default as StageBuiltinFields, StageBuiltinCatalogField, StageBuiltinField } from './components/StageBuiltinFields.jsx';
export { default as StageSectionLayout } from './components/StageSectionLayout.jsx';
export { useDefaultProcessStatus } from './hooks/useDefaultProcessStatus.js';
export { useRequiredFields } from './hooks/useRequiredFields.js';
export { useStageFormConfig } from './hooks/useStageFormConfig.js';
export { useStageListFields } from './hooks/useStageListFields.js';

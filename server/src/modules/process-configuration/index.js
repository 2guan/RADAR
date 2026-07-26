/**
 * 文件：server/src/modules/process-configuration/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

/** Public boundary: process configuration is shared through explicit methods only. */
export { MODULE_CONTRACT as processConfigurationContract } from './contracts/index.js';
export {
  defaultDictAttr, defaultProcessStatus, isIssueTerminalStatus, isTerminalStatus, refreshStatusSemantics,
} from './application/status.js';
export {
  DEFAULT_REQUIRED_FIELD_CONFIG, REQUIRED_FIELDS_CONFIG_KEY, REQUIRED_FIELD_CONFIG_MODULES, REQUIRED_FIELD_MODULES,
  assertAttachmentInputAllowed, normalizeRequiredFieldConfig,
  requiredFieldCatalogPayload, statusTypeForProcessStatus, statusTypeForReleaseApply,
  statusTypeForReleaseStatus, validateRequiredFields,
} from './application/required-fields.js';
export {
  appendStageExcelValues, appendStageListValues, assertDeliverableInputAllowed,
  assertDeliverableRemovable, deleteDeliverableDefinition, deleteFieldDefinition, deleteSection,
  extensionValuesFromExcelRow, getExtensionValues, getStageContentConfig, getStageExcelColumns,
  getStageScope, listFieldSourceOptions, listStageScopes, listStageStatuses, recordConfigRevision,
  saveDeliverableDefinition, saveExtensionValues, saveFieldDefinition, saveSection,
  seedStageContentDefaults, validateStageContent,
} from './application/stage-content.js';
export { assertStatusChangePermission } from './application/status-permission.js';
export { buildExtensionListFilter } from './application/extension-list-filter.js';

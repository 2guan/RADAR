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
} from '../../lib/status.js';
export {
  REQUIRED_FIELDS_CONFIG_KEY, assertAttachmentInputAllowed, normalizeRequiredFieldConfig,
  requiredFieldCatalogPayload, statusTypeForProcessStatus, statusTypeForReleaseApply,
  statusTypeForReleaseStatus, validateRequiredFields,
} from '../../lib/required-fields.js';
export {
  appendStageExcelValues, appendStageListValues, assertDeliverableInputAllowed,
  assertDeliverableRemovable, extensionValuesFromExcelRow, getStageExcelColumns,
  saveExtensionValues, validateStageContent,
} from '../../lib/stage-content.js';
export { assertStatusChangePermission } from '../../lib/status-permission.js';

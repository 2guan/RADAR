/**
 * 文件：server/src/shared/workflow/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：RADAR 后端业务或平台逻辑。
 * 作者：hengguan
 */

/** Public workflow configuration and validation boundary. */
export {
  validateRequiredFields,
  assertAttachmentInputAllowed,
  statusTypeForProcessStatus,
  statusTypeForReleaseApply,
} from '../../modules/process-configuration/index.js';
export {
  getStageContentConfig,
  validateStageContent,
  assertDeliverableInputAllowed,
  assertDeliverableRemovable,
} from '../../modules/process-configuration/index.js';
export { assertStatusChangePermission } from '../../modules/process-configuration/index.js';

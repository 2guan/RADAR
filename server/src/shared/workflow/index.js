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
} from '../../lib/required-fields.js';
export {
  getStageContentConfig,
  validateStageContent,
  assertDeliverableInputAllowed,
  assertDeliverableRemovable,
} from '../../lib/stage-content.js';
export { assertStatusChangePermission } from '../../lib/status-permission.js';

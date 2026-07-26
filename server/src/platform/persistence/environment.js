/**
 * 文件：server/src/platform/persistence/environment.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：RADAR 后端业务或平台逻辑。
 * 作者：hengguan
 */

import { config } from '../../config.js';

/** Internal platform-only storage root accessor. Business modules use attachment APIs instead. */
export function getAttachmentStorageRoot() {
  return config.attachmentDir;
}

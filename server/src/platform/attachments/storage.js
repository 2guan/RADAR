/**
 * 文件：server/src/platform/attachments/storage.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：RADAR 后端业务或平台逻辑。
 * 作者：hengguan
 */

import path from 'node:path';
import { getAttachmentStorageRoot } from '../persistence/index.js';

/**
 * Resolve an attachment-relative path without exposing the storage root.
 * Rejecting traversal keeps callers from escaping the configured attachment directory.
 */
export function resolveAttachmentPath(relativePath = '') {
  const root = path.resolve(getAttachmentStorageRoot());
  const target = path.resolve(root, String(relativePath || ''));
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('附件路径超出受控存储目录');
  }
  return target;
}

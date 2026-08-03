/**
 * 文件：server/src/platform/attachments/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：平台公共能力入口，隐藏内部实现细节。
 * 作者：hengguan
 */

/** Public attachment and signature platform contract. */
export {
  saveFile, savePath, saveFileVersion, savePathVersion,
  listByEntity, listAttachmentVersions, getCurrentAttachment, getViewableAttachment, countByFields, removeAttachment, attachmentView, checkExt,
} from './attachment.js';
export {
  decodeSignatureDataUrl, saveSignatureFile, removeSignatureFile, signatureDataUrl,
} from './signature.js';
export { authorizeEntity, resolveEntityAccess } from '../auth/index.js';
export { resolveAttachmentPath } from './storage.js';
export { createPreviewSession, isPreviewableAttachment, previewAllowedExtensions, previewAvailability, verifyPreviewSignature } from './preview.js';
export { MODULE_CONTRACT as attachmentsContract } from './contracts/index.js';

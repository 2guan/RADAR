/**
 * 文件：server/src/platform/attachments/attachment.js
 * 说明：附件以逻辑交付项组织不可变版本；常规读取仅返回当前未删除版本。
 * 用途：统一附件的存储、版本、软删除与安全展示辅助。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';
import { beijingCompactDateString } from '../../shared/utils/time.js';
import { randomBytes } from 'node:crypto';
import { all, config, get, run, tx } from '../persistence/index.js';
import { badRequest, notFound } from '../runtime/index.js';

/** 校验扩展名是否在白名单。 */
export function checkExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (!config.upload.allowedExt.includes(ext)) throw badRequest(`不支持的文件类型：${ext || '未知'}`);
  return ext;
}

function logicalItemId() {
  return `attgrp_${randomBytes(12).toString('hex')}`;
}

function maskPhone(value) {
  const phone = String(value || '').trim();
  if (!phone) return null;
  if (phone.length <= 4) return '****';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

/** 手机号绝不以明文作为附件接口响应的一部分返回。 */
export function attachmentView(row) {
  if (!row) return row;
  const { uploader_phone, ...rest } = row;
  return {
    ...rest,
    uploader_name: row.uploader_name || row.uploader || null,
    uploader_phone_masked: maskPhone(uploader_phone),
  };
}

function saveBuffer(entityType, filename, buffer) {
  checkExt(filename);
  const subDir = path.join(entityType, beijingCompactDateString().slice(0, 6));
  const absDir = path.join(config.attachmentDir, subDir);
  fs.mkdirSync(absDir, { recursive: true });
  const safeName = path.basename(filename).replace(/[/\\?%*:|"<>]/g, '_');
  const storedName = `${randomBytes(8).toString('hex')}_${safeName}`;
  const relPath = path.join(subDir, storedName);
  const absolutePath = path.join(config.attachmentDir, relPath);
  fs.writeFileSync(absolutePath, buffer);
  return { safeName, relPath, absolutePath };
}

async function insertFile({ entityType, entityId, fieldKey, deliverableId, filename, storedPath, size, logicalId, versionNo, uploaderName, uploaderPhone }) {
  const res = await run(
    `INSERT INTO attachment
       (entity_type, entity_id, field_key, deliverable_id, kind, filename, stored_path, size,
        uploader, uploader_name, uploader_phone, logical_item_id, version_no, is_current, is_deleted)
     VALUES (?,?,?,?, 'file', ?,?,?,?,?,?,?,?, 1, 0)`,
    entityType, entityId, fieldKey, deliverableId, filename, storedPath, size,
    uploaderName, uploaderName, uploaderPhone || null, logicalId, versionNo,
  );
  return await get('SELECT * FROM attachment WHERE id = ?', res.lastInsertRowid);
}

async function insertPath({ entityType, entityId, fieldKey, deliverableId, pathText, logicalId, versionNo, uploaderName, uploaderPhone }) {
  const res = await run(
    `INSERT INTO attachment
       (entity_type, entity_id, field_key, deliverable_id, kind, path_text,
        uploader, uploader_name, uploader_phone, logical_item_id, version_no, is_current, is_deleted)
     VALUES (?, ?, ?, ?, 'path', ?, ?, ?, ?, ?, ?, 1, 0)`,
    entityType, entityId, fieldKey, deliverableId, pathText,
    uploaderName, uploaderName, uploaderPhone || null, logicalId, versionNo,
  );
  return await get('SELECT * FROM attachment WHERE id = ?', res.lastInsertRowid);
}

/** 保存一个新的逻辑交付项首版。 */
export async function saveFile({ entityType, entityId, fieldKey, deliverableId = null, filename, buffer, uploader, uploaderName, uploaderPhone }) {
  const stored = saveBuffer(entityType, filename, buffer);
  try {
    return await insertFile({
      entityType, entityId, fieldKey, deliverableId, filename: stored.safeName, storedPath: stored.relPath, size: buffer.length,
      logicalId: logicalItemId(), versionNo: 1, uploaderName: uploaderName || uploader || null, uploaderPhone,
    });
  } catch (error) {
    try { fs.unlinkSync(stored.absolutePath); } catch { /* 失败时尽力清理孤儿文件 */ }
    throw error;
  }
}

/** 保存一个新的路径型逻辑交付项首版。 */
export async function savePath({ entityType, entityId, fieldKey, deliverableId = null, pathText, uploader, uploaderName, uploaderPhone }) {
  if (!String(pathText || '').trim()) throw badRequest('路径不能为空');
  return await insertPath({
    entityType, entityId, fieldKey, deliverableId, pathText: String(pathText).trim(),
    logicalId: logicalItemId(), versionNo: 1, uploaderName: uploaderName || uploader || null, uploaderPhone,
  });
}

/** 读取某实体常规列表：每个逻辑项仅返回当前未删除版本。 */
export async function listByEntity(entityType, entityId) {
  const rows = await all(
    `SELECT * FROM attachment
      WHERE entity_type = ? AND entity_id = ? AND is_current = 1 AND is_deleted = 0
      ORDER BY field_key, id`,
    entityType, entityId,
  );
  return rows.map(attachmentView);
}

/** 读取某逻辑项的所有版本，仅由已完成实体授权的路由调用。 */
export async function listAttachmentVersions(logicalId) {
  const rows = await all('SELECT * FROM attachment WHERE logical_item_id = ? ORDER BY version_no DESC', logicalId);
  return rows.map(attachmentView);
}

/** 查询当前可见附件，不把历史版本作为可操作目标。 */
export async function getCurrentAttachment(id) {
  return await get('SELECT * FROM attachment WHERE id = ? AND is_current = 1 AND is_deleted = 0', id);
}

/** 查询未删除的指定版本，供历史版本的受授权下载与预览使用。 */
export async function getViewableAttachment(id) {
  return await get('SELECT * FROM attachment WHERE id = ? AND is_deleted = 0', id);
}

/** 统计当前可见附件数量，用于终态交付校验。 */
export async function countByFields(entityType, entityId, fieldKeys) {
  if (!fieldKeys?.length) return 0;
  const row = await get(
    `SELECT COUNT(*) AS c FROM attachment
      WHERE entity_type = ? AND entity_id = ? AND is_current = 1 AND is_deleted = 0
        AND field_key IN (${fieldKeys.map(() => '?').join(',')})`,
    entityType, entityId, ...fieldKeys,
  );
  return row?.c ?? 0;
}

async function currentVersionForUpdate(id, expectedKind = null) {
  const current = await get('SELECT * FROM attachment WHERE id = ? AND is_current = 1 AND is_deleted = 0', id);
  if (!current) throw notFound('当前交付件不存在或已更新');
  if (expectedKind && current.kind !== expectedKind) throw badRequest(`只能更新${expectedKind === 'file' ? '文件型' : '路径型'}交付件`);
  return current;
}

/** 对当前文件项创建下一不可变版本；事务确保版本号与当前标识同步切换。 */
export async function saveFileVersion({ id, filename, buffer, uploaderName, uploaderPhone, onCreated }) {
  checkExt(filename);
  let stored;
  try {
    return await tx(async () => {
      const current = await currentVersionForUpdate(id, 'file');
      stored = saveBuffer(current.entity_type, filename, buffer);
      await run('UPDATE attachment SET is_current = 0 WHERE logical_item_id = ? AND is_current = 1 AND is_deleted = 0', current.logical_item_id);
      const created = await insertFile({
        entityType: current.entity_type, entityId: current.entity_id, fieldKey: current.field_key, deliverableId: current.deliverable_id,
        filename: stored.safeName, storedPath: stored.relPath, size: buffer.length,
        logicalId: current.logical_item_id, versionNo: Number(current.version_no) + 1, uploaderName, uploaderPhone,
      });
      if (onCreated) await onCreated(created, current);
      return created;
    });
  } catch (error) {
    if (stored?.absolutePath) { try { fs.unlinkSync(stored.absolutePath); } catch { /* 尽力清理 */ } }
    throw error;
  }
}

/** 对当前路径项创建下一不可变版本。 */
export async function savePathVersion({ id, pathText, uploaderName, uploaderPhone, onCreated }) {
  if (!String(pathText || '').trim()) throw badRequest('路径不能为空');
  return await tx(async () => {
    const current = await currentVersionForUpdate(id, 'path');
    await run('UPDATE attachment SET is_current = 0 WHERE logical_item_id = ? AND is_current = 1 AND is_deleted = 0', current.logical_item_id);
    const created = await insertPath({
      entityType: current.entity_type, entityId: current.entity_id, fieldKey: current.field_key, deliverableId: current.deliverable_id,
      pathText: String(pathText).trim(), logicalId: current.logical_item_id, versionNo: Number(current.version_no) + 1,
      uploaderName, uploaderPhone,
    });
    if (onCreated) await onCreated(created, current);
    return created;
  });
}

/** 软删除整条逻辑交付项；历史记录与物理文件均保留。 */
export async function removeAttachment(id, { onRemoved } = {}) {
  return await tx(async () => {
    const current = await currentVersionForUpdate(id);
    await run('UPDATE attachment SET is_deleted = 1 WHERE logical_item_id = ?', current.logical_item_id);
    if (onRemoved) await onRemoved(current);
    return current;
  });
}

/**
 * 文件：lib/attachment.js
 * 用途：附件存储与查询辅助。文件按 实体类型/年月 分目录落盘，记录入 attachment 表；
 *       同时支持"填写路径"形式的附件。提供按实体+字段读取、统计校验等。
 * 作者：hengguan
 * 说明：文件名做安全清洗，存储名加随机前缀防冲突；下载时回读相对路径。
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { all, get, run } from '../db/index.js';
import { badRequest } from './http.js';

/** 校验扩展名是否在白名单 */
export function checkExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  if (!config.upload.allowedExt.includes(ext)) {
    throw badRequest(`不支持的文件类型：${ext || '未知'}`);
  }
  return ext;
}

/**
 * 保存上传文件到磁盘并登记。
 * @returns {object} 附件记录
 */
export async function saveFile({ entityType, entityId, fieldKey, filename, buffer, uploader }) {
  checkExt(filename);
  const d = new Date();
  const subDir = path.join(entityType, `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  const absDir = path.join(config.attachmentDir, subDir);
  fs.mkdirSync(absDir, { recursive: true });

  const safeName = path.basename(filename).replace(/[/\\?%*:|"<>]/g, '_');
  const storedName = `${randomBytes(8).toString('hex')}_${safeName}`;
  const relPath = path.join(subDir, storedName);
  fs.writeFileSync(path.join(config.attachmentDir, relPath), buffer);

  const res = await run(
    `INSERT INTO attachment (entity_type, entity_id, field_key, kind, filename, stored_path, size, uploader)
     VALUES (?,?,?, 'file', ?,?,?,?)`,
    entityType, entityId, fieldKey, safeName, relPath, buffer.length, uploader,
  );
  return await get('SELECT * FROM attachment WHERE id = ?', res.lastInsertRowid);
}

/**
 * 登记一条"路径型"附件。
 */
export async function savePath({ entityType, entityId, fieldKey, pathText, uploader }) {
  if (!pathText) throw badRequest('路径不能为空');
  const res = await run(
    `INSERT INTO attachment (entity_type, entity_id, field_key, kind, path_text, uploader)
     VALUES (?,?,?, 'path', ?, ?)`,
    entityType, entityId, fieldKey, pathText, uploader,
  );
  return await get('SELECT * FROM attachment WHERE id = ?', res.lastInsertRowid);
}

/** 读取某实体的全部附件 */
export async function listByEntity(entityType, entityId) {
  return await all(
    'SELECT * FROM attachment WHERE entity_type = ? AND entity_id = ? ORDER BY field_key, id',
    entityType, entityId,
  );
}

/** 统计某实体在指定字段集合下的附件数量（用于终态校验） */
export async function countByFields(entityType, entityId, fieldKeys) {
  if (!fieldKeys?.length) return 0;
  const row = await get(
    `SELECT COUNT(*) AS c FROM attachment WHERE entity_type = ? AND entity_id = ? AND field_key IN (${fieldKeys.map(() => '?').join(',')})`,
    entityType, entityId, ...fieldKeys,
  );
  return row?.c ?? 0;
}

/** 删除一条附件（同时删除磁盘文件） */
export async function removeAttachment(id) {
  const a = await get('SELECT * FROM attachment WHERE id = ?', id);
  if (!a) return;
  if (a.kind === 'file' && a.stored_path) {
    const abs = path.join(config.attachmentDir, a.stored_path);
    if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch { /* 忽略磁盘删除异常 */ } }
  }
  await run('DELETE FROM attachment WHERE id = ?', id);
}

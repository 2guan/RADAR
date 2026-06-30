/**
 * 文件：lib/signature.js
 * 用途：电子签名图片的存取辅助。解析前端 base64 DataURL、落盘存储、回读为 DataURL 供内嵌展示。
 * 作者：hengguan
 * 说明：签名按 signatures/<user_id>/ 分目录落盘；仅接受 PNG/JPEG，限制体积，文件名加随机前缀防冲突。
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { badRequest } from './http.js';

const SIG_SUBDIR = 'signatures';

/** 解析 data:image/(png|jpeg);base64,xxx，返回 { ext, buffer } */
export function decodeSignatureDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) throw badRequest('签名图片格式不正确（需 PNG/JPEG 的 base64 DataURL）');
  const ext = m[1].toLowerCase().startsWith('png') ? 'png' : 'jpg';
  const buffer = Buffer.from(m[2], 'base64');
  if (!buffer.length) throw badRequest('签名内容为空');
  if (buffer.length > config.signature.maxBytes) throw badRequest(`签名图片过大（上限 ${Math.round(config.signature.maxBytes / 1024 / 1024)}MB）`);
  return { ext, buffer };
}

/** 落盘保存签名文件，返回相对 attachments 的路径 */
export function saveSignatureFile(userId, buffer, ext) {
  const subDir = path.join(SIG_SUBDIR, String(userId));
  fs.mkdirSync(path.join(config.attachmentDir, subDir), { recursive: true });
  const storedName = `${randomBytes(8).toString('hex')}.${ext}`;
  const relPath = path.join(subDir, storedName);
  fs.writeFileSync(path.join(config.attachmentDir, relPath), buffer);
  return relPath;
}

/** 删除签名文件（忽略不存在/异常） */
export function removeSignatureFile(storedPath) {
  if (!storedPath) return;
  const abs = path.join(config.attachmentDir, storedPath);
  if (fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch { /* 忽略 */ } }
}

/** 读取签名文件并转为可内嵌的 DataURL；文件缺失返回 null */
export function signatureDataUrl(storedPath) {
  if (!storedPath) return null;
  const abs = path.join(config.attachmentDir, storedPath);
  if (!fs.existsSync(abs)) return null;
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${fs.readFileSync(abs).toString('base64')}`;
}

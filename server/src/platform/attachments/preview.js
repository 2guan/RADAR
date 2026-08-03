/**
 * 文件：server/src/platform/attachments/preview.js
 * 说明：预览会话为当前或未删除历史文件版本生成短时 HMAC 签名的文件地址，并包装为 kkFileView URL。
 * 用途：避免浏览器或 kkFileView 获得可复用的附件目录/永久下载地址。
 * 作者：hengguan
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { all, config } from '../persistence/index.js';
import { badRequest, forbidden, notFound } from '../runtime/index.js';

const PREVIEW_ENABLED_KEY = 'deliverable.preview.enabled';
const PREVIEW_BASE_URL_KEY = 'deliverable.preview.kkFileViewBaseUrl';

/** 有效上传后缀同时决定附件的受控 kkFileView 预览范围。 */
export function previewAllowedExtensions() {
  return [...config.upload.allowedExt];
}

export function isPreviewableAttachment(attachment) {
  return attachment?.kind === 'file' && previewAllowedExtensions().includes(path.extname(attachment.filename || '').toLowerCase());
}

function signatureFor(attachmentId, expiresAt) {
  return crypto
    .createHmac('sha256', config.jwt.secret)
    .update(`attachment-preview:${attachmentId}:${expiresAt}`)
    .digest('base64url');
}

function parseBoolean(value) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return null;
}

function normalizedConfiguredBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    if (!config.preview.kkFileViewAllowedOrigins.includes(url.origin)) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function normalizedSourceBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

/**
 * 有效配置仅由平台读取 app_config 与运行时回退值组合得出。
 * settings 仅负责受权限保护的写入/展示，避免平台模块反向依赖业务模块。
 */
async function effectivePreviewSettings() {
  const rows = await all('SELECT key, value FROM app_config WHERE key IN (?,?)', PREVIEW_ENABLED_KEY, PREVIEW_BASE_URL_KEY);
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const savedEnabled = parseBoolean(values.get(PREVIEW_ENABLED_KEY));
  const configuredEnabled = savedEnabled == null ? config.preview.enabledFallback : savedEnabled;
  const baseUrl = normalizedConfiguredBaseUrl(
    String(values.get(PREVIEW_BASE_URL_KEY) || '').trim() || config.preview.kkFileViewBaseUrlFallback,
  );
  const sourceBaseUrl = normalizedSourceBaseUrl(config.preview.attachmentSourceBaseUrl);
  return {
    enabled: Boolean(configuredEnabled && baseUrl && sourceBaseUrl),
    baseUrl,
    sourceBaseUrl,
    ttlSeconds: Math.max(30, Math.min(Number(config.preview.sessionTtlSeconds) || 300, 900)),
  };
}

export async function previewAvailability() {
  const settings = await effectivePreviewSettings();
  return settings.enabled;
}

export function verifyPreviewSignature(attachmentId, expiresAt, signature) {
  const expires = Number(expiresAt);
  if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
  const expected = signatureFor(attachmentId, expires);
  const actual = Buffer.from(String(signature || ''));
  const target = Buffer.from(expected);
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

function controlledSourceUrl(sourceBaseUrl, attachment, expiresAt, signature) {
  const endpoint = new URL(`${sourceBaseUrl}/api/attachments/${attachment.id}/preview-file`);
  endpoint.searchParams.set('expires', String(expiresAt));
  endpoint.searchParams.set('signature', signature);
  // kkFileView 根据该参数识别流式文件的后缀；真实文件名仍由服务端 Content-Disposition 给出。
  endpoint.searchParams.set('fullfilename', attachment.filename || `attachment-${attachment.id}`);
  return endpoint.toString();
}

/**
 * 预览 iframe 使用同源绝对路径，兼容内网 IP/HTTP 与外网域名/HTTPS 的同一反向代理路径。
 * 服务地址只提供受校验的路径基线，不能将其 Origin 回传给浏览器。
 */
function controlledPreviewPath(baseUrl, encodedSourceUrl) {
  const configuredPath = new URL(baseUrl).pathname.replace(/\/+$/, '');
  const previewPath = configuredPath ? `${configuredPath}/onlinePreview` : '/onlinePreview';
  return `${previewPath}?url=${encodeURIComponent(encodedSourceUrl)}`;
}

/** 创建仅供未删除 Office/PDF 文件版本使用的预览会话。 */
export async function createPreviewSession(attachment) {
  if (!attachment || attachment.is_deleted !== 0) throw notFound('交付件版本不存在');
  if (!isPreviewableAttachment(attachment)) throw badRequest('该文件类型暂不支持在线预览');
  const settings = await effectivePreviewSettings();
  if (!settings.enabled) throw forbidden('交付件预览服务未启用或配置不完整');

  const expiresAt = Math.floor(Date.now() / 1000) + settings.ttlSeconds;
  const signature = signatureFor(attachment.id, expiresAt);
  const sourceUrl = controlledSourceUrl(settings.sourceBaseUrl, attachment, expiresAt, signature);
  const encodedSourceUrl = Buffer.from(sourceUrl, 'utf8').toString('base64');
  const previewUrl = controlledPreviewPath(settings.baseUrl, encodedSourceUrl);
  return { previewUrl, expiresAt };
}

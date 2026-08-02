/**
 * 文件：server/src/modules/settings/application/deliverable-preview-settings.js
 * 说明：交付件预览的有效配置由系统设置优先、部署环境回退组成；地址校验统一在此处完成。
 * 用途：为附件平台提供受控的 kkFileView 配置读取契约，避免它直接读取 app_config。
 * 作者：hengguan
 */

import { all, get, config } from '../../../platform/persistence/index.js';
import { badRequest } from '../../../platform/runtime/index.js';

export const DELIVERABLE_PREVIEW_ENABLED_KEY = 'deliverable.preview.enabled';
export const DELIVERABLE_PREVIEW_BASE_URL_KEY = 'deliverable.preview.kkFileViewBaseUrl';
export const DELIVERABLE_PREVIEW_CONFIG_KEYS = Object.freeze([
  DELIVERABLE_PREVIEW_ENABLED_KEY,
  DELIVERABLE_PREVIEW_BASE_URL_KEY,
]);

function parseBoolean(value) {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return null;
}

/** 规范化服务根地址，保留反向代理路径但拒绝认证信息、查询和片段。 */
export function normalizeKkFileViewBaseUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw badRequest('kkFileView 服务地址格式不正确'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw badRequest('kkFileView 服务地址必须是无认证信息、查询参数和片段的 HTTP(S) 地址');
  }
  if (!config.preview.kkFileViewAllowedOrigins.includes(url.origin)) {
    throw badRequest('kkFileView 服务地址不在部署允许 Origin 清单内');
  }
  return url.toString().replace(/\/$/, '');
}

function normalizeSourceBaseUrl(value) {
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

async function readPreviewRows() {
  const rows = await all(
    `SELECT key, value FROM app_config WHERE key IN (${DELIVERABLE_PREVIEW_CONFIG_KEYS.map(() => '?').join(',')})`,
    ...DELIVERABLE_PREVIEW_CONFIG_KEYS,
  );
  return new Map(rows.map((row) => [row.key, row.value]));
}

/**
 * 平台附件使用的有效配置。地址与来源均不合法时保持禁用，不以不安全的默认值继续服务。
 */
export async function getDeliverablePreviewSettings() {
  const values = await readPreviewRows();
  const savedEnabled = parseBoolean(values.get(DELIVERABLE_PREVIEW_ENABLED_KEY));
  const enabled = savedEnabled == null ? config.preview.enabledFallback : savedEnabled;
  const rawBaseUrl = String(values.get(DELIVERABLE_PREVIEW_BASE_URL_KEY) || '').trim()
    || config.preview.kkFileViewBaseUrlFallback;

  let baseUrl = '';
  try { baseUrl = normalizeKkFileViewBaseUrl(rawBaseUrl); } catch { baseUrl = ''; }
  const sourceBaseUrl = normalizeSourceBaseUrl(config.preview.attachmentSourceBaseUrl);
  return {
    enabled: Boolean(enabled && baseUrl && sourceBaseUrl),
    configuredEnabled: enabled,
    baseUrl,
    sourceBaseUrl,
    ttlSeconds: Math.max(30, Math.min(Number(config.preview.sessionTtlSeconds) || 300, 900)),
  };
}

/** 保存前校验本次提交与部署回退组合出的有效配置。 */
export function validateDeliverablePreviewSettings(items) {
  const hasEnabled = Object.hasOwn(items, DELIVERABLE_PREVIEW_ENABLED_KEY);
  const hasBaseUrl = Object.hasOwn(items, DELIVERABLE_PREVIEW_BASE_URL_KEY);
  if (!hasEnabled && !hasBaseUrl) return;

  const enabled = hasEnabled ? parseBoolean(items[DELIVERABLE_PREVIEW_ENABLED_KEY]) : null;
  if (hasEnabled && enabled == null) throw badRequest('交付件预览开关仅支持 true 或 false');
  const baseUrl = hasBaseUrl ? String(items[DELIVERABLE_PREVIEW_BASE_URL_KEY] || '').trim() : '';
  if (baseUrl) normalizeKkFileViewBaseUrl(baseUrl);
  if (enabled === true && !baseUrl && !config.preview.kkFileViewBaseUrlFallback) {
    throw badRequest('启用交付件预览前，请填写 kkFileView 服务地址或配置环境回退地址');
  }
}

/** 设置页展示环境回退值，但不暴露 Origin 清单与 RADAR 内部来源地址。 */
export function withEffectiveDeliverablePreviewConfig(rows) {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const ensure = (key, value, remark) => {
    const current = byKey.get(key);
    if (current && String(current.value || '').trim()) return;
    byKey.set(key, { key, value, remark });
  };
  ensure(
    DELIVERABLE_PREVIEW_ENABLED_KEY,
    config.preview.enabledFallback ? 'true' : 'false',
    '交付件在线预览开关（默认关闭；未保存时使用部署环境回退值）',
  );
  ensure(
    DELIVERABLE_PREVIEW_BASE_URL_KEY,
    config.preview.kkFileViewBaseUrlFallback || '',
    'kkFileView 服务地址（未填写时使用部署环境回退值）',
  );
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** 便于迁移/种子验证稳定键已存在。 */
export async function hasDeliverablePreviewSettings() {
  const row = await get('SELECT COUNT(*) AS count FROM app_config WHERE key IN (?,?)', ...DELIVERABLE_PREVIEW_CONFIG_KEYS);
  return Number(row?.count || 0) === DELIVERABLE_PREVIEW_CONFIG_KEYS.length;
}

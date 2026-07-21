/**
 * 文件：modules/settings/routes.js
 * 用途：平台配置接口。读取/保存平台信息与编号规则（app_config 键值表），
 *       并提供无需登录的公开配置（平台名称、主题色等，供登录页与网页标题使用）。
 * 作者：hengguan
 * 说明：支持公开访问的 public 配置获取，以及需进行鉴权的 app-config 获取与修改。
 */

import { all, get, run, tx } from '../../db/index.js';
import { config } from '../../config.js';
import { ok, badRequest } from '../../lib/http.js';
import { triggerIssueSyncSchedule } from '../../lib/issue-sync-scheduler.js';
import {
  REQUIRED_FIELDS_CONFIG_KEY,
  normalizeRequiredFieldConfig,
  requiredFieldCatalogPayload,
} from '../../lib/required-fields.js';

// 允许写入的配置键白名单
const WRITABLE_KEYS = new Set([
  'platform.name', 'platform.shortName', 'platform.fullName', 'platform.copyright', 'platform.themeColor',
  'code.requirement', 'code.dev', 'code.test.SIT', 'code.test.UAT', 'code.test.NFT', 'code.test.SEC',
  'code.release_apply',
  'release.signoffRoles', 'appearance.preset',
  REQUIRED_FIELDS_CONFIG_KEY,
  'security.password.complexity', 'security.password.minLength', 'security.password.expireDays',
  'security.lockout.enabled', 'security.lockout.maxAttempts', 'security.lockout.durationMinutes',
  'issue.sync.baseUrl', 'issue.sync.apiKey', 'issue.sync.overviewApi', 'issue.sync.detailApi',
  'issue.sync.enabled', 'issue.sync.scheduleMode', 'issue.sync.dailyTime', 'issue.sync.interval',
]);

// 公开可读的键（无需登录）
const PUBLIC_KEYS = [
  'platform.name', 'platform.shortName', 'platform.fullName', 'platform.copyright', 'platform.themeColor',
  'appearance.preset',
];

/** 读取若干键为对象 */
async function readKeys(keys) {
  const out = {};
  for (const k of keys) {
    const row = await get('SELECT value FROM app_config WHERE key = ?', k);
    out[k] = row?.value ?? null;
  }
  return out;
}

/**
 * 设置页展示问题工具的“有效值”：优先使用已保存的系统配置，空值回退部署环境变量。
 * 这样管理员能够看到当前实际生效的地址与 API Key，而无需重复配置环境变量中的值。
 */
function withEffectiveIssueToolConfig(rows) {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const ensureValue = (key, fallback, remark) => {
    const row = byKey.get(key);
    if (row && String(row.value || '').trim()) return;
    const next = { key, value: fallback || '', remark: row?.remark || remark };
    byKey.set(key, next);
  };
  ensureValue('issue.sync.baseUrl', config.pams.baseUrl, '问题工具地址（为空时使用部署环境变量 PAMS_BASE_URL）');
  ensureValue('issue.sync.apiKey', config.pams.apiKey, '问题工具 API Key（为空时使用部署环境变量 PAMS_API_KEY）');
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function asEnabled(value) {
  return value === true || value === 'true' || value === '1' || value === 1;
}

/** 校验问题同步设置，避免无效时间策略或未配置连接时持续触发失败任务。 */
function validateSchedule(items, prefix, label) {
  const key = (name) => `${prefix}.${name}`;
  const mode = items[key('scheduleMode')] || 'daily';
  if (!['daily', 'hours', 'minutes'].includes(mode)) throw badRequest(`${label}周期类型非法`);
  const dailyTime = String(items[key('dailyTime')] || '02:00');
  const timeMatch = /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(dailyTime);
  if (mode === 'daily' && !timeMatch) throw badRequest(`${label}每日时间须为 HH:mm 格式`);
  const interval = Number.parseInt(items[key('interval')], 10);
  if ((mode === 'hours' || mode === 'minutes') && (!Number.isInteger(interval) || interval < 1 || interval > 10080)) {
    throw badRequest(`${label}间隔须为 1 至 10080 的整数`);
  }
}

function validateIssueSyncSettings(items) {
  const hasIssueSyncSetting = Object.keys(items).some((key) => key.startsWith('issue.sync.'));
  if (!hasIssueSyncSetting) return;
  validateSchedule(items, 'issue.sync.overview', '问题概述同步');
  validateSchedule(items, 'issue.sync', '问题详情同步');
  if (asEnabled(items['issue.sync.enabled']) || asEnabled(items['issue.sync.overview.enabled'])) {
    const baseUrl = String(items['issue.sync.baseUrl'] || config.pams.baseUrl || '').trim();
    const apiKey = String(items['issue.sync.apiKey'] || config.pams.apiKey || '').trim();
    if (!baseUrl || !apiKey) throw badRequest('启用定时同步前，请配置问题工具地址和 API Key');
    try { new URL(baseUrl); } catch { throw badRequest('问题工具地址格式不正确'); }
  }
}

export default async function settingsRoutes(fastify) {
  // 公开配置（登录页/网页标题用，无需鉴权）
  fastify.get('/settings/public', async () => ok(await readKeys(PUBLIC_KEYS)));

  // 全部配置
  fastify.get('/settings/app-config', { preHandler: fastify.requirePerm('settings', 'view') }, async () => {
    const rows = await all('SELECT key, value, remark FROM app_config ORDER BY key');
    return ok(withEffectiveIssueToolConfig(rows));
  });

  // 检查内容配置：业务表单也需要读取，因此只要求登录，不要求系统设置权限
  fastify.get('/settings/required-fields', { preHandler: fastify.authenticate }, async () => ok(await requiredFieldCatalogPayload()));

  // 保存检查内容配置
  fastify.put('/settings/required-fields', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    const config = normalizeRequiredFieldConfig(request.body?.config || {});
    await run(
      `INSERT INTO app_config (key, value, remark) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')`,
      REQUIRED_FIELDS_CONFIG_KEY,
      JSON.stringify(config),
      '检查内容配置（JSON）',
    );
    return ok(config, '配置已保存');
  });

  // 批量保存配置
  fastify.put('/settings/app-config', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    const items = request.body?.items || {};
    validateIssueSyncSettings(items);
    await tx(async () => {
      for (const [key, value] of Object.entries(items)) {
        if (!WRITABLE_KEYS.has(key)) continue;
        await run(
          `INSERT INTO app_config (key, value) VALUES (?,?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')`,
          key, value,
        );
      }
    });
    if (Object.keys(items).some((key) => key.startsWith('issue.sync.'))) {
      triggerIssueSyncSchedule().catch(() => {});
    }
    return ok(null, '配置已保存');
  });
}

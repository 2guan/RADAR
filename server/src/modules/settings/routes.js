/**
 * 文件：modules/settings/routes.js
 * 用途：平台配置接口。读取/保存平台信息与编号规则（app_config 键值表），
 *       并提供无需登录的公开配置（平台名称、主题色等，供登录页与网页标题使用）。
 * 作者：hengguan
 * 说明：支持公开访问的 public 配置获取，以及需进行鉴权的 app-config 获取与修改。
 */

import { all, get, run, tx } from '../../db/index.js';
import { ok } from '../../lib/http.js';

// 允许写入的配置键白名单
const WRITABLE_KEYS = new Set([
  'platform.name', 'platform.shortName', 'platform.fullName', 'platform.copyright', 'platform.themeColor',
  'code.requirement', 'code.dev', 'code.test.SIT', 'code.test.UAT', 'code.test.NFT', 'code.test.SEC',
  'release.signoffRoles', 'appearance.preset',
  'security.password.complexity', 'security.password.minLength', 'security.password.expireDays',
  'security.lockout.enabled', 'security.lockout.maxAttempts', 'security.lockout.durationMinutes',
]);

// 公开可读的键（无需登录）
const PUBLIC_KEYS = [
  'platform.name', 'platform.shortName', 'platform.fullName', 'platform.copyright', 'platform.themeColor',
  'appearance.preset',
];

/** 读取若干键为对象 */
function readKeys(keys) {
  const out = {};
  for (const k of keys) {
    const row = get('SELECT value FROM app_config WHERE key = ?', k);
    out[k] = row?.value ?? null;
  }
  return out;
}

export default async function settingsRoutes(fastify) {
  // 公开配置（登录页/网页标题用，无需鉴权）
  fastify.get('/settings/public', async () => ok(readKeys(PUBLIC_KEYS)));

  // 全部配置
  fastify.get('/settings/app-config', { preHandler: fastify.requirePerm('settings', 'view') }, async () => {
    const rows = all('SELECT key, value, remark FROM app_config ORDER BY key');
    return ok(rows);
  });

  // 批量保存配置
  fastify.put('/settings/app-config', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    const items = request.body?.items || {};
    tx(() => {
      for (const [key, value] of Object.entries(items)) {
        if (!WRITABLE_KEYS.has(key)) continue;
        run(
          `INSERT INTO app_config (key, value) VALUES (?,?)
           ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now','localtime')`,
          key, value,
        );
      }
    });
    return ok(null, '配置已保存');
  });
}

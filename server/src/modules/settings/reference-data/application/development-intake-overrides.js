/**
 * 文件：server/src/modules/settings/reference-data/application/development-intake-overrides.js
 * 说明：开发承接的临时实施方预填规则归系统设置所有，并通过语义化公开契约供开发模块读取。
 * 用途：规范化系统设置中的机构白名单；配置清空后即可停用，不需要改动开发业务代码或历史任务。
 * 作者：hengguan
 */

import { get } from '../../../../platform/persistence/index.js';
import { badRequest } from '../../../../platform/runtime/index.js';
import { resolveExistingDictAttr } from './resolver.js';

export const DEVELOPMENT_INTAKE_IMPLEMENTATION_ORG_OVERRIDE_CONFIG_KEY = 'development.intake.implementation_org_override_orgs';
const MAX_OVERRIDE_ORGS = 20;

function parseOrganizationList(value, { strict }) {
  try {
    const parsed = JSON.parse(String(value ?? ''));
    if (!Array.isArray(parsed)) throw new Error('not-array');
    if (parsed.length > MAX_OVERRIDE_ORGS) throw new Error('too-many');
    return parsed;
  } catch (error) {
    if (!strict) return null;
    if (error.message === 'too-many') throw badRequest(`开发承接实施方统一预填机构最多 ${MAX_OVERRIDE_ORGS} 项`);
    throw badRequest('开发承接实施方统一预填机构须为 JSON 数组');
  }
}

/** 保存前将机构属性值/显示值规范成去重的机构属性值 JSON 数组。 */
export async function normalizeDevelopmentIntakeImplementationOrgOverrideOrgs(value) {
  const list = parseOrganizationList(value, { strict: true });
  const normalized = [];
  const seen = new Set();
  for (const raw of list) {
    if (typeof raw !== 'string' || !raw.trim()) throw badRequest('开发承接实施方统一预填机构包含空值');
    const org = await resolveExistingDictAttr('org', raw);
    if (!org) throw badRequest(`开发承接实施方统一预填机构 [${raw}] 不存在`);
    if (!seen.has(org)) {
      seen.add(org);
      normalized.push(org);
    }
  }
  return JSON.stringify(normalized);
}

/** 读取当前有效名单；历史异常值或已删除机构安全按空名单处理。 */
export async function getDevelopmentIntakeImplementationOrgOverrideOrgs() {
  const row = await get('SELECT value FROM app_config WHERE key = ?', DEVELOPMENT_INTAKE_IMPLEMENTATION_ORG_OVERRIDE_CONFIG_KEY);
  const list = parseOrganizationList(row?.value, { strict: false });
  if (!list) return [];

  const result = [];
  const seen = new Set();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const org = await resolveExistingDictAttr('org', raw);
    if (org && !seen.has(org)) {
      seen.add(org);
      result.push(org);
    }
  }
  return result;
}

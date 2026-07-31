/**
 * 文件：server/src/shared/utils/organization-scope.js
 * 说明：机构范围纯函数，不访问数据库，由认证层提供角色与用户覆盖值。
 * 用途：统一计算全机构权限并判断需求、工单与系统是否匹配人员所属机构。
 * 作者：hengguan
 */
export function resolveEffectiveAllOrgAccess(user, roles = []) {
  if (user?.is_super) return { allOrgAccess: true, source: 'super-admin' };
  if (user?.all_org_access_override !== null && user?.all_org_access_override !== undefined) {
    return { allOrgAccess: Number(user.all_org_access_override) !== 0, source: 'person' };
  }
  // 任一角色配置为“是”即为全机构；无角色按历史兼容保持“是”。
  return {
    allOrgAccess: !roles.length || roles.some((role) => Number(role.all_org_access) !== 0),
    source: 'role',
  };
}

export function isOrganizationRestricted(user) {
  return user?.effective_all_org_access === false || user?.allOrgAccess === false;
}

export function organizationValues(organization) {
  const values = Array.isArray(organization)
    ? organization
    : organization?.organization_values || organization?.organizationValues || [organization?.org || organization];
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

export function organizationMatches(value, organization) {
  return organizationValues(organization).includes(String(value || '').trim());
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 主责或协同改造系统任一机构命中，或手填实施机构命中，即工作项可见。 */
export function workItemMatchesOrganization(item, organization, systemOrganizationByCode = {}) {
  const values = organizationValues(organization);
  if (!item || !values.length) return false;
  if (organizationMatches(item.implementation_org, values)) return true;
  const systems = new Set([
    ...arrayValue(item.main_systems),
    ...arrayValue(item.collab_dev_systems),
  ]);
  return [...systems].some((code) => organizationMatches(systemOrganizationByCode[code], values));
}

export function hasFeaturePermission(user: any, _featureKey: string, config?: any): boolean {
  const role = user?.role || 'GUEST';
  const rule = config?.features?.[_featureKey];
  if (rule) return !!rule[role];
  return ['SUPER_ADMIN', 'ADMIN'].includes(role) || user?.username === 'admin';
}

export function hasMenuPermission(user: any, menuKey: string, config?: any): boolean {
  const role = user?.role || 'GUEST';
  const rule = config?.menus?.[menuKey];
  return rule ? !!rule[role] : true;
}

export function hasPagePermission(user: any, path: string, config?: any): boolean {
  const role = user?.role || 'GUEST';
  const pages = config?.pages || {};
  for (const [pageKey, rule] of Object.entries(pages) as any[]) {
    if (path.includes(pageKey)) return !!rule[role];
  }
  return true;
}

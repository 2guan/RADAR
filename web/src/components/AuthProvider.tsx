import { useAppStore } from '../stores/app.js';

export function useAuth() {
  const radarUser = useAppStore((s) => s.user);
  const roleCodes = (radarUser?.roles || []).map((r: any) => r.code || r.name);
  const isAdmin = !!radarUser?.isSuper || roleCodes.some((code: string) => ['管理员', '超级管理员', '问题管理'].includes(code));

  const user = radarUser
    ? {
        ...radarUser,
        user_id: String(radarUser.id || radarUser.phone || ''),
        username: radarUser.phone || radarUser.name || '',
        real_name: radarUser.name || '',
        organization: radarUser.org || '',
        contact: radarUser.phone || '',
        role: radarUser.isSuper ? 'SUPER_ADMIN' : (isAdmin ? 'ADMIN' : 'USER'),
      }
    : null;

  return { user };
}

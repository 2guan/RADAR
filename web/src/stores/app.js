/**
 * 文件：stores/app.js
 * 用途：全局状态（zustand）。管理当前用户与权限、平台信息、明暗主题、当前投产窗口，
 *       并提供权限判定方法 can()。
 * 作者：hengguan
 * 说明：主题与当前投产点持久化到 localStorage，刷新后保持。
 */

import { create } from 'zustand';
import { apiGet, TOKEN_KEY } from '../api/client.js';
import { DEFAULT_PRESET } from '../theme/presets.js';
import { setStatusCatalog } from '../utils/status.js';

const THEME_KEY = 'radar_theme';
const RP_KEY = 'radar_release_point';
const PRESET_KEY = 'radar_preset';
const CONTENT_MODE_KEY = 'radar_content_mode';

/** 用户外观偏好按用户隔离，避免同一浏览器切换账号时互相覆盖。 */
function userPreferenceKey(key, userId) {
  return userId === undefined || userId === null ? null : `${key}:${userId}`;
}

/** 从 localStorage 解析投产窗口 id 数组（兼容旧的单值存储） */
function parseRP() {
  const v = localStorage.getItem(RP_KEY);
  if (v === null) return [];
  try {
    const a = JSON.parse(v);
    if (Array.isArray(a)) return a.map(Number).filter(Number.isFinite);
    const n = Number(a);
    return Number.isFinite(n) ? [n] : [];
  } catch {
    const n = Number(v);
    return Number.isFinite(n) ? [n] : [];
  }
}

/** 读取本地投产点偏好原始项，兼容旧版单值、数组，以及曾经保存为投产日期的情况 */
function parseRPPreference(raw) {
  if (raw === null) return { exists: false, values: [], explicitAll: false };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { exists: true, values: parsed, explicitAll: parsed.length === 0 };
    }
    return { exists: true, values: parsed === null || parsed === '' ? [] : [parsed], explicitAll: false };
  } catch {
    return { exists: true, values: raw === '' ? [] : [raw], explicitAll: false };
  }
}

/** 将本地偏好校验/迁移为当前有效投产点 id：优先按 id 匹配，其次按 release_date 兼容旧存储 */
function normalizeReleasePointIds(raw, points) {
  const pref = parseRPPreference(raw);
  if (!pref.exists) return { exists: false, ids: [], explicitAll: false };
  if (pref.explicitAll) return { exists: true, ids: [], explicitAll: true };

  const list = Array.isArray(points) ? points : [];
  const ids = [];
  for (const value of pref.values) {
    if (value === undefined || value === null || value === '') continue;
    const text = String(value);
    const numberValue = Number(value);
    const matched = list.find((point) => Number.isFinite(numberValue) && Number(point.id) === numberValue)
      || list.find((point) => String(point.release_date) === text);
    if (matched?.id !== undefined && matched?.id !== null) {
      const id = Number(matched.id);
      if (Number.isFinite(id) && !ids.includes(id)) ids.push(id);
    }
  }
  return { exists: true, ids, explicitAll: false };
}

export const useAppStore = create((set, get) => ({
  // 当前用户
  user: null,
  permissions: [],          // ['module:action', ...] 或 ['*']
  // 平台公开信息
  platform: {},
  // 未登录时使用默认外观；登录后会应用该用户自己的偏好或角色默认值。
  theme: 'light',
  preset: DEFAULT_PRESET,
  // 当前所选投产窗口 id 数组（空数组 = 全部投产点）
  releasePointIds: parseRP(),
  // 内容区模式：single / tabs（默认单页，用户本地选择优先）
  contentMode: localStorage.getItem(CONTENT_MODE_KEY) === 'tabs' ? 'tabs' : 'single',
  statusCatalogVersion: 0,

  /** 切换明暗主题 */
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    const key = userPreferenceKey(THEME_KEY, get().user?.id);
    if (key) localStorage.setItem(key, next);
    set({ theme: next });
  },

  /** 切换配色预设（仅覆盖当前用户的角色默认主题） */
  setPreset: (preset) => {
    const key = userPreferenceKey(PRESET_KEY, get().user?.id);
    if (key) localStorage.setItem(key, preset);
    set({ preset });
  },

  /** 设置内容区模式 */
  setContentMode: (mode) => {
    const next = mode === 'tabs' ? 'tabs' : 'single';
    localStorage.setItem(CONTENT_MODE_KEY, next);
    set({ contentMode: next });
  },

  /** 设置所选投产窗口（数组；空=全部投产点） */
  setReleasePointIds: (ids) => {
    const arr = Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : [];
    localStorage.setItem(RP_KEY, JSON.stringify(arr));
    set({ releasePointIds: arr });
  },

  /** 加载平台公开信息（登录页/标题用）；仅在未登录时应用平台默认主题。 */
  loadPlatform: async () => {
    const p = await apiGet('/settings/public');
    set({ platform: p || {} });
    if (p?.['platform.name']) document.title = p['platform.name'];
    if (!get().user && p?.['appearance.preset']) {
      set({ preset: p['appearance.preset'] });
    }
    return p;
  },

  /** 加载当前用户信息与权限 */
  loadMe: async () => {
    const me = await apiGet('/auth/me');
    if (me) {
      const presetKey = userPreferenceKey(PRESET_KEY, me.id);
      const themeKey = userPreferenceKey(THEME_KEY, me.id);
      const savedPreset = presetKey ? localStorage.getItem(presetKey) : null;
      const savedTheme = themeKey ? localStorage.getItem(themeKey) : null;
      set({
        user: me,
        permissions: me.permissions || [],
        // 用户自己选过的主题优先；未选择时使用角色的默认主题。
        preset: savedPreset || me.defaultTheme || DEFAULT_PRESET,
        theme: savedTheme || 'light',
      });
    } else {
      set({ user: null, permissions: [] });
    }
    return me;
  },

  /** 初始化投产窗口选择：本地偏好需校验有效；旧日期值自动迁移，失效值回退当前/默认窗口 */
  loadReleasePoint: async () => {
    const stored = localStorage.getItem(RP_KEY);
    if (stored !== null) {
      const points = await apiGet('/release-points/all');
      const normalized = normalizeReleasePointIds(stored, points);
      if (normalized.explicitAll || normalized.ids.length > 0) {
        get().setReleasePointIds(normalized.ids);
        return normalized.ids;
      }
    }
    const cur = await apiGet('/release-points/current');
    const ids = cur?.id ? [cur.id] : [];
    get().setReleasePointIds(ids);
    return ids;
  },

  /** 加载流程/问题状态语义目录，供状态徽章与阶段判断使用 */
  loadStatusCatalog: async () => {
    const [processStatus, issueStatus] = await Promise.all([
      apiGet('/dict/by-category/process_status'),
      apiGet('/dict/by-category/issue_status'),
    ]);
    setStatusCatalog('process_status', processStatus || []);
    setStatusCatalog('issue_status', issueStatus || []);
    set({ statusCatalogVersion: Date.now() });
  },

  /** 退出登录 */
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem('radar_redirect_hash');
    set({
      user: null,
      permissions: [],
      theme: 'light',
      preset: get().platform['appearance.preset'] || DEFAULT_PRESET,
    });
    location.hash = '#/login';
  },

  /**
   * 权限判定：是否拥有某模块某操作权限。
   * @param {string} moduleKey
   * @param {string} actionKey
   */
  can: (moduleKey, actionKey) => {
    const perms = get().permissions;
    if (perms.includes('*')) return true;
    return perms.includes(`${moduleKey}:${actionKey}`);
  },
}));

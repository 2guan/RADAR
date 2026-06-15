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

const THEME_KEY = 'radar_theme';
const RP_KEY = 'radar_release_point';
const PRESET_KEY = 'radar_preset';

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

export const useAppStore = create((set, get) => ({
  // 当前用户
  user: null,
  permissions: [],          // ['module:action', ...] 或 ['*']
  // 平台公开信息
  platform: {},
  // 主题：light / dark（首次跟随系统）
  theme: localStorage.getItem(THEME_KEY)
    || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  // 主题配色预设（用户本地优先，其次平台默认）
  preset: localStorage.getItem(PRESET_KEY) || DEFAULT_PRESET,
  // 当前所选投产窗口 id 数组（空数组 = 全部投产点）
  releasePointIds: parseRP(),

  /** 切换明暗主题 */
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    set({ theme: next });
  },

  /** 切换配色预设（本地覆盖平台默认） */
  setPreset: (key) => { localStorage.setItem(PRESET_KEY, key); set({ preset: key }); },

  /** 设置所选投产窗口（数组；空=全部投产点） */
  setReleasePointIds: (ids) => {
    const arr = Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : [];
    localStorage.setItem(RP_KEY, JSON.stringify(arr));
    set({ releasePointIds: arr });
  },

  /** 加载平台公开信息（登录页/标题用），并应用平台默认主题（用户未本地覆盖时） */
  loadPlatform: async () => {
    const p = await apiGet('/settings/public');
    set({ platform: p || {} });
    if (p?.['platform.name']) document.title = p['platform.name'];
    // 平台默认配色：仅当用户本地未覆盖时采用
    if (localStorage.getItem(PRESET_KEY) === null && p?.['appearance.preset']) {
      set({ preset: p['appearance.preset'] });
    }
    return p;
  },

  /** 加载当前用户信息与权限 */
  loadMe: async () => {
    const me = await apiGet('/auth/me');
    set({ user: me, permissions: me?.permissions || [] });
    if (me) {
      if (localStorage.getItem(PRESET_KEY) === null && me.defaultTheme) {
        set({ preset: me.defaultTheme });
      }
      if (localStorage.getItem(THEME_KEY) === null) {
        set({ theme: 'light' });
      }
    }
    return me;
  },

  /** 初始化投产窗口选择：本地有偏好则沿用（含"全部"），否则默认当前/默认窗口 */
  loadReleasePoint: async () => {
    if (localStorage.getItem(RP_KEY) !== null) return get().releasePointIds; // 已有偏好（可能为空=全部）
    const cur = await apiGet('/release-points/current');
    const ids = cur?.id ? [cur.id] : [];
    get().setReleasePointIds(ids);
    return ids;
  },

  /** 退出登录 */
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ user: null, permissions: [] });
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

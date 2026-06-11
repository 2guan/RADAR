/**
 * 文件：theme/presets.js
 * 用途：主题配色预设。提供多套"清爽明快"的配色方案，可在系统设置中切换；
 *       每套定义主色、悬浮深色、柔光、页面背景渐变（明/暗）等。
 * 作者：hengguan
 * 说明：仪表盘指标卡采用固定多彩语义色（蓝/橙/绿/青/紫），不随预设变化，保证活泼清爽。
 */

export const PRESETS = {
  sky: {
    key: 'sky', name: '清新蓝', primary: '#2E6BFF', primaryDeep: '#1E50D8',
    bgLight: 'linear-gradient(160deg, #f4f8ff 0%, #eef3fb 50%, #f6f9ff 100%)',
    bgDark: 'linear-gradient(160deg, #0e1626 0%, #0c1320 60%, #0a111c 100%)',
    blob1: '#2E6BFF', blob2: '#22D3EE',
  },
  teal: {
    key: 'teal', name: '青碧', primary: '#0EA5A4', primaryDeep: '#0B8281',
    bgLight: 'linear-gradient(160deg, #f1fbfa 0%, #ecf7f6 50%, #f4fcfb 100%)',
    bgDark: 'linear-gradient(160deg, #0a1a1a 0%, #081514 60%, #07120f 100%)',
    blob1: '#0EA5A4', blob2: '#34D399',
  },
  emerald: {
    key: 'emerald', name: '翡翠绿', primary: '#0E9F6E', primaryDeep: '#0B7D56',
    bgLight: 'linear-gradient(160deg, #f1faf5 0%, #ecf6f0 50%, #f4fbf7 100%)',
    bgDark: 'linear-gradient(160deg, #0a1813 0%, #081410 60%, #07110d 100%)',
    blob1: '#0E9F6E', blob2: '#84CC16',
  },
  violet: {
    key: 'violet', name: '靛紫', primary: '#6D5BFF', primaryDeep: '#5746E0',
    bgLight: 'linear-gradient(160deg, #f6f5ff 0%, #f1effb 50%, #f8f7ff 100%)',
    bgDark: 'linear-gradient(160deg, #14112a 0%, #100e22 60%, #0d0b1c 100%)',
    blob1: '#6D5BFF', blob2: '#C084FC',
  },
  coral: {
    key: 'coral', name: '珊瑚橙', primary: '#F1683C', primaryDeep: '#D8542B',
    bgLight: 'linear-gradient(160deg, #fff6f2 0%, #fdf0ec 50%, #fff7f4 100%)',
    bgDark: 'linear-gradient(160deg, #221310 0%, #1c0f0c 60%, #170c0a 100%)',
    blob1: '#F1683C', blob2: '#FBBF24',
  },
  rose: {
    key: 'rose', name: '玫瑰粉', primary: '#E8417A', primaryDeep: '#C9335F',
    bgLight: 'linear-gradient(160deg, #fff4f8 0%, #fdeef3 50%, #fff5f9 100%)',
    bgDark: 'linear-gradient(160deg, #221019 0%, #1c0d14 60%, #170b10 100%)',
    blob1: '#E8417A', blob2: '#FB7185',
  },
  graphite: {
    key: 'graphite', name: '石墨灰', primary: '#475569', primaryDeep: '#334155',
    bgLight: 'linear-gradient(160deg, #f6f8fb 0%, #eef2f7 50%, #f7f9fc 100%)',
    bgDark: 'linear-gradient(160deg, #11151c 0%, #0d1117 60%, #0b0e13 100%)',
    blob1: '#64748B', blob2: '#94A3B8',
  },
};

export const PRESET_LIST = Object.values(PRESETS);
export const DEFAULT_PRESET = 'sky';

/** 取预设（容错回退默认） */
export function getPreset(key) {
  return PRESETS[key] || PRESETS[DEFAULT_PRESET];
}

// 仪表盘指标卡固定多彩语义色（清爽活泼，独立于主题预设）
export const METRIC_COLORS = {
  requirement: '#2E6BFF',
  dev: '#F59E0B',
  sit: '#22C55E',
  uat: '#06B6D4',
  releaseSystem: '#8B5CF6',
};

// 全流程链路阶段颜色（统一蓝，当前节点高亮）
export const CHAIN_COLOR = 'var(--radar-primary)';

/**
 * 文件：theme/presets.js
 * 用途：主题配色预设。提供 8 套经典折中配色方案（兼容白天和夜间模式）。
 *       每套包含主体色、高亮色、强调色以及各阶段对比度适中、色调不同的专属状态色。
 * 作者：hengguan
 * 说明：采用明快中等饱和度设计，色彩区分度高，在白天和夜间均有极好的对比度。
 */

export const PRESETS = {
  sky: {
    key: 'sky',
    name: '雾霭之海 (蓝色)',
    primary: '#3572DF',
    primaryDeep: '#1D52B8',
    light: {
      primary: '#3572DF',
      primaryDeep: '#1D52B8',
      highlight: '#00B4D8',
      accent: '#8A55D7',
      statusInitial: '#4F738E',      // 钢蓝 (Steel Blue - 初始态)
      statusInProgress: '#E28C27',   // 琥珀黄 (Amber Orange - 进行中)
      statusFinal: '#1FA36D',        // 翡翠绿 (Jade Green - 终态)
      blob1: '#3572DF',
      blob2: '#00B4D8',
      bgSolid: '#f4f8ff',
      surface: '#ffffff',
      border: '#e2eafd',
    },
    dark: {
      primary: '#5B86FF',
      primaryDeep: '#2E6BFF',
      highlight: '#48CAE4',
      accent: '#B39DFF',
      statusInitial: '#7FA4BE',      // 亮钢蓝
      statusInProgress: '#F5A623',   // 亮琥珀
      statusFinal: '#4ADE80',        // 薄荷绿
      blob1: '#1E3A8A',
      blob2: '#0891B2',
      bgSolid: '#0c1320',
      surface: '#161f30',
      border: '#2a344d',
    },
    bgLight: 'linear-gradient(160deg, #f4f8ff 0%, #eef3fb 50%, #f6f9ff 100%)',
    bgDark: 'linear-gradient(160deg, #0e1626 0%, #0c1320 60%, #0a111c 100%)',
  },
  teal: {
    key: 'teal',
    name: '枫叶暮秋 (红色)',
    primary: '#D93B48',
    primaryDeep: '#BA2430',
    light: {
      primary: '#D93B48',
      primaryDeep: '#BA2430',
      highlight: '#FF7096',
      accent: '#457B9D',
      statusInitial: '#5B6B7C',      // 灰蓝
      statusInProgress: '#6366F1',   // 靛蓝
      statusFinal: '#0FA57E',        // 蓝绿
      blob1: '#D93B48',
      blob2: '#FF7096',
      bgSolid: '#fff5f5',
      surface: '#ffffff',
      border: '#fae5e5',
    },
    dark: {
      primary: '#FF6B76',
      primaryDeep: '#E63946',
      highlight: '#FFA4BA',
      accent: '#70A1C2',
      statusInitial: '#8CA2B9',      // 亮灰蓝
      statusInProgress: '#818CF8',   // 亮靛蓝
      statusFinal: '#34D399',        // 亮绿
      blob1: '#4A1D20',
      blob2: '#6B2D31',
      bgSolid: '#170c0c',
      surface: '#261616',
      border: '#3d2323',
    },
    bgLight: 'linear-gradient(160deg, #fff5f5 0%, #ffebeb 50%, #fff6f6 100%)',
    bgDark: 'linear-gradient(160deg, #1f1213 0%, #170c0c 60%, #12090a 100%)',
  },
  coral: {
    key: 'coral',
    name: '晚风杏橘 (橙色)',
    primary: '#E87A24',
    primaryDeep: '#C35E0B',
    light: {
      primary: '#E87A24',
      primaryDeep: '#C35E0B',
      highlight: '#FCBF49',
      accent: '#6A0DAD',
      statusInitial: '#4F738E',      // 钢蓝
      statusInProgress: '#8B5CF6',   // 紫罗兰
      statusFinal: '#10B981',        // 翡翠绿
      blob1: '#E87A24',
      blob2: '#FCBF49',
      bgSolid: '#fffbf5',
      surface: '#ffffff',
      border: '#faede2',
    },
    dark: {
      primary: '#FFA35A',
      primaryDeep: '#E87A24',
      highlight: '#FFE082',
      accent: '#C78CFF',
      statusInitial: '#7FA4BE',      // 亮钢蓝
      statusInProgress: '#A78BFA',   // 亮紫罗兰
      statusFinal: '#34D399',        // 亮翡翠绿
      blob1: '#4A2A0C',
      blob2: '#6B3C11',
      bgSolid: '#17100a',
      surface: '#261c14',
      border: '#3d2a1f',
    },
    bgLight: 'linear-gradient(160deg, #fffbf5 0%, #fff5e5 50%, #fffcf6 100%)',
    bgDark: 'linear-gradient(160deg, #1f160e 0%, #17100a 60%, #120c08 100%)',
  },
  emerald: {
    key: 'emerald',
    name: '松梢林歌 (绿色)',
    primary: '#22A06B',
    primaryDeep: '#167E51',
    light: {
      primary: '#22A06B',
      primaryDeep: '#167E51',
      highlight: '#84CC16',
      accent: '#F59E0B',
      statusInitial: '#5B6B7C',      // 灰蓝
      statusInProgress: '#E74C3C',   // 珊瑚红
      statusFinal: '#2980B9',        // 天空蓝
      blob1: '#22A06B',
      blob2: '#84CC16',
      bgSolid: '#f5faf6',
      surface: '#ffffff',
      border: '#e4faee',
    },
    dark: {
      primary: '#4ADE80',
      primaryDeep: '#22A06B',
      highlight: '#A3E635',
      accent: '#FBBF24',
      statusInitial: '#8CA2B9',      // 亮灰蓝
      statusInProgress: '#F87171',   // 亮珊瑚红
      statusFinal: '#60A5FA',        // 亮天空蓝
      blob1: '#0A3B29',
      blob2: '#1F5C45',
      bgSolid: '#0a100d',
      surface: '#141c18',
      border: '#223028',
    },
    bgLight: 'linear-gradient(160deg, #f5faf6 0%, #ebf5ee 50%, #f6faf7 100%)',
    bgDark: 'linear-gradient(160deg, #0e1713 0%, #0a100d 60%, #080c0a 100%)',
  },
  violet: {
    key: 'violet',
    name: '丁香紫烟 (紫色)',
    primary: '#8A55D7',
    primaryDeep: '#6C3BBD',
    light: {
      primary: '#8A55D7',
      primaryDeep: '#6C3BBD',
      highlight: '#F72585',
      accent: '#4CC9F0',
      statusInitial: '#5E6C7C',      // 灰蓝
      statusInProgress: '#D97706',   // 琥珀黄
      statusFinal: '#0EA5E9',        // 天际蓝
      blob1: '#8A55D7',
      blob2: '#F72585',
      bgSolid: '#faf5ff',
      surface: '#ffffff',
      border: '#f4eafd',
    },
    dark: {
      primary: '#B875FF',
      primaryDeep: '#8A55D7',
      highlight: '#FF6EB4',
      accent: '#85E3FF',
      statusInitial: '#9EA0C2',      // 亮灰紫
      statusInProgress: '#F59E0B',   // 亮琥珀
      statusFinal: '#38BDF8',        // 亮天际蓝
      blob1: '#31105A',
      blob2: '#4B1A89',
      bgSolid: '#100a1a',
      surface: '#1c122a',
      border: '#312048',
    },
    bgLight: 'linear-gradient(160deg, #faf5ff 0%, #f3e5ff 50%, #faf6ff 100%)',
    bgDark: 'linear-gradient(160deg, #170e24 0%, #100a1a 60%, #0d0814 100%)',
  },
  graphite: {
    key: 'graphite',
    name: '曜石微澜 (灰色)',
    primary: '#4E5866',
    primaryDeep: '#343D48',
    light: {
      primary: '#4E5866',
      primaryDeep: '#343D48',
      highlight: '#4299E1',
      accent: '#ED8936',
      statusInitial: '#6B7C93',      // 钢灰
      statusInProgress: '#3B82F6',   // 皇家蓝
      statusFinal: '#10B981',        // 翡翠绿
      blob1: '#4E5866',
      blob2: '#4299E1',
      bgSolid: '#f7fafc',
      surface: '#ffffff',
      border: '#edf0f5',
    },
    dark: {
      primary: '#8A95A5',
      primaryDeep: '#4E5866',
      highlight: '#63B3ED',
      accent: '#FFB066',
      statusInitial: '#CBD5E1',      // 亮钢灰
      statusInProgress: '#60A5FA',   // 亮皇家蓝
      statusFinal: '#34D399',        // 亮翡翠绿
      blob1: '#262D38',
      blob2: '#3A4454',
      bgSolid: '#0e1117',
      surface: '#191d24',
      border: '#2b313b',
    },
    bgLight: 'linear-gradient(160deg, #f7fafc 0%, #edf2f7 50%, #f8fafc 100%)',
    bgDark: 'linear-gradient(160deg, #13171e 0%, #0e1117 60%, #0b0d12 100%)',
  },
  rose: {
    key: 'rose',
    name: '冷香玫瑰 (玫红)',
    primary: '#DE3B64',
    primaryDeep: '#B01A3F',
    light: {
      primary: '#DE3B64',
      primaryDeep: '#B01A3F',
      highlight: '#EF233C',
      accent: '#8D99AE',
      statusInitial: '#4F738E',      // 钢蓝
      statusInProgress: '#F97316',   // 活力橙
      statusFinal: '#0EA5E9',        // 天际蓝
      blob1: '#DE3B64',
      blob2: '#EF233C',
      bgSolid: '#fff5f6',
      surface: '#ffffff',
      border: '#fae3ea',
    },
    dark: {
      primary: '#FF6584',
      primaryDeep: '#DE3B64',
      highlight: '#FF758F',
      accent: '#B2BECF',
      statusInitial: '#7FA4BE',      // 亮钢蓝
      statusInProgress: '#FDBA74',   // 亮活力橙
      statusFinal: '#38BDF8',        // 亮天际蓝
      blob1: '#5A0C1A',
      blob2: '#891D2F',
      bgSolid: '#170a0c',
      surface: '#261418',
      border: '#3d1f25',
    },
    bgLight: 'linear-gradient(160deg, #fff5f6 0%, #ffebeb 50%, #fff7f8 100%)',
    bgDark: 'linear-gradient(160deg, #1f0e11 0%, #170a0c 60%, #120809 100%)',
  },
  forest: {
    key: 'forest',
    name: '寒塘幽翠 (青色)',
    primary: '#1CA897',
    primaryDeep: '#0C7C6F',
    light: {
      primary: '#1CA897',
      primaryDeep: '#0C7C6F',
      highlight: '#02C39A',
      accent: '#FFC857',
      statusInitial: '#5B6B7C',      // 灰蓝
      statusInProgress: '#EC4899',   // 俏皮粉
      statusFinal: '#27AE60',        // 森林绿
      blob1: '#1CA897',
      blob2: '#02C39A',
      bgSolid: '#f5fcfc',
      surface: '#ffffff',
      border: '#e2f9f6',
    },
    dark: {
      primary: '#3CE7D3',
      primaryDeep: '#1CA897',
      highlight: '#4DFFE1',
      accent: '#FFC857',
      statusInitial: '#8CA2B9',      // 亮灰蓝
      statusInProgress: '#F472B6',   // 亮粉色
      statusFinal: '#4ADE80',        // 亮森林绿
      blob1: '#004A42',
      blob2: '#0C6E62',
      bgSolid: '#0a1111',
      surface: '#141d1d',
      border: '#203131',
    },
    bgLight: 'linear-gradient(160deg, #f5fcfc 0%, #eefbfb 50%, #f6fcfc 100%)',
    bgDark: 'linear-gradient(160deg, #0e1717 0%, #0a1111 60%, #080d0d 100%)',
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
  dev: '#F77F00',
  sit: '#10B981',
  uat: '#00A896',
  releaseSystem: '#7209B7',
};

// 全流程链路阶段颜色（统一蓝，当前节点高亮）
export const CHAIN_COLOR = 'var(--radar-primary)';

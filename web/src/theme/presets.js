/**
 * 文件：theme/presets.js
 * 用途：主题配色预设。8 套现代精致的宝石色系（兼容白天/夜间）。
 *       主体色：蓝 / 红 / 橙 / 绿 / 青 / 紫 / 粉 / 灰。
 * 作者：hengguan
 * 说明：
 *   1) 「登记 / 进行中 / 终态」三态按主题各异，不再统一。
 *   2) 冷暖互斥：红系（丹霞/桃夭）避绿；绿系（松翠/澄碧）避红。
 *   3) 防撞色：同一主题内不让"饱和橙"与"饱和绿"并置——
 *      保留绿色（主色/终态）的主题，进行中改用「柠黄」（黄绿同类色，红绿灯式直觉：黄=进行中 / 绿=完成）或「紫罗兰」；
 *      想保留暖色活跃态的主题，终态改用「靛蓝 / 海蓝」。
 *   4) 中等饱和、明快通透、高级耐看；白天夜间均具良好对比度。
 */

export const PRESETS = {
  sky: {
    key: 'sky',
    name: '霁青',
    primary: '#2F7BE8',
    primaryDeep: '#1A5FC8',
    light: {
      primary: '#2F7BE8',          // 明快天蓝
      primaryDeep: '#1A5FC8',
      highlight: '#22B8E8',        // 晴空青蓝
      accent: '#119DBF',           // 湖青（和谐搭档）
      statusInitial: '#5E7488',    // 石板蓝（登记）
      statusInProgress: '#C9A218', // 柠金（进行中：深柠黄，黄绿同类，避免橙绿撞色）
      statusFinal: '#1F9D6B',      // 翠绿（终态）
      blob1: '#2F7BE8',
      blob2: '#22B8E8',
      bgSolid: '#f3f8ff',
      surface: '#ffffff',
      border: '#dfeafe',
    },
    dark: {
      primary: '#5C9BFF',
      primaryDeep: '#2F7BE8',
      highlight: '#4FC9EE',
      accent: '#3FBEDC',
      statusInitial: '#8DA2B5',
      statusInProgress: '#EBC83E',
      statusFinal: '#42C98C',
      blob1: '#1E3A8A',
      blob2: '#0E7490',
      bgSolid: '#0c1320',
      surface: '#161f30',
      border: '#2a344d',
    },
    bgLight: 'linear-gradient(160deg, #f3f8ff 0%, #ecf3fc 50%, #f5f9ff 100%)',
    bgDark: 'linear-gradient(160deg, #0e1626 0%, #0c1320 60%, #0a111c 100%)',
  },
  teal: {
    key: 'teal',
    name: '丹霞',
    primary: '#D44552',
    primaryDeep: '#B12C39',
    light: {
      primary: '#D44552',          // 精致绯红
      primaryDeep: '#B12C39',
      highlight: '#F2768A',        // 浅绯粉
      accent: '#C05A86',           // 莓玫（邻近暖调，无绿）
      statusInitial: '#7C7482',    // 暖灰（登记）
      statusInProgress: '#D97A24', // 琥珀橙（进行中：红系无绿，暖橙可放心使用）
      statusFinal: '#4A53B8',      // 靛蓝（终态：红系避绿，靛蓝表"已锁定"）
      blob1: '#D44552',
      blob2: '#F2768A',
      bgSolid: '#fff4f4',
      surface: '#ffffff',
      border: '#fae2e3',
    },
    dark: {
      primary: '#FF6B76',
      primaryDeep: '#E04250',
      highlight: '#FF92A4',
      accent: '#D67BA0',
      statusInitial: '#A597A8',
      statusInProgress: '#F09A44',
      statusFinal: '#7E86E8',
      blob1: '#4A1D20',
      blob2: '#6B2D31',
      bgSolid: '#170c0c',
      surface: '#261616',
      border: '#3d2323',
    },
    bgLight: 'linear-gradient(160deg, #fff4f4 0%, #ffeaea 50%, #fff6f6 100%)',
    bgDark: 'linear-gradient(160deg, #1f1213 0%, #170c0c 60%, #12090a 100%)',
  },
  coral: {
    key: 'coral',
    name: '暮橘',
    primary: '#E2701E',
    primaryDeep: '#C0560C',
    light: {
      primary: '#E2701E',          // 暮阳橘
      primaryDeep: '#C0560C',
      highlight: '#F6A93E',        // 沙金黄
      accent: '#2C8CB5',           // 海蓝（橙蓝经典对撞）
      statusInitial: '#5E7488',    // 石板蓝（登记）
      statusInProgress: '#7E63CE', // 紫罗兰（进行中：冷调宝石，避开与主橘撞色）
      statusFinal: '#3F57B5',      // 靛蓝（终态：橙系彻底避绿，改用靛蓝）
      blob1: '#E2701E',
      blob2: '#F6A93E',
      bgSolid: '#fffaf3',
      surface: '#ffffff',
      border: '#f7e7d8',
    },
    dark: {
      primary: '#FF9542',
      primaryDeep: '#E2701E',
      highlight: '#FFC15A',
      accent: '#46AFD4',
      statusInitial: '#8DA2B5',
      statusInProgress: '#A78BEC',
      statusFinal: '#7077E0',
      blob1: '#4A2A0C',
      blob2: '#6B3C11',
      bgSolid: '#17100a',
      surface: '#261c14',
      border: '#3d2a1f',
    },
    bgLight: 'linear-gradient(160deg, #fffaf3 0%, #fff3e3 50%, #fffbf5 100%)',
    bgDark: 'linear-gradient(160deg, #1f160e 0%, #17100a 60%, #120c08 100%)',
  },
  emerald: {
    key: 'emerald',
    name: '松翠',
    primary: '#1B9D62',
    primaryDeep: '#0E7C49',
    light: {
      primary: '#1B9D62',          // 松针翠绿
      primaryDeep: '#0E7C49',
      highlight: '#7FC241',        // 新叶嫩绿
      accent: '#C2A41E',           // 柠金（黄绿同类，避红、避橙绿撞色）
      statusInitial: '#5E7488',    // 石板蓝（登记）
      statusInProgress: '#6E5ECE', // 靛紫（进行中：冷调宝石，避红、避开与主绿撞色）
      statusFinal: '#2F6FC0',      // 宝蓝（终态：绿系避红、且不与主绿撞色）
      blob1: '#1B9D62',
      blob2: '#7FC241',
      bgSolid: '#f3faf6',
      surface: '#ffffff',
      border: '#ddf2e6',
    },
    dark: {
      primary: '#42C98C',
      primaryDeep: '#1B9D62',
      highlight: '#A6DB5A',
      accent: '#E6CE4A',
      statusInitial: '#8DA2B5',
      statusInProgress: '#998BEC',
      statusFinal: '#5E92E8',
      blob1: '#0A3B29',
      blob2: '#1F5C45',
      bgSolid: '#0a100d',
      surface: '#141c18',
      border: '#223028',
    },
    bgLight: 'linear-gradient(160deg, #f3faf6 0%, #eaf5ee 50%, #f5faf7 100%)',
    bgDark: 'linear-gradient(160deg, #0e1713 0%, #0a100d 60%, #080c0a 100%)',
  },
  forest: {
    key: 'forest',
    name: '澄碧',
    primary: '#119CA6',
    primaryDeep: '#0A7882',
    light: {
      primary: '#119CA6',          // 碧潭青
      primaryDeep: '#0A7882',
      highlight: '#27C0B4',        // 松石绿
      accent: '#7B66CE',           // 青莲紫（避红、避橙绿撞色，与青形成冷调层次）
      statusInitial: '#5E7488',    // 石板蓝（登记）
      statusInProgress: '#C49C16', // 流金黄（进行中：深金黄，避红、避与青撞橙）
      statusFinal: '#3A5FC8',      // 靛蓝（终态：青系避红、且不与主青撞色）
      blob1: '#119CA6',
      blob2: '#27C0B4',
      bgSolid: '#f2fbfb',
      surface: '#ffffff',
      border: '#d6f1f0',
    },
    dark: {
      primary: '#2DCBD0',
      primaryDeep: '#119CA6',
      highlight: '#4FE0D2',
      accent: '#A38FEC',
      statusInitial: '#8DA2B5',
      statusInProgress: '#E4BA32',
      statusFinal: '#6E88EC',
      blob1: '#004A42',
      blob2: '#0C6E62',
      bgSolid: '#0a1111',
      surface: '#141d1d',
      border: '#203131',
    },
    bgLight: 'linear-gradient(160deg, #f2fbfb 0%, #e8f7f7 50%, #f4fbfb 100%)',
    bgDark: 'linear-gradient(160deg, #0e1717 0%, #0a1111 60%, #080d0d 100%)',
  },
  violet: {
    key: 'violet',
    name: '黛紫',
    primary: '#7B57D4',
    primaryDeep: '#5E3BB5',
    light: {
      primary: '#7B57D4',          // 黛紫
      primaryDeep: '#5E3BB5',
      highlight: '#A86BE0',        // 浅丁香
      accent: '#2AA0C2',           // 湖青（紫青冷调，清透和谐）
      statusInitial: '#5E7488',    // 石板蓝（登记）
      statusInProgress: '#E2703A', // 落霞橙（进行中：暖橙与紫互补，醒目高级）
      statusFinal: '#2F7FB0',      // 海蓝（终态：改用海蓝，避免橙绿并置）
      blob1: '#7B57D4',
      blob2: '#A86BE0',
      bgSolid: '#f8f5ff',
      surface: '#ffffff',
      border: '#ece2fb',
    },
    dark: {
      primary: '#A883FF',
      primaryDeep: '#7B57D4',
      highlight: '#C98FF5',
      accent: '#45B9D6',
      statusInitial: '#8DA2B5',
      statusInProgress: '#FF9460',
      statusFinal: '#56A6DE',
      blob1: '#31105A',
      blob2: '#4B1A89',
      bgSolid: '#100a1a',
      surface: '#1c122a',
      border: '#312048',
    },
    bgLight: 'linear-gradient(160deg, #f8f5ff 0%, #f1e8fc 50%, #f9f6ff 100%)',
    bgDark: 'linear-gradient(160deg, #170e24 0%, #100a1a 60%, #0d0814 100%)',
  },
  rose: {
    key: 'rose',
    name: '桃夭',
    primary: '#D85B8C',
    primaryDeep: '#B83A6E',
    light: {
      primary: '#D85B8C',          // 樱粉（柔和不艳）
      primaryDeep: '#B83A6E',
      highlight: '#F58BB0',        // 浅桃粉
      accent: '#5F66C8',           // 靛蓝（粉系避绿，靛蓝作冷调平衡）
      statusInitial: '#7C7482',    // 暖灰（登记）
      statusInProgress: '#E3A82C', // 金盏黄（进行中：暖金，红系无绿可放心使用）
      statusFinal: '#2F7FB0',      // 海蓝（终态：粉系避绿，海蓝表"完成"）
      blob1: '#D85B8C',
      blob2: '#F58BB0',
      bgSolid: '#fff4f8',
      surface: '#ffffff',
      border: '#fae0ea',
    },
    dark: {
      primary: '#FF7AA6',
      primaryDeep: '#D85B8C',
      highlight: '#FFA6C4',
      accent: '#8E94EC',
      statusInitial: '#A597A8',
      statusInProgress: '#F5C84A',
      statusFinal: '#56A6DE',
      blob1: '#5A1030',
      blob2: '#7E1F4A',
      bgSolid: '#170a10',
      surface: '#261420',
      border: '#3d1f30',
    },
    bgLight: 'linear-gradient(160deg, #fff4f8 0%, #ffe9f1 50%, #fff6f9 100%)',
    bgDark: 'linear-gradient(160deg, #1f0e16 0%, #170a10 60%, #12080c 100%)',
  },
  graphite: {
    key: 'graphite',
    name: '玄石',
    primary: '#566273',
    primaryDeep: '#3B4655',
    light: {
      primary: '#566273',          // 玄石灰（微冷中性）
      primaryDeep: '#3B4655',
      highlight: '#5C93D6',        // 岩蓝（点睛）
      accent: '#4F86C4',           // 钢蓝（中性灰中的一抹冷蓝）
      statusInitial: '#727A88',    // 中性灰（登记）
      statusInProgress: '#C2982E', // 古金黄（进行中：深金调，与深松绿同类不撞）
      statusFinal: '#1B8F5E',      // 深松绿（终态：中性灰可用绿）
      blob1: '#566273',
      blob2: '#5C93D6',
      bgSolid: '#f6f8fb',
      surface: '#ffffff',
      border: '#e6ebf1',
    },
    dark: {
      primary: '#8995A6',
      primaryDeep: '#566273',
      highlight: '#6FA3E0',
      accent: '#6BA0DD',
      statusInitial: '#9AA2B0',
      statusInProgress: '#DEB64E',
      statusFinal: '#43C98A',
      blob1: '#262D38',
      blob2: '#3A4454',
      bgSolid: '#0e1117',
      surface: '#191d24',
      border: '#2b313b',
    },
    bgLight: 'linear-gradient(160deg, #f6f8fb 0%, #eef2f7 50%, #f7f9fc 100%)',
    bgDark: 'linear-gradient(160deg, #13171e 0%, #0e1117 60%, #0b0d12 100%)',
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
  requirement: '#2F7BE8',
  dev: '#E2701E',
  sit: '#1F9D6B',
  uat: '#119CA6',
  releaseSystem: '#7B57D4',
};

// 全流程链路阶段颜色（统一主色，当前节点高亮）
export const CHAIN_COLOR = 'var(--radar-primary)';

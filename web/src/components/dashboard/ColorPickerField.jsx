/**
 * 文件：components/dashboard/ColorPickerField.jsx
 * 用途：图表分组取色器。基于 AntD ColorPicker，输出十六进制字符串，内置翡翠绿
 *       为首的精选调色盘，支持清除（返回 undefined 走默认轮转色）。
 * 作者：hengguan
 * 说明：自定义取色器表单项，绑定到调色板库，供图表或指标配色使用。
 */

import React from 'react';
import { ColorPicker } from 'antd';
import { useAppStore } from '../../stores/app.js';
import { getPreset } from '../../theme/presets.js';

// 翡翠绿为首的语义调色盘
export const CHART_PRESET_COLORS = [
  '#0E9F6E', '#10B981', '#22D3EE', '#2E6BFF', '#7C3AED', '#EC4899',
  '#F59E0B', '#F77F00', '#EF4444', '#14B8A6', '#64748B', '#0F766E',
];

const THEME_COLOR_KEYS = [
  ['primary', '主题色'], ['primaryDeep', '主题深色'], ['highlight', '主题高亮'], ['accent', '主题强调'],
  ['statusInProgress', '进行中'], ['statusFinal', '已完成'], ['statusInitial', '初始'],
];

/** 解析持久化的主题关联色；普通十六进制色保持不变。 */
export function resolveChartColor(color, activeColors, fallback) {
  if (!color) return fallback;
  if (String(color).startsWith('theme:')) return activeColors?.[String(color).slice(6)] || fallback;
  return color;
}

/**
 * @param {string|undefined} value 十六进制色或 theme:primary 等主题关联色
 * @param {(color:string|undefined)=>void} onChange
 */
export default function ColorPickerField({ value, onChange, size = 'small' }) {
  const { theme, preset } = useAppStore();
  const themePreset = getPreset(preset);
  const activeColors = theme === 'dark' ? themePreset.dark : themePreset.light;
  const themeColors = THEME_COLOR_KEYS
    .map(([key, label]) => ({ key, label, color: activeColors[key] }))
    .filter((item) => item.color);
  const presets = [
    { label: '主题推荐（随主题切换）', colors: themeColors.map((item) => item.color) },
    { label: '固定颜色', colors: CHART_PRESET_COLORS },
  ];
  const displayColor = resolveChartColor(value, activeColors);

  return (
    <ColorPicker
      size={size}
      value={displayColor || null}
      presets={presets}
      allowClear
      disabledAlpha
      onChange={(c) => {
        const hex = c?.toHexString();
        const themeColor = themeColors.find((item) => item.color.toLowerCase() === hex?.toLowerCase());
        onChange?.(themeColor ? `theme:${themeColor.key}` : hex);
      }}
      onClear={() => onChange?.(undefined)}
    />
  );
}

/**
 * 文件：components/dashboard/ColorPickerField.jsx
 * 用途：图表分组取色器。基于 AntD ColorPicker，输出十六进制字符串，内置翡翠绿
 *       为首的精选调色盘，支持清除（返回 undefined 走默认轮转色）。
 * 作者：hengguan
 */

import React from 'react';
import { ColorPicker } from 'antd';

// 翡翠绿为首的语义调色盘
export const CHART_PRESET_COLORS = [
  '#0E9F6E', '#10B981', '#22D3EE', '#2E6BFF', '#7C3AED', '#EC4899',
  '#F59E0B', '#F77F00', '#EF4444', '#14B8A6', '#64748B', '#0F766E',
];

const PRESETS = [{ label: '推荐', colors: CHART_PRESET_COLORS }];

/**
 * @param {string|undefined} value 十六进制色
 * @param {(hex:string|undefined)=>void} onChange
 */
export default function ColorPickerField({ value, onChange, size = 'small' }) {
  return (
    <ColorPicker
      size={size}
      value={value || null}
      presets={PRESETS}
      allowClear
      disabledAlpha
      onChange={(c) => onChange?.(c ? c.toHexString() : undefined)}
      onClear={() => onChange?.(undefined)}
    />
  );
}

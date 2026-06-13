/**
 * 文件：components/dashboard/chartOption.js
 * 用途：把聚合数据（1D [{name,value}] / 2D [{name_y,name_x,value}]）按图表类型构造为
 *       ECharts option。含翡翠绿调色盘、主色→透明渐变、堆叠总数标签、明暗主题适配。
 * 作者：hengguan
 * 说明：根据给定的数据源维度、指标与图表类型，动态生成适合 ECharts 或 Chart.js 的渲染配置项。
 */

import { CHART_PRESET_COLORS } from './ColorPickerField.jsx';

export const CHART_PALETTE = CHART_PRESET_COLORS;

/** 主色 → 透明 线性渐变（柱/饼用），horizontal 时沿 x 方向 */
export function gradient(color, horizontal = false) {
  return {
    type: 'linear',
    x: 0, y: 0, x2: horizontal ? 1 : 0, y2: horizontal ? 0 : 1,
    colorStops: [{ offset: 0, color }, { offset: 1, color: fade(color, 0.55) }],
  };
}

/** 把十六进制色淡化为半透明 rgba */
function fade(hex, alpha) {
  const h = String(hex || '#0E9F6E').replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const groupLabelSet = (groups) => new Set([...(groups || []).map((g) => g.label), '其它']);
const groupColorMap = (groups) => Object.fromEntries((groups || []).filter((g) => g.color).map((g) => [g.label, g.color]));
const colorAt = (label, idx, gmap, base) => gmap[label] || base || CHART_PALETTE[idx % CHART_PALETTE.length];

/**
 * 构造非表格图表的 ECharts option。
 * @param {object} p { chartType, cfg, data, labelOf, isDark }
 */
export function buildOption({ chartType, cfg, data, labelOf, isDark }) {
  const axisText = isDark ? '#c9d1d9' : '#5b6472';
  const base = {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'inherit' },
  };
  const is2D = !!cfg.xAxisDimension && Array.isArray(data) && data.length > 0 && 'name_y' in data[0];

  // ---- 饼图（始终 1D）----
  if (chartType === 'pie') {
    const gset = groupLabelSet(cfg.groups);
    const gmap = groupColorMap(cfg.groups);
    return {
      ...base,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, type: 'scroll', textStyle: { color: axisText, fontSize: 11 } },
      series: [{
        type: 'pie', radius: ['48%', '74%'], center: ['50%', '46%'], avoidLabelOverlap: true,
        itemStyle: { borderRadius: 4, borderColor: isDark ? '#1b2030' : '#fff', borderWidth: 1 },
        label: { color: axisText, fontSize: 11, formatter: '{b}: {c}' },
        data: (data || []).map((d, i) => {
          const name = gset.has(d.name) ? d.name : labelOf(cfg.dimension, d.name);
          return { value: d.value, name, itemStyle: { color: gradient(colorAt(name, i, gmap, undefined)) } };
        }),
      }],
    };
  }

  // ---- 2D：堆叠柱 / 堆叠横柱 / 多系列折线面积 ----
  if (is2D) {
    const yset = groupLabelSet(cfg.groups);
    const xset = groupLabelSet(cfg.xAxisGroups);
    const xColorMap = groupColorMap(cfg.xAxisGroups);
    const cats = [...new Set(data.map((d) => d.name_y))];
    const stacks = [...new Set(data.map((d) => d.name_x))];
    const catLabels = cats.map((c) => (yset.has(c) ? c : labelOf(cfg.dimension, c)));
    const horizontal = chartType === 'stacked_bar_horizontal';
    const isLine = chartType === 'line' || chartType === 'area';
    const stacked = chartType === 'stacked_bar' || chartType === 'stacked_bar_horizontal' || chartType === 'area';

    const series = stacks.map((st, i) => {
      const stLabel = xset.has(st) ? st : labelOf(cfg.xAxisDimension, st);
      const color = colorAt(stLabel, i, xColorMap, undefined);
      return {
        name: stLabel,
        type: isLine ? 'line' : 'bar',
        stack: stacked ? 'total' : undefined,
        smooth: isLine || undefined,
        barMaxWidth: 30,
        areaStyle: chartType === 'area' ? { color: gradient(color), opacity: 0.6 } : undefined,
        itemStyle: { color: isLine ? color : gradient(color, horizontal), borderRadius: stacked ? 0 : [3, 3, 0, 0] },
        lineStyle: isLine ? { color, width: 2 } : undefined,
        label: { show: !isLine && stacked, position: 'inside', color: '#fff', fontSize: 10, formatter: (p) => (p.value >= 1 ? p.value : '') },
        data: cats.map((c) => {
          const item = data.find((d) => d.name_y === c && d.name_x === st);
          return item ? item.value : 0;
        }),
      };
    });

    // 堆叠总数：透明幽灵 series 顶部显合计
    if (chartType === 'stacked_bar' || chartType === 'stacked_bar_horizontal') {
      const totals = cats.map((c) => data.filter((d) => d.name_y === c).reduce((s, d) => s + d.value, 0));
      series.push({
        name: '合计', type: 'bar', stack: 'total', itemStyle: { color: 'transparent' }, emphasis: { disabled: true },
        tooltip: { show: false },
        label: { show: true, position: horizontal ? 'right' : 'top', color: axisText, fontSize: 11, fontWeight: 'bold', formatter: (p) => totals[p.dataIndex] || '' },
        data: cats.map(() => 0),
      });
    }

    const catAxis = { type: 'category', data: catLabels, axisLabel: { color: axisText, fontSize: 10, interval: 0, rotate: catLabels.length > 5 ? 30 : 0 } };
    const valAxis = { type: 'value', axisLabel: { color: axisText, fontSize: 10 }, splitLine: { lineStyle: { color: isDark ? '#2a3142' : '#eef1f6' } } };
    return {
      ...base,
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { bottom: 0, type: 'scroll', textStyle: { color: axisText, fontSize: 11 } },
      grid: { left: 8, right: 16, top: 12, bottom: 28, containLabel: true },
      xAxis: horizontal ? valAxis : catAxis,
      yAxis: horizontal ? { ...catAxis, data: [...catLabels].reverse() } : valAxis,
      series: horizontal ? series.map((s) => ({ ...s, data: [...s.data].reverse() })) : series,
    };
  }

  // ---- 1D：柱 / 横柱 / 折线 / 面积 ----
  const gset = groupLabelSet(cfg.groups);
  const gmap = groupColorMap(cfg.groups);
  const horizontal = chartType === 'horizontal_bar';
  const isLine = chartType === 'line' || chartType === 'area';
  let rows = (data || []).map((d, i) => {
    const name = gset.has(d.name) ? d.name : labelOf(cfg.dimension, d.name);
    return { name, value: d.value, color: colorAt(name, i, gmap, cfg.color) };
  });
  if (horizontal) rows = rows.reverse();
  const labels = rows.map((r) => r.name);
  const lineColor = rows[0]?.color || CHART_PALETTE[0];
  const catAxis = { type: 'category', data: labels, axisLabel: { color: axisText, fontSize: 10, interval: 0, rotate: !horizontal && labels.length > 5 ? 30 : 0 } };
  const valAxis = { type: 'value', axisLabel: { color: axisText, fontSize: 10 }, splitLine: { lineStyle: { color: isDark ? '#2a3142' : '#eef1f6' } } };

  return {
    ...base,
    tooltip: { trigger: 'axis', axisPointer: { type: isLine ? 'line' : 'shadow' } },
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    xAxis: horizontal ? valAxis : catAxis,
    yAxis: horizontal ? catAxis : valAxis,
    series: [{
      type: isLine ? 'line' : 'bar',
      smooth: isLine || undefined,
      barMaxWidth: 32,
      areaStyle: chartType === 'area' ? { color: gradient(lineColor), opacity: 0.5 } : undefined,
      lineStyle: isLine ? { color: lineColor, width: 2 } : undefined,
      itemStyle: isLine ? { color: lineColor } : undefined,
      label: { show: !isLine, position: horizontal ? 'right' : 'top', color: axisText, fontSize: 10 },
      data: rows.map((r) => ({
        value: r.value, name: r.name,
        itemStyle: isLine ? undefined : { color: gradient(r.color, horizontal), borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0] },
      })),
    }],
  };
}

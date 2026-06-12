/**
 * 文件：components/dashboard/DashboardChart.jsx
 * 用途：单张分析图表卡片。按配置拉取聚合数据，渲染 ECharts（饼/柱/横柱/堆叠/折线/面积）
 *       或透视表；hover 显隐编辑/左右移动/删除；点击图元或单元格触发钻取。
 * 作者：hengguan
 */

import React from 'react';
import { Card, Button, Tooltip, Popconfirm, Empty, Spin } from 'antd';
import {
  EditOutlined, DeleteOutlined, ArrowLeftOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { buildOption } from './chartOption.js';
import PivotTable from './PivotTable.jsx';

/** 把点击的展示标签还原为底层原始值集合 */
function reverse(groups, label, dim, raws, labelOf) {
  const g = (groups || []).find((x) => x.label === label);
  if (g) return g.values;
  if (label === '其它') {
    const covered = new Set((groups || []).flatMap((x) => x.values));
    return raws.filter((r) => !covered.has(r));
  }
  const hit = raws.filter((r) => labelOf(dim, r) === label || r === label);
  return hit.length ? hit : [label];
}

export default function DashboardChart({
  chart, data = [], loading = false, theme, editable, isFirst, isLast, onEdit, onDelete, onMove, onDrill, labelOf, dimName, forcedHeight,
}) {
  const cfg = typeof chart.config === 'string' ? JSON.parse(chart.config) : (chart.config || {});
  const isDark = theme === 'dark';
  const height = forcedHeight != null ? forcedHeight : (chart.height ?? 320);

  const handleEchartClick = (p) => {
    if (!onDrill || p.seriesName === '合计') return;
    const is2D = data[0] && 'name_y' in data[0];
    if (is2D) {
      const ys = [...new Set(data.map((d) => d.name_y))];
      const xs = [...new Set(data.map((d) => d.name_x))];
      onDrill(cfg.source, {
        [cfg.dimension]: reverse(cfg.groups, p.name, cfg.dimension, ys, labelOf),
        [cfg.xAxisDimension]: reverse(cfg.xAxisGroups, p.seriesName, cfg.xAxisDimension, xs, labelOf),
      }, chart.title);
    } else {
      const raws = [...new Set(data.map((d) => d.name))];
      onDrill(cfg.source, { [cfg.dimension]: reverse(cfg.groups, p.name, cfg.dimension, raws, labelOf) }, chart.title);
    }
  };

  const actions = editable ? (
    <div className="dash-chart-actions">
      {!isFirst && <Tooltip title="左移"><Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={() => onMove('left')} /></Tooltip>}
      {!isLast && <Tooltip title="右移"><Button type="text" size="small" icon={<ArrowRightOutlined />} onClick={() => onMove('right')} /></Tooltip>}
      <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} />
      <Popconfirm title="删除该图表？" onConfirm={onDelete}><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
    </div>
  ) : null;

  const renderBody = () => {
    if (loading) return <div style={{ height: height || 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>;
    if (!data.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" style={{ padding: '32px 0' }} />;
    if (chart.chart_type === 'table') {
      return (
        <div style={{ maxHeight: height ? height : undefined, overflow: 'auto' }}>
          <PivotTable cfg={cfg} data={data} labelOf={labelOf} dimName={dimName} onCell={(filters) => onDrill?.(cfg.source, filters, chart.title)} />
        </div>
      );
    }
    const option = buildOption({ chartType: chart.chart_type, cfg, data, labelOf, isDark });
    return (
      <ReactECharts option={option} style={{ height: height || 300 }} opts={{ renderer: 'svg' }} notMerge
        onEvents={{ click: handleEchartClick }} />
    );
  };

  return (
    <Card className="dash-chart-card" size="small"
      title={<span className="dash-chart-title">{chart.title}</span>}
      extra={actions}>
      {renderBody()}
    </Card>
  );
}

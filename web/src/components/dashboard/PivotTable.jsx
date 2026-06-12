/**
 * 文件：components/dashboard/PivotTable.jsx
 * 用途：透视表渲染。支持 1D（维度/数量）与 2D（主维度×次维度）两种；含合计行、合计列、
 *       全零列隐藏、0 值灰显、单元格按次维度分组色淡着色。
 * 作者：hengguan
 */

import React from 'react';
import { Table } from 'antd';
import { useResponsive } from '../../hooks/useResponsive.js';

const groupLabelSet = (groups) => new Set([...(groups || []).map((g) => g.label), '其它']);
const colorOf = (groups, label) => (groups || []).find((g) => g.label === label)?.color;

function tint(hex, alpha) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return undefined;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${alpha})`;
}

/** @param {object} p { cfg, data, labelOf, dimName, onCell } onCell(filters) 触发钻取 */
export default function PivotTable({ cfg, data, labelOf, dimName = (d) => d, onCell }) {
  const { isMobile } = useResponsive();
  // 手机端透视表：去掉横向滚动、改用紧凑样式（小字号/窄间距），令表格自适应容器宽度
  const pivotClass = `dash-pivot${isMobile ? ' dash-pivot-compact' : ''}`;
  const rows = data || [];
  const is2D = rows[0] && 'name_y' in rows[0];

  if (!is2D) {
    // 1D：维度 / 数量
    const gset = groupLabelSet(cfg.groups);
    const total = rows.reduce((s, r) => s + r.value, 0);
    const ds = rows.map((r, i) => ({
      key: i, raw: r.name,
      __name: gset.has(r.name) ? r.name : labelOf(cfg.dimension, r.name),
      value: r.value,
    }));
    ds.push({ key: '__total', __name: '合计', value: total, __isTotal: true });
    return (
      <Table className={pivotClass} size="small" pagination={false} dataSource={ds}
        rowClassName={(r) => (r.__isTotal ? 'pivot-total-row' : '')}
        columns={[
          { title: dimName(cfg.dimension), dataIndex: '__name', align: 'center' },
          {
            title: '数量', dataIndex: 'value', align: 'center', width: 120,
            render: (v, r) => (v === 0 ? <span style={{ color: '#bfbfbf' }}>0</span>
              : (r.__isTotal || !onCell ? v : <a onClick={() => onCell({ [cfg.dimension]: groupValues(cfg.groups, r.raw, cfg.dimension) })}>{v}</a>)),
          },
        ]} />
    );
  }

  // 2D 透视
  const yset = groupLabelSet(cfg.groups);
  const xset = groupLabelSet(cfg.xAxisGroups);
  const ys = [...new Set(rows.map((r) => r.name_y))];
  let xs = [...new Set(rows.map((r) => r.name_x))];
  const matrix = {};
  rows.forEach((r) => { (matrix[r.name_y] = matrix[r.name_y] || {})[r.name_x] = r.value; });
  // 隐藏全零列
  xs = xs.filter((x) => ys.some((y) => (matrix[y]?.[x] || 0) > 0));

  const dispY = (y) => (yset.has(y) ? y : labelOf(cfg.dimension, y));
  const dispX = (x) => (xset.has(x) ? x : labelOf(cfg.xAxisDimension, x));

  const ds = ys.map((y, i) => {
    const row = { key: i, raw_y: y, __name: dispY(y) };
    let t = 0;
    xs.forEach((x) => { const v = matrix[y]?.[x] || 0; row[x] = v; t += v; });
    row.__total = t;
    return row;
  });
  const totalRow = { key: '__total', __name: '合计', __isTotal: true };
  let grand = 0;
  xs.forEach((x) => { const s = ys.reduce((a, y) => a + (matrix[y]?.[x] || 0), 0); totalRow[x] = s; grand += s; });
  totalRow.__total = grand;
  ds.push(totalRow);

  const cell = (x) => (v, r) => {
    if (!v) return <span style={{ color: '#bfbfbf' }}>0</span>;
    if (r.__isTotal || !onCell) return v;
    return <a onClick={() => onCell({
      [cfg.dimension]: groupValues(cfg.groups, r.raw_y, cfg.dimension),
      [cfg.xAxisDimension]: groupValues(cfg.xAxisGroups, x, cfg.xAxisDimension),
    })}>{v}</a>;
  };

  const columns = [
    { title: dimName(cfg.dimension), dataIndex: '__name', align: 'center', fixed: 'left' },
    ...xs.map((x) => ({
      title: dispX(x), dataIndex: x, align: 'center',
      onCell: () => ({ style: { background: tint(colorOf(cfg.xAxisGroups, dispX(x)), 0.1) } }),
      render: cell(x),
    })),
    { title: '合计', dataIndex: '__total', align: 'center', render: (v) => <b>{v}</b> },
  ];

  return (
    <Table className={pivotClass} size="small" pagination={false}
      scroll={isMobile ? undefined : { x: 'max-content' }}
      dataSource={ds} columns={columns} rowClassName={(r) => (r.__isTotal ? 'pivot-total-row' : '')} />
  );
}

/** 把点击的展示值还原为底层原始值集合（用于钻取过滤） */
function groupValues(groups, raw, dim) {
  const g = (groups || []).find((x) => x.label === raw);
  if (g) return g.values;
  return [raw];
}

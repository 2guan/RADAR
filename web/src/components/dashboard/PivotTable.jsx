/**
 * PAMS 同款层级透视表：主维度（纵轴）和次维度（横轴）各自支持两层子维度。
 * 后端将分组树展开为 parent_y / parent_y_2、parent_x / parent_x_2；此处再还原为树行和多级表头。
 */

import React from 'react';
import { Table } from 'antd';
import { useResponsive } from '../../hooks/useResponsive.js';

const uniq = (arr) => [...new Set(arr.filter((x) => x != null))];
const groupOf = (groups, label) => (groups || []).find((g) => g.label === label);
const labelFor = (label, dim, groups, labelOf) => (groupOf(groups, label) ? label : labelOf(dim, label));

function filtersForPath(dim, groups, path) {
  if (!path?.length) return {};
  const filters = {};
  let currentDim = dim;
  let currentGroups = groups || [];
  path.forEach((value) => {
    const group = groupOf(currentGroups, value);
    filters[currentDim] = group ? group.values : [value];
    if (group?.subDimension) {
      currentDim = group.subDimension;
      currentGroups = group.subGroups || [];
    }
  });
  return filters;
}

function mergeFilters(...list) {
  const result = {};
  list.forEach((filters) => Object.entries(filters || {}).forEach(([dim, values]) => {
    result[dim] = values;
  }));
  return result;
}

function xHierarchy(data) {
  return uniq(data.filter((d) => !d.parent_x).map((d) => d.name_x)).map((main) => ({
    main,
    subs: uniq(data.filter((d) => d.parent_x === main && !d.parent_x_2).map((d) => d.name_x)).map((sub) => ({
      sub,
      subSubs: uniq(data.filter((d) => d.parent_x === main && d.parent_x_2 === sub).map((d) => d.name_x)),
    })),
  }));
}

function yHierarchy(data) {
  return uniq(data.filter((d) => !d.parent_y).map((d) => d.name_y ?? d.name)).map((main) => ({
    main,
    subs: uniq(data.filter((d) => d.parent_y === main && !d.parent_y_2).map((d) => d.name_y ?? d.name)).map((sub) => ({
      sub,
      subSubs: uniq(data.filter((d) => d.parent_y === main && d.parent_y_2 === sub).map((d) => d.name_y ?? d.name)),
    })),
  }));
}

function groupColor(groups, path) {
  const main = groupOf(groups, path[0]);
  const sub = main && groupOf(main.subGroups, path[1]);
  const subSub = sub && groupOf(sub.subGroups, path[2]);
  return subSub?.color || sub?.color || main?.color;
}

/** @param {object} p { cfg, data, labelOf, dimName, onCell } */
export default function PivotTable({ cfg, data = [], labelOf, dimName = (d) => d, onCell }) {
  const { isMobile } = useResponsive();
  const pivotClass = `dash-pivot${isMobile ? ' dash-pivot-compact' : ''}`;
  const is2D = data[0] && 'name_y' in data[0];
  const click = (filters, dimensionLabel) => onCell?.(filters, dimensionLabel);

  if (!is2D) {
    const hierarchy = yHierarchy(data);
    const makeRow = (main, sub, subSub, index) => {
      const path = [main, sub, subSub].filter(Boolean);
      const entry = data.find((d) => d.name === path.at(-1)
        && (d.parent_y || undefined) === (main === path.at(-1) ? undefined : main)
        && (d.parent_y_2 || undefined) === (sub && sub !== path.at(-1) ? sub : undefined));
      return { key: path.join('::') || index, name: path.at(-1), path, value: entry?.value || 0 };
    };
    const rows = hierarchy.map((node, index) => {
      const row = makeRow(node.main, null, null, index);
      row.children = node.subs.map((s, childIndex) => {
        const child = makeRow(node.main, s.sub, null, `${index}-${childIndex}`);
        child.children = s.subSubs.map((leaf, leafIndex) => makeRow(node.main, s.sub, leaf, `${index}-${childIndex}-${leafIndex}`));
        if (!child.children.length) delete child.children;
        return child;
      });
      if (!row.children.length) delete row.children;
      return row;
    });
    const total = rows.reduce((sum, r) => sum + r.value, 0);
    rows.push({ key: '__total', name: '合计', value: total, total: true, path: [] });
    return (
      <Table className={pivotClass} size="small" pagination={false} bordered tableLayout="fixed" dataSource={rows}
        expandable={{ defaultExpandAllRows: true, indentSize: 12 }} rowClassName={(r) => (r.total ? 'pivot-total-row' : '')}
        columns={[
          { title: dimName(cfg.dimension), dataIndex: 'name', align: 'center', render: (value, row) => {
            if (row.total) return value;
            let dim = cfg.dimension; let groups = cfg.groups;
            if (row.path.length > 1) { const group = groupOf(groups, row.path[0]); dim = group?.subDimension || dim; groups = group?.subGroups; }
            if (row.path.length > 2) { const group = groupOf(groups, row.path[1]); dim = group?.subDimension || dim; groups = group?.subGroups; }
            return <span className={row.path.length > 1 ? 'dash-pivot-sub-label' : ''}>{labelFor(value, dim, groups, labelOf)}</span>;
          } },
          { title: '数量', dataIndex: 'value', align: 'center', width: 88, render: (value, row) => {
            if (!value) return <span className="dash-pivot-zero">0</span>;
            if (row.total) return onCell ? <a style={{ color: 'inherit' }} onClick={() => click({}, '统计')}><b>{value}</b></a> : <b>{value}</b>;
            if (!onCell) return <b>{value}</b>;
            return <a onClick={() => click(filtersForPath(cfg.dimension, cfg.groups, row.path), dimName(cfg.dimension))}>{value}</a>;
          } },
        ]} />
    );
  }

  const xNodes = xHierarchy(data);
  const yNodes = yHierarchy(data);
  const leaves = xNodes.flatMap((x) => x.subs.length
    ? x.subs.flatMap((s) => s.subSubs.length ? s.subSubs.map((ss) => ({ x, sub: s.sub, subSub: ss })) : [{ x, sub: s.sub }])
    : [{ x }]);
  // 优先压缩列宽；只有所有叶子列的紧凑最小宽度仍超出容器时，才启用横向滚动。
  const valueColumnWidth = leaves.length >= 8 ? 56 : (leaves.length >= 6 ? 60 : (leaves.length >= 4 ? 66 : 78));
  const nameColumnWidth = 112;
  const totalColumnWidth = 66;
  const tableMinWidth = nameColumnWidth + totalColumnWidth + leaves.length * valueColumnWidth;
  const getValue = (yPath, leaf) => data.find((d) => d.name_y === yPath.at(-1)
    && (d.parent_y || undefined) === (yPath.length > 1 ? yPath[0] : undefined)
    && (d.parent_y_2 || undefined) === (yPath.length > 2 ? yPath[1] : undefined)
    && d.name_x === (leaf.subSub || leaf.sub || leaf.x.main)
    && (d.parent_x || undefined) === (leaf.sub ? leaf.x.main : undefined)
    && (d.parent_x_2 || undefined) === (leaf.subSub ? leaf.sub : undefined))?.value || 0;
  const makeRow = (main, sub, subSub, index) => {
    const path = [main, sub, subSub].filter(Boolean);
    const row = { key: path.join('::') || index, name: path.at(-1), path };
    leaves.forEach((leaf, i) => { row[`v${i}`] = getValue(path, leaf); });
    row.total = leaves.reduce((sum, _, i) => sum + row[`v${i}`], 0);
    return row;
  };
  const rows = yNodes.map((node, index) => {
    const row = makeRow(node.main, null, null, index);
    row.children = node.subs.map((s, childIndex) => {
      const child = makeRow(node.main, s.sub, null, `${index}-${childIndex}`);
      child.children = s.subSubs.map((leaf, leafIndex) => makeRow(node.main, s.sub, leaf, `${index}-${childIndex}-${leafIndex}`));
      if (!child.children.length) delete child.children;
      return child;
    });
    if (!row.children.length) delete row.children;
    return row;
  });
  const summary = { key: '__total', name: '合计', total: 0, totalRow: true, path: [] };
  leaves.forEach((_, i) => { summary[`v${i}`] = rows.reduce((sum, row) => sum + row[`v${i}`], 0); summary.total += summary[`v${i}`]; });
  rows.push(summary);

  const cell = (leaf, index) => (value, row) => {
    if (!value) return <span className="dash-pivot-zero">0</span>;
    const xPath = [leaf.x.main, leaf.sub, leaf.subSub].filter(Boolean);
    if (row.totalRow) {
      return onCell ? <a style={{ color: 'inherit' }} onClick={() => click(
        filtersForPath(cfg.xAxisDimension, cfg.xAxisGroups, xPath), dimName(cfg.xAxisDimension),
      )}><b>{value}</b></a> : <b>{value}</b>;
    }
    if (!onCell) return <b>{value}</b>;
    return <a style={{ color: groupColor(cfg.xAxisGroups, xPath) }} onClick={() => click(mergeFilters(
      filtersForPath(cfg.dimension, cfg.groups, row.path), filtersForPath(cfg.xAxisDimension, cfg.xAxisGroups, xPath),
    ), dimName(cfg.xAxisDimension))}>{value}</a>;
  };
  const xColumns = xNodes.map((x) => {
    const mainLabel = labelFor(x.main, cfg.xAxisDimension, cfg.xAxisGroups, labelOf);
    if (!x.subs.length) {
      const index = leaves.findIndex((l) => l.x.main === x.main && !l.sub);
      return { title: mainLabel, dataIndex: `v${index}`, align: 'center', width: valueColumnWidth, render: cell(leaves[index], index) };
    }
    return {
      title: mainLabel,
      children: x.subs.map((s) => {
        const parentGroup = groupOf(cfg.xAxisGroups, x.main);
        const subDim = parentGroup?.subDimension || cfg.xAxisDimension;
        const subLabel = labelFor(s.sub, subDim, parentGroup?.subGroups, labelOf);
        if (!s.subSubs.length) {
          const index = leaves.findIndex((l) => l.x.main === x.main && l.sub === s.sub && !l.subSub);
          return { title: subLabel, dataIndex: `v${index}`, align: 'center', width: valueColumnWidth, render: cell(leaves[index], index) };
        }
        return {
          title: subLabel,
          children: s.subSubs.map((ss) => {
            const subGroup = groupOf(parentGroup?.subGroups, s.sub);
            const dim = subGroup?.subDimension || subDim;
            const index = leaves.findIndex((l) => l.x.main === x.main && l.sub === s.sub && l.subSub === ss);
            return { title: labelFor(ss, dim, subGroup?.subGroups, labelOf), dataIndex: `v${index}`, align: 'center', width: valueColumnWidth, render: cell(leaves[index], index) };
          }),
        };
      }),
    };
  });
  return (
    <Table className={pivotClass} size="small" pagination={false} bordered tableLayout="fixed" dataSource={rows}
      scroll={isMobile ? undefined : { x: tableMinWidth }} expandable={{ defaultExpandAllRows: true, indentSize: 12 }}
      rowClassName={(r) => (r.totalRow ? 'pivot-total-row' : '')}
      columns={[
        { title: dimName(cfg.dimension), dataIndex: 'name', fixed: isMobile ? undefined : 'left', width: nameColumnWidth, align: 'center', render: (value, row) => {
          if (row.totalRow) return value;
          let dim = cfg.dimension; let groups = cfg.groups;
          if (row.path.length > 1) { const group = groupOf(groups, row.path[0]); dim = group?.subDimension || dim; groups = group?.subGroups; }
          if (row.path.length > 2) { const group = groupOf(groups, row.path[1]); dim = group?.subDimension || dim; groups = group?.subGroups; }
          return <span className={row.path.length > 1 ? 'dash-pivot-sub-label' : ''}>{labelFor(value, dim, groups, labelOf)}</span>;
        } },
        ...xColumns,
        { title: '合计', dataIndex: 'total', fixed: isMobile ? undefined : 'right', width: totalColumnWidth, align: 'center', render: (value, row) => {
          if (!value) return <span className="dash-pivot-zero">0</span>;
          if (row.totalRow) return onCell ? <a style={{ color: 'inherit' }} onClick={() => click({}, '统计')}><b>{value}</b></a> : <b>{value}</b>;
          return <a style={{ color: 'inherit' }} onClick={() => click(filtersForPath(cfg.dimension, cfg.groups, row.path), dimName(cfg.dimension))}><b>{value}</b></a>;
        } },
      ]} />
  );
}

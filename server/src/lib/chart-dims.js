/**
 * 文件：lib/chart-dims.js
 * 用途：分析图表的「数据源 × 维度」注册表与聚合引擎。声明每个数据源可用的维度、
 *       维度取值方式与显示来源，并提供 1D/2D 透视聚合（含分组归并、局部过滤）。
 * 作者：hengguan
 * 说明：RADAR 为多源模型（需求/开发/测试/投产系统），维度取值随源变化；含 JSON
 *       数组维度（系统/机构/板块）按元素展开计数。聚合在内存完成，贴合跨表/JSON 维度。
 */

import { all } from '../db/index.js';
import { isTerminalStatus } from './status.js';

// ---------------------------------------------------------------------------
// 维度元数据（label 与选项来源；optionSource 供前端决定下拉/预设取数方式）
//   dict:<cat> 取字典；system 取系统列表；release_point 取投产点；date 时间；free 自由文本
// ---------------------------------------------------------------------------
export const DIMENSIONS = {
  status: { label: '状态', optionSource: 'dict:process_status', isDate: false },
  req_type: { label: '需求类型', optionSource: 'dict:req_type', isDate: false },
  ticket_type: { label: '工单类型', optionSource: 'dict:ticket_type', isDate: false },
  propose_dept: { label: '提出部门', optionSource: 'dict:org', isDate: false },
  org: { label: '实施机构', optionSource: 'dict:org', isDate: false },
  sector: { label: '业务板块', optionSource: 'dict:sector', isDate: false },
  system: { label: '所属系统', optionSource: 'system', isDate: false },
  owner: { label: '负责人', optionSource: 'free', isDate: false },
  release_point: { label: '投产点', optionSource: 'release_point', isDate: false },
  propose_time_day: { label: '提出时间(日)', optionSource: 'date', isDate: true },
  plan_end_day: { label: '计划完成(日)', optionSource: 'date', isDate: true },
  actual_end_day: { label: '实际完成(日)', optionSource: 'date', isDate: true },
  actual_release_day: { label: '实际投产(日)', optionSource: 'date', isDate: true },
  stage: { label: '任务阶段', optionSource: 'stage', isDate: false },
  task_status: { label: '任务状态', optionSource: 'task_status', isDate: false },
};

// 时间维度 → 记录字段
const DATE_FIELD = {
  propose_time_day: 'propose_time',
  plan_end_day: 'plan_end',
  actual_end_day: 'actual_end',
  actual_release_day: 'actual_release_time',
};

// ---------------------------------------------------------------------------
// 数据源注册表：label、加载 SQL、可用维度集合
// ---------------------------------------------------------------------------
export const SOURCES = {
  requirement: {
    label: '业务需求',
    dims: ['status', 'req_type', 'propose_dept', 'org', 'sector', 'system', 'release_point', 'propose_time_day', 'stage', 'task_status'],
  },
  ticket: {
    label: '生产工单',
    dims: ['status', 'ticket_type', 'propose_dept', 'org', 'sector', 'system', 'release_point', 'propose_time_day', 'stage', 'task_status'],
  },
  dev: {
    label: '开发任务',
    dims: ['status', 'org', 'sector', 'system', 'owner', 'plan_end_day', 'actual_end_day'],
  },
  sit: { label: '应用组装测试', dims: ['status', 'org', 'sector', 'system', 'owner', 'plan_end_day', 'actual_end_day'] },
  uat: { label: '用户测试', dims: ['status', 'org', 'sector', 'system', 'owner', 'plan_end_day', 'actual_end_day'] },
  nft: { label: '非功能测试', dims: ['status', 'org', 'sector', 'system', 'owner', 'plan_end_day', 'actual_end_day'] },
  sec: { label: '安全测试', dims: ['status', 'org', 'sector', 'system', 'owner', 'plan_end_day', 'actual_end_day'] },
  releaseSystem: { label: '投产系统', dims: ['status', 'org', 'sector', 'system', 'actual_release_day'] },
  all: {
    label: '全部',
    dims: ['status', 'org', 'sector', 'system'],
  },
};

export const CHART_TYPES = [
  { value: 'pie', label: '饼图' },
  { value: 'bar', label: '柱状图' },
  { value: 'horizontal_bar', label: '横向柱状图' },
  { value: 'stacked_bar', label: '堆叠柱状图(纵向)' },
  { value: 'stacked_bar_horizontal', label: '堆叠柱状图(横向)' },
  { value: 'line', label: '折线图' },
  { value: 'area', label: '面积图' },
  { value: 'table', label: '表格' },
];

const TEST_TYPE_OF = { sit: 'SIT', uat: 'UAT', nft: 'NFT', sec: 'SEC' };

/** 计算一组任务的节点状态（含单一代表状态 status，供阶段标签展示） */
function nodeState(tasks) {
  if (!tasks.length) return { state: 'pending', text: null, status: null };
  const allTerminal = tasks.every((t) => isTerminalStatus(t.status));
  const nonTerminal = tasks.find((t) => !isTerminalStatus(t.status));
  const status = nonTerminal ? nonTerminal.status : tasks[tasks.length - 1].status;
  const text = tasks.map((t) => t.status).join('、');
  return { state: allTerminal ? 'done' : 'doing', text, status };
}

/** 构建单需求/工单链路概要 */
function buildChain(req, devMap = {}, testMap = {}, rtMap = {}) {
  const code = req.req_code || req.ticket_code;
  const firstLabel = req.ticket_code ? '工单' : '需求';
  const dev = devMap[code] || [];
  const t = testMap[code] || {};
  const sit = t.SIT || [];
  const nft = t.NFT || [];
  const sec = t.SEC || [];
  const uat = t.UAT || [];
  const rtStatus = rtMap[code];
  const rt = rtStatus ? { status: rtStatus } : null;

  // 阶段顺序：需求/工单 / 开发 / 应用组装 / 非功能测试(按需) / 安全测试(按需) / 用户测试 / 投产
  const nodes = [
    { key: firstLabel, label: firstLabel, ...nodeState([{ status: req.status }]) },
    { key: '开发', label: '开发', ...nodeState(dev) },
    { key: 'SIT', label: '应用组装', ...nodeState(sit) },
  ];
  if (nft.length) nodes.push({ key: 'NFT', label: '非功能测试', ...nodeState(nft) });
  if (sec.length) nodes.push({ key: 'SEC', label: '安全测试', ...nodeState(sec) });
  nodes.push({ key: 'UAT', label: '用户测试', ...nodeState(uat) });
  nodes.push({ key: '投产', label: '投产', ...nodeState(rt ? [{ status: rt.status === '已投产' ? '已上线' : '待评审' }] : []) });

  return { nodes };
}

// ---------------------------------------------------------------------------
// 上下文：系统映射（编号→名称/机构/板块），构造一次复用
// ---------------------------------------------------------------------------
export function buildContext() {
  const sysMap = {};
  for (const s of all('SELECT sys_code, sys_name, org, sector FROM system')) {
    sysMap[s.sys_code] = { name: s.sys_name, org: s.org, sector: s.sector };
  }

  const devMap = {};
  for (const d of all('SELECT id, req_code, status, impl_system, impl_org FROM dev_task ORDER BY id ASC')) {
    (devMap[d.req_code] ||= []).push(d);
  }

  const testMap = {};
  for (const t of all('SELECT req_code, test_type, status FROM test_task')) {
    const bucket = (testMap[t.req_code] ||= {});
    (bucket[t.test_type] ||= []).push({ status: t.status });
  }

  const rtMap = {};
  for (const rt of all('SELECT req_code, status FROM release_task')) {
    rtMap[rt.req_code] = rt.status;
  }

  return { sysMap, devMap, testMap, rtMap };
}

/** 取一条记录涉及的系统编号数组（随源不同字段） */
function systemCodes(source, row) {
  if (source === 'requirement' || source === 'ticket') {
    try { const a = JSON.parse(row.main_systems || '[]'); return Array.isArray(a) ? a.filter(Boolean) : []; }
    catch { return []; }
  }
  if (source === 'releaseSystem') return row.system_code ? [row.system_code] : [];
  return row.impl_system ? [row.impl_system] : [];
}

function uniq(arr) { return Array.from(new Set(arr)); }

/**
 * 维度取值抽取器：返回该记录在某维度上的原始值数组（可能多值）。
 * @returns {string[]}
 */
export function extract(source, dim, row, ctx) {
  const realSource = source === 'all' ? row._source : source;
  const { sysMap } = ctx;
  switch (dim) {
    case 'status': return [row.status || '未知'];
    case 'req_type': return [row.req_type || '未分类'];
    case 'ticket_type': return [row.ticket_type || '未分类'];
    case 'propose_dept': return [row.propose_dept || '未分配'];
    case 'owner': return [row.owner || '未分配'];
    case 'release_point': return [row.release_point_id != null ? String(row.release_point_id) : '未分配'];
    case 'system': {
      const codes = systemCodes(realSource, row);
      return codes.length ? uniq(codes) : ['未指定'];
    }
    case 'org': {
      if (realSource === 'requirement' || realSource === 'ticket') {
        const orgs = uniq(systemCodes(realSource, row).map((c) => sysMap[c]?.org).filter(Boolean));
        if (orgs.length) return orgs;
        return [row.propose_dept || '未分配'];
      }
      if (row.impl_org) return [row.impl_org];
      const orgs = uniq(systemCodes(realSource, row).map((c) => sysMap[c]?.org).filter(Boolean));
      return orgs.length ? orgs : ['未分配'];
    }
    case 'sector': {
      const sectors = uniq(systemCodes(realSource, row).map((c) => sysMap[c]?.sector).filter(Boolean));
      return sectors.length ? sectors : ['未分类'];
    }
    case 'stage': {
      if (realSource !== 'requirement' && realSource !== 'ticket') return ['未知'];
      const chain = buildChain(row, ctx.devMap, ctx.testMap, ctx.rtMap);
      let current = chain.nodes.find((n) => n.state === 'doing');
      if (!current) {
        const dones = chain.nodes.filter((n) => n.state === 'done');
        current = dones[dones.length - 1] || chain.nodes[0];
      }
      return [current.label || '需求'];
    }
    case 'task_status': {
      if (realSource !== 'requirement' && realSource !== 'ticket') return ['未知'];
      const chain = buildChain(row, ctx.devMap, ctx.testMap, ctx.rtMap);
      let current = chain.nodes.find((n) => n.state === 'doing');
      if (!current) {
        const dones = chain.nodes.filter((n) => n.state === 'done');
        current = dones[dones.length - 1] || chain.nodes[0];
      }
      const stg = current.label;
      const status = current.status || '未开始';
      return [`${stg}-${status}`];
    }
    default: {
      if (DATE_FIELD[dim]) {
        const v = row[DATE_FIELD[dim]];
        return [v ? String(v).slice(0, 10) : '未分配'];
      }
      return [row[dim] != null ? String(row[dim]) : '未知'];
    }
  }
}

/** 局部过滤：filters = { dim: 值[] | [起,止] }（时间维度支持区间） */
export function matchFilters(source, row, filters, ctx) {
  const realSource = source === 'all' ? row._source : source;
  if (!filters) return true;
  for (const [dim, raw] of Object.entries(filters)) {
    if (raw == null) continue;
    const val = Array.isArray(raw) ? raw : [raw];
    if (!val.length) continue;
    const vals = extract(realSource, dim, row, ctx);
    if (DIMENSIONS[dim]?.isDate && val.length === 2) {
      const [start, end] = val;
      const hit = vals.some((v) => v !== '未分配' && v >= start && v <= end);
      if (!hit) return false;
    } else {
      const hit = vals.some((v) => val.includes(v));
      if (!hit) return false;
    }
  }
  return true;
}

/** 1D 分组归并（照搬 PAMS 规则：命中分组并入 label、占位符保留原值、其余落"其它"） */
function mergeGroups1D(buckets, groups, dim) {
  const isDate = DIMENSIONS[dim]?.isDate;
  if (!groups || !groups.length) {
    return Object.entries(buckets)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => (isDate ? a.name.localeCompare(b.name) : b.value - a.value));
  }
  const result = {};
  groups.forEach((g) => { result[g.label] = 0; });
  result['其它'] = 0;
  const hasPlaceholder = groups.some((g) => g.values?.includes(dim));
  for (const [name, value] of Object.entries(buckets)) {
    const g = groups.find((x) => x.values?.includes(name));
    if (g) result[g.label] += value;
    else if (hasPlaceholder) result[name] = (result[name] || 0) + value;
    else result['其它'] += value;
  }
  const order = groups.map((g) => g.label);
  return Object.entries(result)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => {
      const ia = order.indexOf(a.name); const ib = order.indexOf(b.name);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return isDate ? a.name.localeCompare(b.name) : b.value - a.value;
    });
}

/** 把单个原始值映射到分组 label（无分组则返回原值） */
function labelInGroups(name, groups, dim) {
  if (!groups || !groups.length) return name;
  const g = groups.find((x) => x.values?.includes(name));
  if (g) return g.label;
  if (groups.some((x) => x.values?.includes(dim))) return name;
  return '其它';
}

/** 2D 透视归并：返回 [{name_y,name_x,value}] */
function mergeGroups2D(buckets, groups, xGroups, dim, xDim) {
  const matrix = {};
  for (const [key, value] of Object.entries(buckets)) {
    const [y, x] = key.split(' ');
    const ly = labelInGroups(y, groups, dim);
    const lx = labelInGroups(x, xGroups, xDim);
    matrix[ly] = matrix[ly] || {};
    matrix[ly][lx] = (matrix[ly][lx] || 0) + value;
  }
  const yOrder = (groups || []).map((g) => g.label);
  const xOrder = (xGroups || []).map((g) => g.label);
  const isYDate = DIMENSIONS[dim]?.isDate;
  const isXDate = DIMENSIONS[xDim]?.isDate;
  const out = [];
  for (const [name_y, xMap] of Object.entries(matrix)) {
    for (const [name_x, value] of Object.entries(xMap)) out.push({ name_y, name_x, value });
  }
  return out.sort((a, b) => {
    const iya = yOrder.indexOf(a.name_y); const iyb = yOrder.indexOf(b.name_y);
    let yc = 0;
    if (iya !== -1 && iyb !== -1) yc = iya - iyb;
    else if (iya !== -1) yc = -1;
    else if (iyb !== -1) yc = 1;
    else if (isYDate) yc = a.name_y.localeCompare(b.name_y);
    if (yc !== 0) return yc;
    const ixa = xOrder.indexOf(a.name_x); const ixb = xOrder.indexOf(b.name_x);
    if (ixa !== -1 && ixb !== -1) return ixa - ixb;
    if (ixa !== -1) return -1;
    if (ixb !== -1) return 1;
    if (isXDate) return a.name_x.localeCompare(b.name_x);
    return 0;
  });
}

/**
 * 聚合主入口。
 * @param {object} p { source, dimension, xAxisDimension?, filters?, groups?, xAxisGroups?, rows, ctx }
 * @returns 1D: [{name,value}] | 2D: [{name_y,name_x,value}]
 */
export function aggregate({ source, dimension, xAxisDimension, filters, groups, xAxisGroups, rows, ctx }) {
  const filtered = rows.filter((r) => matchFilters(source, r, filters, ctx));
  if (!xAxisDimension) {
    const buckets = {};
    for (const r of filtered) {
      for (const v of extract(source, dimension, r, ctx)) buckets[v] = (buckets[v] || 0) + 1;
    }
    return mergeGroups1D(buckets, groups, dimension);
  }
  const buckets = {};
  for (const r of filtered) {
    const ys = extract(source, dimension, r, ctx);
    const xs = extract(source, xAxisDimension, r, ctx);
    for (const y of ys) for (const x of xs) {
      const key = `${y} ${x}`;
      buckets[key] = (buckets[key] || 0) + 1;
    }
  }
  return mergeGroups2D(buckets, groups, xAxisGroups, dimension, xAxisDimension);
}

/** 校验维度是否属于该源（防注入/越权维度） */
export function isValidDim(source, dim) {
  return !!dim && SOURCES[source]?.dims.includes(dim);
}

/** 取测试源对应的 test_type（非测试源返回 null） */
export function testTypeOf(source) { return TEST_TYPE_OF[source] || null; }

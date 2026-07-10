/**
 * 文件：lib/impact-schema.js
 * 用途：影响性分析 / 测试覆盖性分析的权威字段模型与校验。
 *       定义 11 类变更内容各自需要填写的字段集合、字段规则，并提供后端入库前校验。
 * 作者：hengguan
 * 说明：前端 web/src/config/impactSchema.js 是本文件的展示层镜像，二者需保持一致；
 *       本文件为服务端校验的唯一权威来源。
 */

import { badRequest } from './http.js';

// 变更类型下拉值
export const CHANGE_KINDS = ['修改', '新增', '删除'];
// 是/否
export const YES_NO = ['是', '否'];
// 测试覆盖检查结果
export const COVERAGE_RESULTS = ['未覆盖', '已覆盖'];

/**
 * 字段定义表：key -> { label, type, min, max, requiredIf }
 * type: system(系统名称) / systems(多系统) / kind(变更类型) / yesno / text
 * min/max：字符数限制（text 类），未设即不限制
 */
export const FIELD_DEFS = {
  system: { label: '系统名称', type: 'system', required: true },
  change_kind: { label: '变更类型', type: 'kind', required: true },
  change_content: { label: '变更内容', type: 'text', min: 5, max: 1000, required: true },
  artifact: { label: '对应制品/脚本', type: 'text', required: true },
  impact_analysis: { label: '影响分析', type: 'text', min: 5, max: 1000, required: true },
  involve_other: { label: '是否涉及其他系统', type: 'yesno', required: true },
  involve_other_systems: { label: '影响系统', type: 'systems', requiredWhen: ['involve_other', '是'] },
  upstream_impact: { label: '对上下游接口的影响分析', type: 'text', required: true },
  data_impact: { label: '对存量数据的影响分析', type: 'text', required: true },
  job_chain_change: { label: '是否涉及本系统作业链依赖关系变更', type: 'yesno', required: true },
  job_chain_change_detail: { label: '作业链依赖变更内容', type: 'text', requiredWhen: ['job_chain_change', '是'] },
  updown_dep_change: { label: '是否涉及上下游系统依赖关系变更', type: 'yesno', required: true },
  updown_dep_change_detail: { label: '上下游依赖变更内容', type: 'text', requiredWhen: ['updown_dep_change', '是'] },
  runtime_change: { label: '是否存在运行时长明显变化', type: 'yesno', required: true },
  runtime_change_detail: { label: '运行时长变化说明', type: 'text', requiredWhen: ['runtime_change', '是'] },
};

// 三种字段组合
const GROUP_A = ['system', 'change_kind', 'change_content', 'artifact', 'impact_analysis', 'involve_other', 'involve_other_systems'];
const GROUP_B = ['system', 'change_kind', 'change_content', 'artifact', 'upstream_impact', 'data_impact', 'involve_other', 'involve_other_systems'];
const GROUP_C = ['system', 'change_kind', 'change_content', 'artifact', 'job_chain_change', 'job_chain_change_detail', 'updown_dep_change', 'updown_dep_change_detail', 'runtime_change', 'runtime_change_detail'];

/**
 * 变更内容分类 -> 字段列表
 */
export const CATEGORY_FIELDS = {
  '联机接口/功能': GROUP_A,
  '公共模块/方法/函数': GROUP_A,
  '数据库表（联机）': GROUP_B,
  '批处理（交易线、联机系统）': GROUP_C,
  'P9/加工脚本变更（数据线系统）': GROUP_B,
  'P10报表': GROUP_A,
  '前端P2': GROUP_A,
  '变更P2菜单': GROUP_A,
  '基础组件': GROUP_A,
  '视图': GROUP_A,
  '外联系统': GROUP_A,
};

export const CHANGE_CATEGORIES = Object.keys(CATEGORY_FIELDS);

// 提升为独立列的基础字段（其余进入 detail JSON）
const COLUMN_FIELDS = ['system', 'change_kind', 'change_content'];

/**
 * 校验并归一化一条变更条目。
 * @returns {{ category, system, change_kind, change_content, detail }} 归一化结果（detail 为 JSON 字符串）
 */
export function validateChangeItem(raw) {
  const item = raw || {};
  const category = String(item.category || '').trim();
  if (!CATEGORY_FIELDS[category]) {
    throw badRequest(`变更内容分类非法：${category || '（空）'}`);
  }
  const fields = CATEGORY_FIELDS[category];
  const clean = {};

  for (const key of fields) {
    const def = FIELD_DEFS[key];
    let val = item[key];

    // 条件必填：仅当依赖字段取到指定值时才必填/保留
    if (def.requiredWhen) {
      const [depKey, depVal] = def.requiredWhen;
      const active = String(item[depKey] || '').trim() === depVal;
      if (!active) { clean[key] = def.type === 'systems' ? [] : ''; continue; }
    }

    if (def.type === 'systems') {
      const arr = Array.isArray(val) ? val.map((s) => String(s).trim()).filter(Boolean) : [];
      const mustFill = def.required || def.requiredWhen;
      if (mustFill && arr.length === 0) throw badRequest(`「${def.label}」至少填写一个系统`);
      clean[key] = arr;
      continue;
    }

    val = val == null ? '' : String(val).trim();

    if (def.type === 'kind') {
      if (!CHANGE_KINDS.includes(val)) throw badRequest(`「${def.label}」必须为 修改/新增/删除`);
      clean[key] = val;
      continue;
    }
    if (def.type === 'yesno') {
      if (!YES_NO.includes(val)) throw badRequest(`「${def.label}」必须为 是/否`);
      clean[key] = val;
      continue;
    }
    // system / text
    const mustFill = def.required || def.requiredWhen;
    if (mustFill && !val) throw badRequest(`「${def.label}」不能为空`);
    if (def.min && val.length < def.min) throw badRequest(`「${def.label}」不少于 ${def.min} 个字`);
    if (def.max && val.length > def.max) throw badRequest(`「${def.label}」不大于 ${def.max} 个字`);
    clean[key] = val;
  }

  // 拆分为独立列 + detail JSON
  const detail = {};
  for (const [k, v] of Object.entries(clean)) {
    if (!COLUMN_FIELDS.includes(k)) detail[k] = v;
  }
  return {
    category,
    system: clean.system || '',
    change_kind: clean.change_kind || '',
    change_content: clean.change_content || '',
    detail: JSON.stringify(detail),
  };
}

/**
 * 将数据库行还原为前端条目结构（展开 detail）。
 */
export function decodeChangeItem(row) {
  let detail = {};
  try { detail = row.detail ? JSON.parse(row.detail) : {}; } catch { detail = {}; }
  return {
    id: row.id,
    req_code: row.req_code,
    category: row.category,
    system: row.system || '',
    change_kind: row.change_kind || '',
    change_content: row.change_content || '',
    sort_order: row.sort_order ?? 0,
    ...detail,
  };
}

function exportFieldValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('、') || '—';
  return value == null || value === '' ? '—' : String(value);
}

function exportVisibleFields(item) {
  return (CATEGORY_FIELDS[item.category] || []).filter((key) => {
    const def = FIELD_DEFS[key];
    if (!def.requiredWhen) return true;
    const [depKey, depValue] = def.requiredWhen;
    return String(item[depKey] || '').trim() === depValue;
  });
}

/** 单条影响性分析的导出字段行，可供 Excel 与 Word 复用。 */
export function impactItemExportLines(row, { includeCategory = true } = {}) {
  const item = decodeChangeItem(row);
  const fields = exportVisibleFields(item);
  const lines = includeCategory ? [`变更分类：${exportFieldValue(item.category)}`] : [];
  for (const key of fields) lines.push(`${FIELD_DEFS[key].label}：${exportFieldValue(item[key])}`);
  return lines;
}

/** 单条测试覆盖分析的导出字段行，可供 Excel 与 Word 复用。 */
export function coverageItemExportLines(item, coverage, { includeCategory = true } = {}) {
  const impact = decodeChangeItem(item);
  const row = coverage || {};
  const lines = includeCategory ? [`影响性分析分类：${exportFieldValue(impact.category)}`] : [];
  return [
    ...lines,
    `系统名称：${exportFieldValue(impact.system)}`,
    `变更内容：${exportFieldValue(impact.change_content)}`,
    `案例覆盖策略简述：${exportFieldValue(row.strategy)}`,
    `测试案例编号：${exportFieldValue(row.case_no)}`,
    `测试人员：${exportFieldValue(row.tester)}`,
    `测试覆盖检查结果：${exportFieldValue(row.result)}`,
  ];
}

/**
 * 将若干影响性分析条目的全部适用字段格式化到一个单元格（用于导出）。
 */
export function formatImpactItemsText(rows) {
  return (rows || []).map((r, i) => {
    const lines = impactItemExportLines(r);
    lines[0] = `${i + 1}. ${lines[0]}`;
    return lines.join('\n');
  }).join('\n\n');
}

/**
 * 将影响性分析分类、系统名称、变更内容及完整测试覆盖内容格式化到一个单元格（用于测试导出）。
 * @param {Array} items 影响条目行
 * @param {Map} covMap change_item_id -> coverage_item
 */
export function formatCoverageText(items, covMap) {
  return (items || []).map((it, i) => {
    const lines = coverageItemExportLines(it, covMap.get(it.id));
    lines[0] = `${i + 1}. ${lines[0]}`;
    return lines.join('\n');
  }).join('\n\n');
}

// ---- 测试覆盖性分析字段 ----
export const COVERAGE_FIELD_DEFS = {
  strategy: { label: '案例覆盖策略简述', type: 'text', min: 5, max: 1000, required: true },
  result: { label: '测试覆盖检查结果', type: 'enum', options: COVERAGE_RESULTS, required: true },
  case_no: { label: '测试案例编号', type: 'text', min: 5, max: 1000, required: true },
  tester: { label: '测试人员', type: 'text', min: 2, max: 100, required: true },
};

/**
 * 校验并归一化一条覆盖登记。
 */
export function validateCoverageRow(raw) {
  const item = raw || {};
  const clean = {};
  for (const [key, def] of Object.entries(COVERAGE_FIELD_DEFS)) {
    const val = item[key] == null ? '' : String(item[key]).trim();
    if (def.type === 'enum') {
      if (!def.options.includes(val)) throw badRequest(`「${def.label}」必须为 ${def.options.join('/')}`);
      clean[key] = val;
      continue;
    }
    if (def.required && !val) throw badRequest(`「${def.label}」不能为空`);
    if (def.min && val.length < def.min) throw badRequest(`「${def.label}」不少于 ${def.min} 个字`);
    if (def.max && val.length > def.max) throw badRequest(`「${def.label}」不大于 ${def.max} 个字`);
    clean[key] = val;
  }
  return clean;
}

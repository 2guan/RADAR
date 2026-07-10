/**
 * 文件：config/impactSchema.js
 * 用途：影响性分析 / 测试覆盖性分析的前端字段模型（展示层）。
 *       驱动变更条目表单按分类渲染对应字段、字段类型与校验提示。
 * 作者：hengguan
 * 说明：本文件是服务端 server/src/lib/impact-schema.js 的展示镜像，二者需保持一致。
 */

export const CHANGE_KINDS = ['修改', '新增', '删除'];
export const YES_NO = ['是', '否'];
export const COVERAGE_RESULTS = ['未覆盖', '已覆盖'];

// 字段定义：key -> { label, type, min, max, span, requiredWhen }
// type: system / systems / kind / yesno / text
// span：PC 端在一行中占的相对宽度（flex-grow 权重），文本类给更大权重
export const FIELD_DEFS = {
  system: { label: '系统名称', type: 'system', required: true, span: 1.4 },
  change_kind: { label: '变更类型', type: 'kind', required: true, span: 1 },
  change_content: { label: '变更内容', type: 'text', min: 5, max: 1000, required: true, span: 2.2 },
  artifact: { label: '对应制品/脚本', type: 'text', required: true, span: 1.6 },
  impact_analysis: { label: '影响分析', type: 'text', min: 5, max: 1000, required: true, span: 2.2 },
  involve_other: { label: '是否涉及其他系统', type: 'yesno', required: true, span: 1 },
  involve_other_systems: { label: '影响系统', type: 'systems', requiredWhen: ['involve_other', '是'], span: 1.6 },
  upstream_impact: { label: '对上下游接口的影响分析', type: 'text', required: true, span: 2 },
  data_impact: { label: '对存量数据的影响分析', type: 'text', required: true, span: 2 },
  job_chain_change: { label: '是否涉及本系统作业链依赖关系变更', type: 'yesno', required: true, span: 1.4 },
  job_chain_change_detail: { label: '作业链依赖变更内容', type: 'text', requiredWhen: ['job_chain_change', '是'], span: 1.8 },
  updown_dep_change: { label: '是否涉及上下游系统依赖关系变更', type: 'yesno', required: true, span: 1.4 },
  updown_dep_change_detail: { label: '上下游依赖变更内容', type: 'text', requiredWhen: ['updown_dep_change', '是'], span: 1.8 },
  runtime_change: { label: '是否存在运行时长明显变化', type: 'yesno', required: true, span: 1.4 },
  runtime_change_detail: { label: '运行时长变化说明', type: 'text', requiredWhen: ['runtime_change', '是'], span: 1.8 },
};

const GROUP_A = ['system', 'change_kind', 'change_content', 'artifact', 'impact_analysis', 'involve_other', 'involve_other_systems'];
const GROUP_B = ['system', 'change_kind', 'change_content', 'artifact', 'upstream_impact', 'data_impact', 'involve_other', 'involve_other_systems'];
const GROUP_C = ['system', 'change_kind', 'change_content', 'artifact', 'job_chain_change', 'job_chain_change_detail', 'updown_dep_change', 'updown_dep_change_detail', 'runtime_change', 'runtime_change_detail'];

// 变更内容分类 -> 字段列表
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

/**
 * 前端轻量校验：返回错误信息数组（空数组表示通过）。
 * 与后端 impact-schema.js 规则保持一致，用于保存前拦截给出友好提示。
 */
export function validateItems(items) {
  const errs = [];
  items.forEach((it, idx) => {
    const fields = CATEGORY_FIELDS[it.category];
    if (!fields) { errs.push(`第 ${idx + 1} 条：分类非法`); return; }
    for (const key of fields) {
      const def = FIELD_DEFS[key];
      // 条件字段未激活则跳过
      if (def.requiredWhen) {
        const [dk, dv] = def.requiredWhen;
        if (String(it[dk] || '').trim() !== dv) continue;
      }
      if (def.type === 'systems') {
        const arr = Array.isArray(it[key]) ? it[key].filter(Boolean) : [];
        if ((def.required || def.requiredWhen) && arr.length === 0) errs.push(`第 ${idx + 1} 条「${def.label}」至少填写一个系统`);
        continue;
      }
      const val = it[key] == null ? '' : String(it[key]).trim();
      if (def.type === 'kind') { if (!CHANGE_KINDS.includes(val)) errs.push(`第 ${idx + 1} 条「${def.label}」请选择`); continue; }
      if (def.type === 'yesno') { if (!YES_NO.includes(val)) errs.push(`第 ${idx + 1} 条「${def.label}」请选择`); continue; }
      if ((def.required || def.requiredWhen) && !val) { errs.push(`第 ${idx + 1} 条「${def.label}」不能为空`); continue; }
      if (def.min && val.length < def.min) errs.push(`第 ${idx + 1} 条「${def.label}」不少于 ${def.min} 个字`);
      if (def.max && val.length > def.max) errs.push(`第 ${idx + 1} 条「${def.label}」不大于 ${def.max} 个字`);
    }
  });
  return errs;
}

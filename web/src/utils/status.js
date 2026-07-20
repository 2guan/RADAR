/**
 * 文件：utils/status.js
 * 用途：前端状态语义分类。优先使用后端字典 extra.stateType/isTerminal，
 *       字典尚未加载时使用兜底规则，保证刷新首屏可正常渲染。
 * 作者：hengguan
 */

const catalog = new Map();

function normalizeCssType(extra = {}) {
  const raw = String(extra.stateType || '').trim();
  if (raw === 'initial') return 'initial';
  if (raw === 'final' || extra.isTerminal === true) return 'final';
  return 'in-progress';
}

function fallbackType(status) {
  if (!status) return 'not-started';
  const val = String(status).trim();
  if (val.includes('未') || val === '—' || val === '不涉及') return 'not-started';
  if (val.includes('驳回') || val.includes('取消') || val.includes('失败') || val.includes('拒绝') || val.includes('驳')) return 'error';
  // 投产状态需优先于通用的“投产”终态关键词判断：待投产仍处于流程进行中。
  if (val === '待投产') return 'in-progress';
  if (val === '已投产') return 'final';
  if (val.includes('登记') || val.includes('承接') || val.includes('初始') || val.includes('新建')) return 'initial';
  if (val.includes('完成') || val.includes('上线') || val.includes('签署') || val.includes('就绪') || val.includes('投产') || val.includes('同意') || val.includes('摆渡')) return 'final';
  return 'in-progress';
}

export function setStatusCatalog(category, items = []) {
  const map = catalog.get(category) || new Map();
  for (const item of items || []) {
    if (!item?.attr_value) continue;
    map.set(item.attr_value, normalizeCssType(item.extra || {}));
  }
  catalog.set(category, map);
}

export function getStatusType(status) {
  if (!status) return 'not-started';
  const val = String(status).trim();
  for (const map of catalog.values()) {
    const type = map.get(val);
    if (type) return type;
  }
  return fallbackType(val);
}

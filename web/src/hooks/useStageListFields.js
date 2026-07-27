/**
 * 文件：hooks/useStageListFields.js
 * 说明：不在各页面复制扩展字段名单；新增字段保存后刷新页面即可自动出现。
 * 用途：将阶段配置中的“列表展示、筛选”标记转换为各业务列表可复用的列与筛选项。
 * 作者：hengguan
 */

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client.js';
import { loadStageContentSchema } from '../modules/process-configuration/index.js';

function optionType(field) {
  return ['select', 'person', 'release_point'].includes(field.input_type) ? 'select' : 'input';
}

export function useStageListFields(scopeKey) {
  const [fields, setFields] = useState([]);
  const [options, setOptions] = useState({});
  useEffect(() => {
    let alive = true;
    if (!scopeKey) return undefined;
    loadStageContentSchema(scopeKey).then(async (schema) => {
      const next = (schema?.fields || []).filter((field) => field.field_kind === 'extension' && field.visible && (field.list_visible || field.filterable));
      if (!alive) return;
      setFields(next);
      const sources = [...new Set(next.map((field) => field.source_key).filter(Boolean))];
      const loaded = await Promise.all(sources.map(async (source) => [source, await apiGet(`/stage-content/sources/${source}`)]));
      if (alive) setOptions(Object.fromEntries(loaded));
    }).catch(() => { if (alive) { setFields([]); setOptions({}); } });
    return () => { alive = false; };
  }, [scopeKey]);

  return useMemo(() => ({
    filterConfigs: fields.filter((field) => field.filterable).map((field) => ({
      field: `extension:${field.field_key}`, label: field.label, type: optionType(field), op: field.input_type === 'text' || field.input_type === 'textarea' ? 'like' : 'in',
      options: (options[field.source_key] || []).map((item) => ({ value: String(item.value), label: item.label })),
    })),
    columns: fields.filter((field) => field.list_visible).map((field) => ({
      title: field.label, key: `extension:${field.field_key}`,
      render: (_, row) => (row._stage_fields?.[field.field_key] || []).join('、') || '—',
    })),
  }), [fields, options]);
}

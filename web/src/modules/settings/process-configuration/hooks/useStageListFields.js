/**
 * 文件：web/src/modules/settings/process-configuration/hooks/useStageListFields.js
 * 说明：不在各页面复制扩展字段名单；新增字段保存后刷新页面即可自动出现。
 * 用途：将阶段配置中的“列表展示、筛选”标记转换为各业务列表可复用的列与筛选项。
 * 作者：hengguan
 */

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../../../platform/api.js';
import { invalidateStageContentData, loadStageContentSchema, subscribeStageContentConfigUpdated } from '../api/stageContentDataCache.js';

function optionType(field) {
  return ['select', 'person', 'release_point'].includes(field.input_type) ? 'select' : 'input';
}

function filterConfig(field, options) {
  const type = optionType(field);
  return {
    field: field.field_key,
    label: field.label,
    type,
    op: type === 'select' ? 'in' : 'like',
    options: (options[field.source_key] || []).map((item) => ({ value: String(item.value), label: item.label })),
    placeholder: type === 'input' ? `${field.label}检索` : undefined,
  };
}

export function useStageListFields(scopeKey) {
  const [schema, setSchema] = useState(null);
  const [options, setOptions] = useState({});
  useEffect(() => {
    let alive = true;
    if (!scopeKey) return undefined;
    const load = async () => {
      const nextSchema = await loadStageContentSchema(scopeKey);
      const fields = (nextSchema?.fields || []).filter((field) => field.field_kind === 'extension'
        && (field.list_visible || field.filterable));
      const nativeFilterFields = (nextSchema?.fields || []).filter((field) => field.field_kind === 'native' && field.filterable);
      const sources = [...new Set([...fields, ...nativeFilterFields].map((field) => field.source_key).filter(Boolean))];
      const loaded = await Promise.all(sources.map(async (source) => [source, await apiGet(`/stage-content/sources/${source}`)]));
      if (!alive) return;
      setSchema(nextSchema);
      setOptions(Object.fromEntries(loaded));
    };
    load().catch(() => { if (alive) { setSchema(null); setOptions({}); } });
    const unsubscribe = subscribeStageContentConfigUpdated(scopeKey, () => {
      invalidateStageContentData(scopeKey);
      load().catch(() => {});
    });
    return () => { alive = false; unsubscribe(); };
  }, [scopeKey]);

  return useMemo(() => ({
    // 配置未加载或加载失败时保持既有页面能力，避免网络波动把列表误渲染为空列/空筛选。
    isListVisible: (fieldKey) => !schema || !(schema.fields || []).some((field) => field.field_key === fieldKey) || !!schema.fields.find((field) => field.field_key === fieldKey)?.list_visible,
    isFilterable: (fieldKey) => !schema || !(schema.fields || []).some((field) => field.field_key === fieldKey) || !!schema.fields.find((field) => field.field_key === fieldKey)?.filterable,
    loaded: !!schema,
    nativeListFields: (schema?.fields || []).filter((field) => field.field_kind === 'native' && field.list_visible),
    nativeFilterFields: (schema?.fields || []).filter((field) => field.field_kind === 'native' && field.filterable),
    // 原生字段与扩展字段都以同一配置决定是否出现在筛选面板；业务页可为状态、系统等
    // 专用字段替换 options，但不能绕过该能力开关。
    nativeFilterConfigs: (schema?.fields || []).filter((field) => field.field_kind === 'native' && field.filterable)
      .map((field) => filterConfig(field, options)),
    filterConfigs: (schema?.fields || []).filter((field) => field.field_kind === 'extension' && field.filterable).map((field) => ({
      ...filterConfig(field, options), field: `extension:${field.field_key}`,
    })),
    columns: (schema?.fields || []).filter((field) => field.field_kind === 'extension' && field.list_visible).map((field) => ({
      title: field.label, key: field.field_kind === 'extension' ? `extension:${field.field_key}` : field.field_key,
      render: (_, row) => field.field_kind === 'extension' ? ((row._stage_fields?.[field.field_key] || []).join('、') || '—') : (row[field.field_key] || '—'),
    })),
    // 列设置允许用户临时添加本阶段所有扩展字段；默认列表仍仅消费 list_visible。
    allColumns: (schema?.fields || []).filter((field) => field.field_kind === 'extension').map((field) => ({
      title: field.label, key: `extension:${field.field_key}`,
      render: (_, row) => ((row._stage_fields?.[field.field_key] || []).join('、') || '—'),
    })),
  }), [options, schema]);
}

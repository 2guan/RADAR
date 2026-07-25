/**
 * 文件：hooks/useStageFormConfig.js
 * 用途：让详情页直接消费“输入项配置”的显示与必填规则。
 * 说明：内置字段和业务组件仍由各自专业组件渲染，但是否展示、何时必填不再依赖页面硬编码。
 */

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client.js';

/** 根据当前状态值匹配参数配置中的真实状态 ID，规则始终绑定状态 ID。 */
function activeStatusId(statuses, statusValue) {
  return (statuses || []).find((status) => status.value === statusValue || status.label === statusValue)?.id;
}

export function useStageFormConfig(scopeKey, statusValue, readOnly = false) {
  const [schema, setSchema] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next = await apiGet(`/stage-content/${scopeKey}/schema`);
      if (alive) setSchema(next);
    };
    // 网络短暂失败时保留原详情，避免把业务模块误判为“配置为隐藏”。
    load().catch(() => {});
    const refresh = () => load().catch(() => {});
    window.addEventListener('stage-content-config-updated', refresh);
    return () => {
      alive = false;
      window.removeEventListener('stage-content-config-updated', refresh);
    };
  }, [scopeKey]);

  return useMemo(() => {
    const fields = schema?.fields || [];
    const byKey = new Map(fields.map((field) => [field.field_key, field]));
    const statusId = activeStatusId(schema?.statuses, statusValue);
    // 配置尚未返回时保持页面可读；返回后完全按配置控制展示。
    const isVisible = (fieldKey) => !schema || !!byKey.get(fieldKey)?.visible;
    const isRequired = (fieldKey) => !readOnly && !!statusId && !!byKey.get(fieldKey)?.rules?.[statusId];
    const rules = (fieldKey, label, options = {}) => {
      if (!isRequired(fieldKey)) return options.extraRules || [];
      const requiredRule = { required: true, message: options.message || `${options.action || '请填写'}${label}` };
      if (options.type) requiredRule.type = options.type;
      if (options.min !== undefined) requiredRule.min = options.min;
      return [requiredRule, ...(options.extraRules || [])];
    };
    return { schema, loading: !schema, isVisible, isRequired, rules, field: (key) => byKey.get(key) || null };
  }, [readOnly, schema, statusValue]);
}

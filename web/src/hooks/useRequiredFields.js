/**
 * 文件：hooks/useRequiredFields.js
 * 用途：读取并缓存字段必填配置，为表单生成统一校验规则。
 * 作者：hengguan
 */

import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client.js';

let cache = null;
let pending = null;

function stateKeyFromType(type) {
  if (type === 'final') return 'final';
  if (type === 'initial' || type === 'not-started') return 'initial';
  return 'inProgress';
}

function loadRequiredFields() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = apiGet('/settings/required-fields')
      .then((res) => {
        cache = res;
        return res;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

export function resetRequiredFieldsCache() {
  cache = null;
}

function moduleConfigKey(moduleKey, scopeKey) {
  if (moduleKey === 'test' && scopeKey) return `test.${scopeKey}`;
  return moduleKey;
}

function cellVisible(cell, stateKey) {
  if (typeof cell?.visible === 'boolean') return cell.visible;
  return cell?.visible?.[stateKey] !== false;
}

function cellRequired(cell, stateKey) {
  if (!cellVisible(cell, stateKey)) return false;
  if (cell?.required) return !!cell.required[stateKey];
  return !!cell?.[stateKey];
}

export function useRequiredFields(moduleKey, statusType, readonly, scopeKey) {
  const [payload, setPayload] = useState(cache);

  useEffect(() => {
    let alive = true;
    loadRequiredFields().then((res) => { if (alive) setPayload(res); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const stateKey = stateKeyFromType(statusType);

  return useMemo(() => {
    const configKey = moduleConfigKey(moduleKey, scopeKey);
    const moduleConfig = payload?.config?.[configKey] || payload?.config?.[moduleKey] || {};
    const isVisible = (fieldKey) => cellVisible(moduleConfig[fieldKey], stateKey);
    const isRequired = (fieldKey) => !readonly && cellRequired(moduleConfig[fieldKey], stateKey);
    const attachmentMode = (fieldKey) => moduleConfig[`attachment:${fieldKey}`]?.mode?.[stateKey] || 'both';
    const rules = (fieldKey, label, options = {}) => {
      if (!isRequired(fieldKey)) return options.extraRules || [];
      const requiredRule = {
        required: true,
        message: options.message || `${options.action || '请填写'}${label}`,
      };
      if (options.type) requiredRule.type = options.type;
      if (options.min !== undefined) requiredRule.min = options.min;
      return [requiredRule, ...(options.extraRules || [])];
    };
    return { isVisible, isRequired, attachmentMode, rules, stateKey };
  }, [moduleKey, payload, readonly, scopeKey, stateKey]);
}

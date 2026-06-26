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

export function useRequiredFields(moduleKey, statusType, readonly) {
  const [payload, setPayload] = useState(cache);

  useEffect(() => {
    let alive = true;
    loadRequiredFields().then((res) => { if (alive) setPayload(res); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const stateKey = stateKeyFromType(statusType);

  return useMemo(() => {
    const moduleConfig = payload?.config?.[moduleKey] || {};
    const isRequired = (fieldKey) => !readonly && !!moduleConfig[fieldKey]?.[stateKey];
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
    return { isRequired, attachmentMode, rules, stateKey };
  }, [moduleKey, payload, readonly, stateKey]);
}

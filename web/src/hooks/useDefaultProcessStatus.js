/**
 * 文件：hooks/useDefaultProcessStatus.js
 * 用途：按流程阶段读取字典中的默认初始状态。
 * 作者：hengguan
 */

import { useEffect, useState } from 'react';
import { apiGet } from '../api/client.js';

const cache = {};

export function pickDefaultProcessStatus(items, stage, stateType = 'initial', fallback = null) {
  const matched = (items || [])
    .filter((item) => item.extra?.stage === stage && item.extra?.stateType === stateType)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || (a.id ?? 0) - (b.id ?? 0));
  return matched[0]?.attr_value || fallback;
}

export function useDefaultProcessStatus(stage, stateType = 'initial', fallback = null) {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!cache.process_status) cache.process_status = await apiGet('/dict/by-category/process_status');
      if (!alive) return;
      setValue(pickDefaultProcessStatus(cache.process_status, stage, stateType, fallback));
    })().catch(() => {});
    return () => { alive = false; };
  }, [stage, stateType, fallback]);

  return value;
}

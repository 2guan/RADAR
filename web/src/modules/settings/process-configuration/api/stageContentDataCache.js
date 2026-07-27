/**
 * 文件：modules/process-configuration/api/stageContentDataCache.js
 * 说明：阶段配置、扩展字段值属于同一详情页的只读初始化数据；同页多个布局区域应复用同一请求。
 * 用途：为阶段内容模块提供按阶段和实体去重的短生命周期内存缓存，并在配置变更或保存后按键失效。
 * 作者：hengguan
 */

import { apiGet } from '../../../../api/client.js';

const schemaCache = new Map();
const schemaRequests = new Map();
const valuesCache = new Map();
const valuesRequests = new Map();

const valueCacheKey = (scopeKey, entityId) => `${scopeKey || ''}:${entityId || ''}`;

/** 同一个阶段的多个面板共享 schema 请求，避免详情打开时重复拉取配置。 */
async function loadCached(cache, requests, key, request, force = false) {
  if (force) cache.delete(key);
  if (cache.has(key)) return cache.get(key);
  if (requests.has(key)) return requests.get(key);
  const pending = request()
    .then((data) => {
      cache.set(key, data);
      return data;
    })
    .finally(() => requests.delete(key));
  requests.set(key, pending);
  return pending;
}

export function loadStageContentSchema(scopeKey, { force = false } = {}) {
  if (!scopeKey) return Promise.resolve(null);
  return loadCached(schemaCache, schemaRequests, scopeKey, () => apiGet(`/stage-content/${scopeKey}/schema`), force);
}

export function loadStageContentValues(scopeKey, entityId, { force = false } = {}) {
  if (!scopeKey || !entityId) return Promise.resolve({});
  const key = valueCacheKey(scopeKey, entityId);
  return loadCached(valuesCache, valuesRequests, key, () => apiGet(`/stage-content/${scopeKey}/entities/${entityId}/values`), force);
}

/** 配置变更后只清除对应阶段；其他详情页继续使用自己的稳定缓存。 */
export function invalidateStageContentData(scopeKey, entityId) {
  if (!scopeKey) return;
  schemaCache.delete(scopeKey);
  if (entityId) valuesCache.delete(valueCacheKey(scopeKey, entityId));
}

/** 保存扩展字段后合并已知增量，避免同一详情页再次打开时读取旧值。 */
export function patchStageContentValues(scopeKey, entityId, changes) {
  if (!scopeKey || !entityId || !changes || !Object.keys(changes).length) return;
  const key = valueCacheKey(scopeKey, entityId);
  valuesCache.set(key, { ...(valuesCache.get(key) || {}), ...changes });
}

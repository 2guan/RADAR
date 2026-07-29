/**
 * 文件：web/src/modules/settings/process-configuration/api/stageContentDataCache.js
 * 说明：阶段配置、扩展字段值属于同一详情页的只读初始化数据；同页多个布局区域应复用同一请求。
 * 用途：为阶段内容模块提供按阶段和实体去重的短生命周期内存缓存，并在配置变更或保存后按键失效。
 * 作者：hengguan
 */

import { apiGet } from '../../../../platform/api.js';

const schemaCache = new Map();
const schemaRequests = new Map();
const valuesCache = new Map();
const valuesRequests = new Map();
const CONFIG_UPDATE_EVENT = 'stage-content-config-updated';
const CONFIG_UPDATE_CHANNEL = 'radar-stage-content-config';
let configUpdateChannel = null;

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

function dispatchConfigUpdate(scopeKey) {
  window.dispatchEvent(new CustomEvent(CONFIG_UPDATE_EVENT, { detail: { scopeKey } }));
}

function getConfigUpdateChannel() {
  if (configUpdateChannel || typeof BroadcastChannel === 'undefined') return configUpdateChannel;
  configUpdateChannel = new BroadcastChannel(CONFIG_UPDATE_CHANNEL);
  configUpdateChannel.addEventListener('message', (event) => dispatchConfigUpdate(event.data?.scopeKey));
  return configUpdateChannel;
}

/** 保存配置后失效当前范围缓存，并通知已打开的详情页与其他浏览器标签立即重载。 */
export function notifyStageContentConfigUpdated(scopeKey) {
  if (!scopeKey) return;
  invalidateStageContentData(scopeKey);
  dispatchConfigUpdate(scopeKey);
  getConfigUpdateChannel()?.postMessage({ scopeKey });
}

/** 仅响应自身范围的配置变更，避免其他阶段更新时无谓地重载详情。 */
export function subscribeStageContentConfigUpdated(scopeKey, onUpdate) {
  getConfigUpdateChannel();
  const handler = (event) => {
    const updatedScopeKey = event.detail?.scopeKey;
    if (!updatedScopeKey || updatedScopeKey === scopeKey) onUpdate();
  };
  window.addEventListener(CONFIG_UPDATE_EVENT, handler);
  return () => window.removeEventListener(CONFIG_UPDATE_EVENT, handler);
}

/** 保存扩展字段后合并已知增量，避免同一详情页再次打开时读取旧值。 */
export function patchStageContentValues(scopeKey, entityId, changes) {
  if (!scopeKey || !entityId || !changes || !Object.keys(changes).length) return;
  const key = valueCacheKey(scopeKey, entityId);
  valuesCache.set(key, { ...(valuesCache.get(key) || {}), ...changes });
}

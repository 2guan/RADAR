/**
 * 文件：server/src/modules/identity-access/application/list-preferences.js
 * 说明：个人列表偏好只按认证用户和稳定列表键存储，前端不能指定用户。
 * 用途：校验、读写和删除用户级列显示、顺序与宽度偏好。
 * 作者：hengguan
 */

import { get, run, dialect } from '../../../platform/persistence/index.js';
import { auditCreate, auditDelete, auditUpdate } from '../../../platform/audit/index.js';
import { badRequest, parseJsonObject } from '../../../platform/runtime/index.js';

const LIST_FIELD_CATALOG = Object.freeze({
  'requirements.analysis': ['task_status', 'status', 'req_code', 'apply_release_points', 'title', 'req_type', 'priority', 'proposer', 'implementation_org', 'receiver', 'workload', 'registrar', 'propose_time', 'main_systems_names', 'collab_dev_systems_names', 'op'],
  'tickets.analysis': ['task_status', 'status', 'ticket_code', 'apply_release_points', 'title', 'ticket_type', 'priority', 'proposer', 'implementation_org', 'receiver', 'workload', 'registrar', 'propose_time', 'main_systems_names', 'collab_dev_systems_names', 'op'],
  'development.tasks': ['task_status', 'status', 'task_code', 'task_name', 'req_code', 'owner', 'intake_owner', 'impl_system_name', 'deviation_rate', 'op'],
  'testing.tasks': ['task_status', 'status', 'task_code', 'task_name', 'req_code', 'owner', 'intake_owner', 'impl_system_name', 'deviation_rate', 'op'],
  'release.apply': ['review_status', 'change_code', 'release_date', 'change_system_name', 'change_content', 'delivery_units', 'impl_org', 'op'],
  'release.approval': ['task_status', 'release_status', 'review_status', 'signoff', 'release_date', 'impl_org', 'change_codes', 'code', 'title'],
});

const LOCKED_COLUMNS = new Set(['op']);
const MAX_COLUMNS = 48;
const isExtensionColumnKey = (key) => /^extension:[a-z][a-z0-9_]{1,63}$/i.test(key);
const isAllowedColumnKey = (allowed, key) => allowed.has(key) || isExtensionColumnKey(key);

function isKnownListKey(listKey) {
  return Object.hasOwn(LIST_FIELD_CATALOG, listKey);
}

function normalizedKeys(value, name, allowed) {
  if (!Array.isArray(value) || !value.length || value.length > MAX_COLUMNS) throw badRequest(`${name}必须为 1 至 ${MAX_COLUMNS} 个字段`);
  const keys = value.map((key) => String(key || '').trim());
  if (keys.some((key) => !key) || new Set(keys).size !== keys.length) throw badRequest(`${name}存在空字段或重复字段`);
  if (keys.some((key) => !isAllowedColumnKey(allowed, key))) throw badRequest(`${name}包含不允许的字段`);
  if (keys.some((key) => LOCKED_COLUMNS.has(key))) throw badRequest('操作列不可保存为个人偏好');
  return keys;
}

function normalizedWidths(value, allowed) {
  if (value === undefined) return {};
  if (!value || Array.isArray(value) || typeof value !== 'object') throw badRequest('widthByKey必须为对象');
  const out = {};
  for (const [key, width] of Object.entries(value)) {
    if (!isAllowedColumnKey(allowed, key) || LOCKED_COLUMNS.has(key)) throw badRequest('列宽包含不允许的字段');
    const numeric = Number(width);
    if (!Number.isInteger(numeric) || numeric < 72 || numeric > 800) throw badRequest('列宽必须为 72 至 800 的整数');
    out[key] = numeric;
  }
  return out;
}

export function listPreferenceCatalog(listKey) {
  if (!isKnownListKey(listKey)) throw badRequest('列表标识不支持个人列设置');
  return LIST_FIELD_CATALOG[listKey];
}

export function normalizeListPreference(listKey, body) {
  const allowed = new Set(listPreferenceCatalog(listKey));
  const visible_keys = normalizedKeys(body?.visibleKeys, 'visibleKeys', allowed);
  const ordered_keys = normalizedKeys(body?.orderedKeys, 'orderedKeys', allowed);
  if (visible_keys.length !== ordered_keys.length || visible_keys.some((key) => !ordered_keys.includes(key))) {
    throw badRequest('visibleKeys与orderedKeys必须包含相同字段');
  }
  return { visible_keys, ordered_keys, width_by_key: normalizedWidths(body?.widthByKey, allowed) };
}

export async function getListPreference(userId, listKey) {
  listPreferenceCatalog(listKey);
  const row = await get('SELECT id, payload FROM user_list_preference WHERE user_id = ? AND list_key = ?', userId, listKey);
  if (!row) return null;
  const payload = parseJsonObject(row.payload);
  return {
    visibleKeys: Array.isArray(payload.visible_keys) ? payload.visible_keys : [],
    orderedKeys: Array.isArray(payload.ordered_keys) ? payload.ordered_keys : [],
    widthByKey: payload.width_by_key && typeof payload.width_by_key === 'object' ? payload.width_by_key : {},
  };
}

export async function saveListPreference({ userId, listKey, body, operator }) {
  const payload = normalizeListPreference(listKey, body);
  const old = await get('SELECT id, payload FROM user_list_preference WHERE user_id = ? AND list_key = ?', userId, listKey);
  const encoded = JSON.stringify(payload);
  let id = old?.id;
  // 同一用户、同一列表只保留一份完整快照；更新与首次保存分别写入对应审计动作，
  // 审计中仅记录脱敏后的“列表布局”字段名，避免扩大个人工作习惯数据的可见范围。
  if (old) {
    await run(`UPDATE user_list_preference SET payload = ?, updated_at = ${dialect.now} WHERE id = ?`, encoded, id);
    await auditUpdate('user_list_preference', id, listKey, operator, { payload: old.payload }, { payload: encoded }, { payload: '列表布局' });
  } else {
    const result = await run('INSERT INTO user_list_preference (user_id, list_key, payload) VALUES (?,?,?)', userId, listKey, encoded);
    id = result.lastInsertRowid;
    await auditCreate('user_list_preference', id, listKey, operator);
  }
  return { visibleKeys: payload.visible_keys, orderedKeys: payload.ordered_keys, widthByKey: payload.width_by_key };
}

export async function deleteListPreference({ userId, listKey, operator }) {
  listPreferenceCatalog(listKey);
  const old = await get('SELECT id FROM user_list_preference WHERE user_id = ? AND list_key = ?', userId, listKey);
  if (!old) return false;
  await run('DELETE FROM user_list_preference WHERE id = ?', old.id);
  await auditDelete('user_list_preference', old.id, listKey, operator);
  return true;
}

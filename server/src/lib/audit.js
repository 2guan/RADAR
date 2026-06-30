/**
 * 文件：lib/audit.js
 * 用途：过程留痕工具。对比新旧记录字段差异并写入 audit_log，支持创建/更新/删除。
 * 作者：hengguan
 * 说明：fieldLabels 提供"字段英文名 -> 中文名"映射，仅记录发生变化的字段。
 */

import { run } from '../db/index.js';

/**
 * 记录一条变更。
 */
async function write(entityType, entityId, entityCode, action, operator, field, oldValue, newValue) {
  await run(
    `INSERT INTO audit_log
       (entity_type, entity_id, entity_code, action, operator, field, old_value, new_value)
     VALUES (?,?,?,?,?,?,?,?)`,
    entityType, entityId, entityCode, action, operator, field,
    oldValue == null ? null : String(oldValue),
    newValue == null ? null : String(newValue),
  );
}

/**
 * 记录创建动作（整体记一条）。
 */
export async function auditCreate(entityType, entityId, entityCode, operator) {
  await write(entityType, entityId, entityCode, 'create', operator, null, null, '新建记录');
}

/**
 * 记录删除动作。
 */
export async function auditDelete(entityType, entityId, entityCode, operator) {
  await write(entityType, entityId, entityCode, 'delete', operator, null, '记录已删除', null);
}

/**
 * 对比新旧对象，逐字段记录差异。
 * @param {object} fieldLabels 字段英文名 -> 中文名
 */
export async function auditUpdate(entityType, entityId, entityCode, operator, oldObj, newObj, fieldLabels) {
  for (const [key, label] of Object.entries(fieldLabels)) {
    const before = oldObj?.[key];
    const after = newObj?.[key];
    // 仅在传入了新值且确实变化时记录
    if (after === undefined) continue;
    const b = before == null ? '' : String(before);
    const a = after == null ? '' : String(after);
    if (b !== a) {
      await write(entityType, entityId, entityCode, 'update', operator, label, before, after);
    }
  }
}

/**
 * 文件：server/src/shared/evidence/audit.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：RADAR 后端业务或平台逻辑。
 * 作者：hengguan
 */

import { run } from '../../db/index.js';

/** Records evidence mutations with the same format as ordinary field audit events. */
export async function auditEvidenceChange({ entityType, entityId, entityCode, fieldKey, operator, oldValue, newValue }) {
  await run(
    `INSERT INTO audit_log (entity_type, entity_id, entity_code, action, operator, field, old_value, new_value)
     VALUES (?, ?, ?, 'update', ?, ?, ?, ?)`,
    entityType, entityId, entityCode, operator, fieldKey,
    oldValue == null ? null : String(oldValue), newValue == null ? null : String(newValue),
  );
}

/**
 * 文件：server/src/modules/settings/process-configuration/application/extension-list-filter.js
 * 说明：扩展字段定义和字段值都属于阶段配置领域；表名与实体类型由业务模块传入的受信任配置决定。
 * 用途：将扩展字段筛选转换为安全的 EXISTS SQL 片段，供通用列表查询通过公开契约调用。
 * 作者：hengguan
 */

import { get } from '../../../../platform/persistence/index.js';

/** 根据字段定义确定实际存储列，保持现有扩展字段兼容规则。 */
function valueColumn(definition) {
  if (['date', 'datetime'].includes(definition.input_type)) return 'value_date';
  if (definition.source_key) {
    return ['person', 'release_point'].includes(definition.source_key) ? 'value_ref_id' : 'value_code';
  }
  return 'value_text';
}

/**
 * 构建扩展字段筛选 SQL；无有效配置时返回 null，让通用查询安全忽略该筛选。
 */
export async function buildExtensionListFilter({
  table, scopeKey, entityType, fieldKey, op = 'eq', value,
}) {
  const definition = await get(
    `SELECT id, input_type, source_key, multiple FROM stage_field_definition
      WHERE scope_key = ? AND field_key = ? AND field_kind = 'extension'
        AND visible = 1 AND filterable = 1 AND deleted_at IS NULL`,
    scopeKey,
    fieldKey,
  );
  if (!definition) return null;

  const values = Array.isArray(value) ? value : [value];
  if (!values.length) return null;
  const column = valueColumn(definition);
  const clauses = [
    'esf.field_definition_id = ?',
    'esf.entity_type = ?',
    `esf.entity_id = ${table}.id`,
  ];
  const params = [definition.id, entityType];

  // 日期范围和文本模糊匹配是唯一的专用操作，其余统一使用参数化 IN。
  if (op === 'like' && column === 'value_text') {
    clauses.push(`esf.${column} LIKE ?`);
    params.push(`%${value}%`);
  } else if (op === 'between' && values.length === 2 && column === 'value_date') {
    clauses.push(`esf.${column} BETWEEN ? AND ?`);
    params.push(values[0], values[1]);
  } else if ((op === 'gte' || op === 'lte') && column === 'value_date') {
    clauses.push(`esf.${column} ${op === 'gte' ? '>=' : '<='} ?`);
    params.push(value);
  } else {
    clauses.push(`esf.${column} IN (${values.map(() => '?').join(',')})`);
    params.push(...values);
  }
  return { where: `EXISTS (SELECT 1 FROM stage_field_value esf WHERE ${clauses.join(' AND ')})`, params };
}

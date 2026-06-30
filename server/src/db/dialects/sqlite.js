/**
 * 文件：db/dialects/sqlite.js
 * 用途：SQLite SQL 方言适配。集中维护当前时间表达式、忽略插入、
 *       配置项 upsert 片段，以及 SQLite json_each/json_extract 查询表达式。
 * 作者：hengguan
 * 说明：该文件与 mysql.js 保持同名方法，业务层通过统一 dialect 接口调用，
 *       避免在各模块中散落数据库类型判断。
 */

export const sqliteDialect = {
  name: 'sqlite',
  now: "datetime('now','localtime')",
  today: "date('now')",
  insertIgnore: 'INSERT OR IGNORE',
  upsertConfig: `
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      remark = excluded.remark,
      updated_at = datetime('now','localtime')
  `,
  /** 判断 JSON 字符串数组列是否包含某个值。 */
  jsonArrayContains(column, valueSql = '?') {
    return `EXISTS (SELECT 1 FROM json_each(${column}) WHERE value = ${valueSql})`;
  },
  /** 判断 JSON 字符串数组列与一组值是否存在交集。 */
  jsonArrayOverlaps(column, placeholders) {
    return `EXISTS (SELECT 1 FROM json_each(${column}) WHERE value IN (${placeholders}))`;
  },
  /** 判断 JSON 对象数组中某个对象字段是否命中一组值。 */
  jsonObjectFieldIn(arrayColumn, field, placeholders) {
    return `EXISTS (SELECT 1 FROM json_each(${arrayColumn}) WHERE json_extract(value, '$.${field}') IN (${placeholders}))`;
  },
  /** 按 JSON path 提取字段值。 */
  jsonExtract(column, path) {
    return `json_extract(${column}, '${path}')`;
  },
};

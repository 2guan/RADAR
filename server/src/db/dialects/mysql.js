/**
 * 文件：db/dialects/mysql.js
 * 用途：TDSQL MySQL 兼容版 SQL 方言适配。集中维护当前时间表达式、忽略插入、
 *       配置项 upsert 片段，以及 JSON 数组/对象字段查询表达式。
 * 作者：hengguan
 * 说明：业务模块只依赖 dialect 方法，不直接拼接 SQLite 或 MySQL 专属 JSON 函数，
 *       便于同一套业务代码在 SQLite 与 TDSQL 之间切换。
 */

export const mysqlDialect = {
  name: 'tdsql',
  now: 'CURRENT_TIMESTAMP',
  today: 'CURRENT_DATE',
  insertIgnore: 'INSERT IGNORE',
  upsertConfig: `
    ON DUPLICATE KEY UPDATE
      value = VALUES(value),
      remark = VALUES(remark),
      updated_at = CURRENT_TIMESTAMP
  `,
  /** 判断 JSON 数组列是否包含某个值。 */
  jsonArrayContains(column, valueSql = '?') {
    return `JSON_CONTAINS(COALESCE(${column}, JSON_ARRAY()), JSON_QUOTE(${valueSql}))`;
  },
  /** 判断 JSON 数组列与一组值是否存在交集。 */
  jsonArrayOverlaps(column, placeholders) {
    return `JSON_OVERLAPS(COALESCE(${column}, JSON_ARRAY()), JSON_ARRAY(${placeholders}))`;
  },
  /** 判断 JSON 对象数组中某个对象字段是否命中一组值。 */
  jsonObjectFieldIn(arrayColumn, field, placeholders) {
    return `JSON_OVERLAPS(
      COALESCE(JSON_EXTRACT(${arrayColumn}, '$[*].${field}'), JSON_ARRAY()),
      JSON_ARRAY(${placeholders})
    )`;
  },
  /** 提取 JSON 字段并去除 JSON 字符串引号。 */
  jsonExtract(column, path) {
    return `JSON_UNQUOTE(JSON_EXTRACT(${column}, '${path}'))`;
  },
};

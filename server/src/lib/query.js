/**
 * 文件：lib/query.js
 * 用途：列表通用查询构建器。把前端统一的 {page,pageSize,keyword,filters,sort} 入参，
 *       转换为安全的参数化 SQL 片段（WHERE / ORDER BY / LIMIT），供各模块复用。
 * 作者：hengguan
 * 说明：所有列名均经白名单校验，杜绝注入；keyword 跨多列模糊；filters 支持等值/包含/区间。
 */

import { all, get } from '../db/index.js';

/**
 * 构建并执行分页列表查询。
 * @param {object} opts
 * @param {string} opts.table 主表名（已信任，来自代码而非用户）
 * @param {string[]} opts.columns 允许排序/筛选的列白名单
 * @param {string[]} opts.searchColumns keyword 模糊匹配的列
 * @param {object} opts.query 前端入参（page/pageSize/keyword/filters/sort）
 * @param {string} [opts.baseWhere] 额外固定 WHERE（如默认过滤投产窗口）
 * @param {any[]} [opts.baseParams] baseWhere 的绑定参数
 * @param {string} [opts.select] 自定义 SELECT 列，默认 *
 * @returns {{list:object[], total:number, page:number, pageSize:number}}
 */
export function listQuery(opts) {
  const {
    table, columns, searchColumns = [], query = {},
    baseWhere = '', baseParams = [], select = '*',
  } = opts;

  const colSet = new Set(columns);
  const where = [];
  const params = [];

  if (baseWhere) {
    where.push(`(${baseWhere})`);
    params.push(...baseParams);
  }

  // 全文模糊检索
  const keyword = (query.keyword || '').trim();
  if (keyword && searchColumns.length) {
    const ors = searchColumns
      .filter((c) => colSet.has(c))
      .map((c) => `${c} LIKE ?`);
    if (ors.length) {
      where.push(`(${ors.join(' OR ')})`);
      ors.forEach(() => params.push(`%${keyword}%`));
    }
  }

  // 字段筛选：[{field, op, value}]
  const filters = Array.isArray(query.filters) ? query.filters : [];
  for (const f of filters) {
    if (!f || !colSet.has(f.field)) continue;
    const { field, op = 'eq', value } = f;
    if (value === undefined || value === null || value === '') continue;
    switch (op) {
      case 'eq': where.push(`${field} = ?`); params.push(value); break;
      case 'like': where.push(`${field} LIKE ?`); params.push(`%${value}%`); break;
      case 'in':
        if (Array.isArray(value) && value.length) {
          where.push(`${field} IN (${value.map(() => '?').join(',')})`);
          params.push(...value);
        }
        break;
      case 'gte': where.push(`${field} >= ?`); params.push(value); break;
      case 'lte': where.push(`${field} <= ?`); params.push(value); break;
      case 'between':
        if (Array.isArray(value) && value.length === 2) {
          where.push(`${field} BETWEEN ? AND ?`);
          params.push(value[0], value[1]);
        }
        break;
      default: break;
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // 排序：[{field, order}] 支持多字段
  const sortArr = Array.isArray(query.sort) ? query.sort : [];
  const orderParts = sortArr
    .filter((s) => s && colSet.has(s.field))
    .map((s) => `${s.field} ${String(s.order).toUpperCase() === 'DESC' ? 'DESC' : 'ASC'}`);
  const orderSql = orderParts.length ? `ORDER BY ${orderParts.join(', ')}` : 'ORDER BY id DESC';

  // 总数
  const totalRow = get(`SELECT COUNT(*) AS c FROM ${table} ${whereSql}`, ...params);
  const total = totalRow?.c ?? 0;

  // 分页（pageSize <= 0 表示导出全量）
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const pageSize = parseInt(query.pageSize, 10);
  let limitSql = '';
  const listParams = [...params];
  if (Number.isFinite(pageSize) && pageSize > 0) {
    limitSql = 'LIMIT ? OFFSET ?';
    listParams.push(pageSize, (page - 1) * pageSize);
  }

  const list = all(
    `SELECT ${select} FROM ${table} ${whereSql} ${orderSql} ${limitSql}`,
    ...listParams,
  );

  return { list, total, page, pageSize: pageSize > 0 ? pageSize : total };
}

/**
 * 文件：lib/crud.js
 * 用途：通用 CRUD 路由工厂。为结构简单的资源表（字典、系统、投产点等）一次性注册
 *       列表/详情/新增/修改/删除接口，统一接入权限校验、参数化写入与过程留痕。
 * 作者：hengguan
 * 说明：复杂资源（用户、需求、开发、测试、投产）走各自模块的定制实现，不使用本工厂。
 */

import { get, run } from '../db/index.js';
import { listQuery } from './query.js';
import { auditCreate, auditUpdate, auditDelete } from './audit.js';
import { ok, notFound, badRequest } from './http.js';

/**
 * 注册一套标准 CRUD 接口。
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} cfg
 * @param {string} cfg.prefix   路由前缀，如 '/dict'
 * @param {string} cfg.table    数据表名
 * @param {string} cfg.module   RBAC 模块键
 * @param {string} cfg.entityType 留痕实体类型
 * @param {string[]} cfg.columns 列白名单（排序/筛选）
 * @param {string[]} cfg.searchColumns keyword 模糊列
 * @param {string[]} cfg.writable 可写字段
 * @param {object} cfg.fieldLabels 字段中文名映射（留痕用）
 * @param {string} [cfg.codeField] 业务编号字段（留痕展示），默认主键 id
 * @param {Function} [cfg.beforeWrite] (data, {isCreate, request}) => data 写入前钩子
 * @param {Function} [cfg.afterWrite] ({id, isCreate, request}) => void 写入后钩子（同事务外）
 * @param {Function} [cfg.beforeDelete] (row, request) => void 删除前钩子（可抛错阻止）
 */
export function registerCrud(fastify, cfg) {
  const {
    prefix, table, module, entityType,
    columns, searchColumns = [], writable, fieldLabels,
    codeField = 'id', beforeWrite, afterWrite, beforeDelete,
    skipList = false,
  } = cfg;

  // 列表（POST 以承载复杂筛选体）
  if (!skipList) {
    fastify.post(`${prefix}/list`, { preHandler: fastify.requirePerm(module, 'view') }, async (request) => {
      const result = listQuery({ table, columns, searchColumns, query: request.body || {} });
      return ok(result);
    });
  }

  // 详情
  fastify.get(`${prefix}/:id`, { preHandler: fastify.requirePerm(module, 'view') }, async (request) => {
    const row = get(`SELECT * FROM ${table} WHERE id = ?`, request.params.id);
    if (!row) throw notFound();
    return ok(row);
  });

  // 新增
  fastify.post(prefix, { preHandler: fastify.requirePerm(module, 'create') }, async (request) => {
    let data = pick(request.body || {}, writable);
    if (beforeWrite) data = beforeWrite(data, { isCreate: true, request });
    const keys = Object.keys(data);
    if (!keys.length) throw badRequest('无有效字段');
    const res = run(
      `INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
      ...keys.map((k) => data[k]),
    );
    const id = res.lastInsertRowid;
    auditCreate(entityType, id, String(data[codeField] ?? id), request.currentUser?.name);
    if (afterWrite) afterWrite({ id, isCreate: true, request, data });
    return ok({ id });
  });

  // 修改
  fastify.put(`${prefix}/:id`, { preHandler: fastify.requirePerm(module, 'edit') }, async (request) => {
    const id = request.params.id;
    const old = get(`SELECT * FROM ${table} WHERE id = ?`, id);
    if (!old) throw notFound();
    let data = pick(request.body || {}, writable);
    if (beforeWrite) data = beforeWrite(data, { isCreate: false, request, old });
    const keys = Object.keys(data);
    if (keys.length) {
      run(
        `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(',')}, updated_at = datetime('now','localtime') WHERE id = ?`,
        ...keys.map((k) => data[k]), id,
      );
      auditUpdate(entityType, id, String(old[codeField] ?? id), request.currentUser?.name, old, data, fieldLabels);
    }
    if (afterWrite) afterWrite({ id, isCreate: false, request, data });
    return ok({ id });
  });

  // 删除
  fastify.delete(`${prefix}/:id`, { preHandler: fastify.requirePerm(module, 'delete') }, async (request) => {
    const id = request.params.id;
    const row = get(`SELECT * FROM ${table} WHERE id = ?`, id);
    if (!row) throw notFound();
    if (beforeDelete) beforeDelete(row, request);
    run(`DELETE FROM ${table} WHERE id = ?`, id);
    auditDelete(entityType, id, String(row[codeField] ?? id), request.currentUser?.name);
    return ok(null, '删除成功');
  });
}

/**
 * 从对象中挑选允许的字段。
 */
function pick(obj, allowed) {
  const out = {};
  for (const k of allowed) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

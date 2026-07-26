/**
 * 文件：server/src/shared/authorization/entity-access.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：RADAR 后端业务或平台逻辑。
 * 作者：hengguan
 */

import { get } from '../../db/index.js';
import { badRequest, notFound } from '../../platform/runtime/index.js';

const ENTITY_CONFIG = {
  requirement: { table: 'requirement', code: 'req_code', module: 'requirement' },
  ticket: { table: 'ticket', code: 'ticket_code', module: 'ticket' },
  dev: { table: 'dev_task', code: 'task_code', module: 'dev' },
  release: { table: 'release_task', code: 'req_code', module: 'release' },
  release_apply: { table: 'release_apply', code: 'change_code', module: 'release_apply' },
};

export async function resolveEntityAccess(entityType, entityId) {
  if (entityType === 'test') {
    const row = await get('SELECT id, task_code, test_type FROM test_task WHERE id = ?', entityId);
    if (!row) throw notFound('实体不存在');
    return { row, moduleKey: `test.${row.test_type}`, entityCode: row.task_code };
  }
  const config = ENTITY_CONFIG[entityType];
  if (!config) throw badRequest('不支持的实体类型');
  const row = await get(`SELECT id, ${config.code} AS entity_code FROM ${config.table} WHERE id = ?`, entityId);
  if (!row) throw notFound('实体不存在');
  return { row, moduleKey: config.module, entityCode: row.entity_code };
}

export async function authorizeEntity(fastify, request, entityType, entityId, action = 'view') {
  const access = await resolveEntityAccess(entityType, Number(entityId));
  await fastify.requirePerm(access.moduleKey, action)(request);
  return access;
}

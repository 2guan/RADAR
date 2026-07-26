/**
 * 文件：modules/audit/routes.js
 * 说明：根据实体类型和实体 ID 查询操作审计日志（如字段变更历史），用以实现过程留痕和抽样溯源。
 * 用途：变更历史（过程留痕）读取接口。按实体类型+实体 id 返回历史编辑记录。
 * 作者：hengguan
 */

import { all } from '../../platform/persistence/index.js';
import { ok, badRequest } from '../../platform/runtime/index.js';
import { authorizeEntity } from '../../platform/auth/index.js';

export default async function auditRoutes(fastify) {
  fastify.get('/audit', { preHandler: fastify.authenticate }, async (request) => {
    const { entityType, entityId } = request.query;
    if (!entityType || !entityId) throw badRequest('参数缺失');
    await authorizeEntity(fastify, request, entityType, entityId, 'view');
    const rows = await all(
      `SELECT id, action, operator, field, old_value, new_value, created_at
         FROM audit_log
        WHERE entity_type = ?
          AND entity_id = ?
          AND NOT (entity_type = 'release' AND (COALESCE(field, '') LIKE '会签-%-签署人' OR COALESCE(field, '') LIKE '会签-%-签署时间'))
        ORDER BY id DESC`,
      entityType, Number(entityId),
    );
    return ok(rows);
  });
}

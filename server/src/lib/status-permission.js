/**
 * 文件：lib/status-permission.js
 * 用途：统一校验业务阶段状态的调整权限，防止绕过前端控件直接修改状态。
 */

import { forbidden } from './http.js';

/**
 * 编辑操作可修改普通字段；仅有“调整状态”权限时，更新请求只能包含实际变化的状态字段。
 */
export async function assertStatusChangePermission(fastify, request, moduleKey, oldStatus, data = {}) {
  if (request.currentUser?.is_super) return;
  const permissions = await fastify.loadUserPermissions(request.currentUser.id);
  const canEdit = permissions.has(`${moduleKey}:edit`);
  const statusChanged = data.status !== undefined && data.status !== oldStatus;
  if (statusChanged && !permissions.has(`${moduleKey}:status.edit`)) {
    throw forbidden('无调整状态权限');
  }
  if (!canEdit && (!statusChanged || Object.keys(data).some((key) => key !== 'status' && data[key] !== undefined))) {
    throw forbidden('仅允许调整状态');
  }
}

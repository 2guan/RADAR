/**
 * 文件：server/src/modules/release/application/task-statuses.js
 * 说明：仅返回投产模块自有投产任务的最小状态快照，供跨模块生命周期只读聚合使用。
 * 用途：投产模块公开读取契约的实现；不读取或写入其他业务模块数据。
 * 作者：hengguan
 */

import { all } from '../../../platform/persistence/index.js';

/** 批量取得工作项关联的投产审批状态；保留既有“最后创建任务为代表”的口径。 */
export async function listReleaseTaskStatuses(workItemCodes = []) {
  const codes = [...new Set(workItemCodes.filter(Boolean))];
  if (!codes.length) return {};
  const placeholders = codes.map(() => '?').join(',');
  const rows = await all(
    `SELECT id, req_code, status FROM release_task WHERE req_code IN (${placeholders}) ORDER BY id ASC`,
    ...codes,
  );
  return rows.reduce((result, row) => {
    result[row.req_code] = row;
    return result;
  }, {});
}

/**
 * 文件：server/src/modules/development/application/task-statuses.js
 * 说明：仅返回开发模块自有开发任务的最小状态快照，供跨模块生命周期只读聚合使用。
 * 用途：开发模块公开读取契约的实现；不读取或写入其他业务模块数据。
 * 作者：hengguan
 */

import { all } from '../../../platform/persistence/index.js';

/** 批量取得工作项关联的开发任务状态，按创建顺序保证代表状态选择稳定。 */
export async function listDevTaskStatuses(workItemCodes = []) {
  const codes = [...new Set(workItemCodes.filter(Boolean))];
  if (!codes.length) return {};
  const placeholders = codes.map(() => '?').join(',');
  const rows = await all(
    `SELECT id, req_code, status FROM dev_task WHERE req_code IN (${placeholders}) ORDER BY id ASC`,
    ...codes,
  );
  return rows.reduce((result, row) => {
    (result[row.req_code] ||= []).push(row);
    return result;
  }, {});
}

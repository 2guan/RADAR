/**
 * 文件：server/src/modules/testing/application/task-statuses.js
 * 说明：仅返回测试模块自有测试任务的最小状态快照，供跨模块生命周期只读聚合使用。
 * 用途：测试模块公开读取契约的实现；不读取或写入其他业务模块数据。
 * 作者：hengguan
 */

import { all } from '../../../platform/persistence/index.js';

/** 批量取得工作项关联的测试任务状态，按测试类型及创建顺序保证结果稳定。 */
export async function listTestTaskStatuses(workItemCodes = []) {
  const codes = [...new Set(workItemCodes.filter(Boolean))];
  if (!codes.length) return {};
  const placeholders = codes.map(() => '?').join(',');
  const rows = await all(
    `SELECT id, req_code, test_type, status
       FROM test_task
      WHERE req_code IN (${placeholders})
      ORDER BY test_type ASC, id ASC`,
    ...codes,
  );
  return rows.reduce((result, row) => {
    const tests = result[row.req_code] ||= {};
    (tests[row.test_type] ||= []).push(row);
    return result;
  }, {});
}

/**
 * 文件：server/src/modules/development/application/release-apply-defaults.js
 * 说明：投产申请只能通过该只读契约读取开发任务实施方，避免下游模块直接访问 dev_task。
 * 用途：为投产申请新增态提供“关联工作项 + 开发实施系统”对应的开发实施方默认值。
 * 作者：hengguan
 */

import { all } from '../../../platform/persistence/index.js';

/**
 * 返回关联工作项在指定实施系统下的去空、去重开发实施方。
 * 调用方负责自身权限与工作项数据范围校验；本契约不暴露任务编号、负责人或其他开发任务数据。
 */
export async function listDevelopmentImplementationOrgs({ workItemCodes, systemCode }) {
  const codes = [...new Set((Array.isArray(workItemCodes) ? workItemCodes : [])
    .map((code) => String(code || '').trim())
    .filter(Boolean))];
  const implementationSystem = String(systemCode || '').trim();
  if (!codes.length || !implementationSystem) return [];

  const rows = await all(
    `SELECT DISTINCT TRIM(impl_org) AS impl_org
       FROM dev_task
      WHERE req_code IN (${codes.map(() => '?').join(',')})
        AND impl_system = ?
        AND TRIM(COALESCE(impl_org, '')) <> ''`,
    ...codes,
    implementationSystem,
  );
  return rows.map((row) => row.impl_org).filter(Boolean);
}

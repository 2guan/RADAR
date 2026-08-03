/**
 * 文件：server/src/modules/requirements/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

import { get, all } from '../../platform/persistence/index.js';
import { appliedReleasePointsForWorkItems, workItemCodesForAppliedReleasePoints } from '../release/index.js';
import { REQUIREMENT_WORK_ITEM_TYPE } from './contracts/work-item.js';

export {
  claimRequirementCode, generateRequirementCode, previewRequirementCode, requirementCodeRequiresReleasePoint,
} from './application/numbering.js';
export { replaceRequirementDevelopmentSystemRoles } from './application/development-system-roles.js';

/** Public read contract. Other modules must not query the requirement table directly. */
export async function findRequirementWorkItem(workItemCode) {
  const row = await get('SELECT * FROM requirement WHERE req_code = ?', workItemCode);
  return row ? { ...row, workItemType: REQUIREMENT_WORK_ITEM_TYPE, workItemCode: row.req_code } : null;
}

/** Minimal public read DTO for downstream test-intake candidate aggregation. */
export async function listRequirementWorkItemsForTestIntake() {
  const rows = await all('SELECT req_code, title, main_systems, collab_test_systems FROM requirement');
  return rows.map((row) => ({
    ...row,
    workItemType: REQUIREMENT_WORK_ITEM_TYPE,
    workItemCode: row.req_code,
  }));
}

export async function requirementCodesInReleasePoints(ids) {
  if (!ids?.length) return null;
  const rows = await all('SELECT req_code AS code FROM requirement');
  return workItemCodesForAppliedReleasePoints(rows.map((row) => row.code), ids);
}

export async function requirementReleaseDates(codes) {
  const points = await appliedReleasePointsForWorkItems(codes);
  return Object.fromEntries(Object.entries(points).map(([code, values]) => [code, values[0]?.release_date || null]));
}

export async function requirementAppliedReleasePoints(codes) {
  return appliedReleasePointsForWorkItems(codes);
}

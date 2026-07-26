/**
 * 文件：server/src/modules/requirements/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

import { get, all } from '../../platform/persistence/index.js';
import { inClause } from '../../lib/window.js';
import { REQUIREMENT_WORK_ITEM_TYPE } from './contracts/work-item.js';

/** Public read contract. Other modules must not query the requirement table directly. */
export async function findRequirementWorkItem(workItemCode) {
  const row = await get('SELECT * FROM requirement WHERE req_code = ?', workItemCode);
  return row ? { ...row, workItemType: REQUIREMENT_WORK_ITEM_TYPE, workItemCode: row.req_code } : null;
}

export async function requirementCodesInReleasePoints(ids) {
  const where = inClause('release_point_id', ids);
  if (!where.where) return [];
  const rows = await all('SELECT req_code AS code FROM requirement WHERE ' + where.where, ...where.params);
  return rows.map((row) => row.code);
}

export async function requirementReleaseDates(codes) {
  if (!codes.length) return {};
  const placeholders = codes.map(() => '?').join(',');
  const rows = await all(
    'SELECT r.req_code AS code, rp.release_date FROM requirement r LEFT JOIN release_point rp ON r.release_point_id = rp.id WHERE r.req_code IN (' + placeholders + ')',
    ...codes,
  );
  return Object.fromEntries(rows.map((row) => [row.code, row.release_date]));
}

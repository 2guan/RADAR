/**
 * 文件：server/src/modules/release/application/work-item-release-points.js
 * 说明：投产申请引用是工作项投产点的唯一来源；未申请工作项统一归入待定投产点。
 * 用途：向其他业务模块提供只读、多值的申请投产点查询契约。
 * 作者：hengguan
 */

import { all, get } from '../../../platform/persistence/index.js';

const PENDING_RELEASE_POINT = '投产点待定';

async function pendingReleasePoint() {
  return get('SELECT id, release_date FROM release_point WHERE release_date = ?', PENDING_RELEASE_POINT);
}

function uniqueCodes(codes) {
  return [...new Set((codes || []).map((code) => String(code || '').trim()).filter(Boolean))];
}

/**
 * 返回候选工作项中满足任一投产点的编号。没有申请记录的工作项只在选择待定点时命中。
 * 候选编号由调用方所属模块提供，避免 release 模块跨表读取需求或工单。
 */
export async function workItemCodesForAppliedReleasePoints(candidateCodes, releasePointIds) {
  const codes = uniqueCodes(candidateCodes);
  const ids = [...new Set((releasePointIds || []).map(Number).filter(Number.isFinite))];
  if (!ids.length) return null;
  if (!codes.length) return [];

  const pending = await pendingReleasePoint();
  const includesPending = pending && ids.includes(Number(pending.id));
  const codePlaceholders = codes.map(() => '?').join(',');
  const appliedRows = await all(
    `SELECT DISTINCT ref_code FROM release_apply_reference WHERE ref_code IN (${codePlaceholders})`,
    ...codes,
  );
  const appliedCodes = new Set(appliedRows.map((row) => row.ref_code));

  const concreteIds = ids.filter((id) => id !== Number(pending?.id));
  const matchedCodes = new Set();
  if (concreteIds.length) {
    const pointPlaceholders = concreteIds.map(() => '?').join(',');
    const rows = await all(
      `SELECT DISTINCT ref_code FROM release_apply_reference
        WHERE ref_code IN (${codePlaceholders}) AND release_point_id IN (${pointPlaceholders})`,
      ...codes, ...concreteIds,
    );
    for (const row of rows) matchedCodes.add(row.ref_code);
  }
  if (includesPending) {
    for (const code of codes) if (!appliedCodes.has(code)) matchedCodes.add(code);
  }
  return [...matchedCodes];
}

/** 返回工作项的全部申请投产点；没有申请时返回唯一的待定投产点。 */
export async function appliedReleasePointsForWorkItems(workItemCodes) {
  const codes = uniqueCodes(workItemCodes);
  if (!codes.length) return {};
  const placeholders = codes.map(() => '?').join(',');
  const rows = await all(
    `SELECT DISTINCT rar.ref_code AS code, rp.id, rp.release_date
       FROM release_apply_reference rar
       JOIN release_point rp ON rp.id = rar.release_point_id
      WHERE rar.ref_code IN (${placeholders})
      ORDER BY rp.release_date, rp.id`,
    ...codes,
  );
  const result = Object.fromEntries(codes.map((code) => [code, []]));
  for (const row of rows) result[row.code].push({ id: Number(row.id), release_date: row.release_date });
  const pending = await pendingReleasePoint();
  if (pending) {
    for (const code of codes) {
      if (!result[code].length) result[code].push({ id: Number(pending.id), release_date: pending.release_date });
    }
  }
  return result;
}

export async function pendingAppliedReleasePoint() {
  const pending = await pendingReleasePoint();
  return pending ? { id: Number(pending.id), release_date: pending.release_date } : null;
}

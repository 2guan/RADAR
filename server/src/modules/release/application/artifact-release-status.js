/**
 * 文件：server/src/modules/release/application/artifact-release-status.js
 * 说明：交付制品投产状态保存在投产申请的 delivery_units JSON 数组中；本服务负责旧数据默认化
 *       以及“全部关联制品已投产 + 评审已同意/应急审批”时的审批状态自动推进。
 * 用途：投产申请和投产审批共用的制品投产状态领域编排，避免在两个路由分别聚合导致口径漂移。
 * 作者：hengguan
 */

import { all, get, run, tx } from '../../../platform/persistence/index.js';
import { auditUpdate } from '../../../platform/audit/index.js';
import { parseJsonArray } from '../../../platform/runtime/index.js';
import { defaultDictAttr } from '../../settings/process-configuration/index.js';

const APPROVED_REVIEW_STATUSES = new Set(['评审同意', '应急审批']);
const TERMINAL_RELEASE_STATUSES = new Set(['已投产', '已取消']);

function hasArtifactContent(unit) {
  return !!(unit?.artifact_type || unit?.delivery_unit || unit?.new_version);
}

/** 历史四列 JSON 缺少制品投产状态时，以当前字典默认值只读兼容。 */
export async function withArtifactReleaseStatusDefaults(units) {
  const defaultStatus = await defaultDictAttr('artifact_release_status', '待投产');
  return (Array.isArray(units) ? units : []).map((unit) => ({
    ...unit,
    artifact_release_status: hasArtifactContent(unit)
      ? (unit?.artifact_release_status || defaultStatus)
      : unit?.artifact_release_status || null,
  }));
}

async function allLinkedArtifactUnits(workItemCode, releasePointId) {
  const rows = await all(
    `SELECT ra.delivery_units
       FROM release_apply_reference rar
       JOIN release_apply ra ON ra.id = rar.release_apply_id
      WHERE rar.ref_code = ?
        AND (rar.release_point_id = ? OR (rar.release_point_id IS NULL AND ? IS NULL))`,
    workItemCode, releasePointId ?? null, releasePointId ?? null,
  );
  const groups = await Promise.all(rows.map(async (row) => withArtifactReleaseStatusDefaults(parseJsonArray(row.delivery_units))));
  return groups.flat().filter(hasArtifactContent);
}

/**
 * 仅允许由关联制品推进审批到已投产；取消、已投产和不满足条件的状态都保持原样。
 * 自动更新和审计同属一个事务，调用方可安全地在申请保存/会签重算后重复调用。
 */
export async function reconcileReleaseTaskArtifactStatus(releaseTaskId, actorName) {
  return await tx(async () => {
    const task = await get('SELECT id, req_code, release_point_id, status, review_status FROM release_task WHERE id = ?', releaseTaskId);
    if (!task || TERMINAL_RELEASE_STATUSES.has(task.status) || !APPROVED_REVIEW_STATUSES.has(task.review_status)) return null;
    const units = await allLinkedArtifactUnits(task.req_code, task.release_point_id);
    if (!units.length || units.some((unit) => unit.artifact_release_status !== '已投产')) return null;

    await run(
      "UPDATE release_task SET status='已投产', updated_at=datetime('now','localtime') WHERE id=?",
      task.id,
    );
    await auditUpdate(
      'release', task.id, task.req_code, actorName,
      { status: task.status },
      { status: '已投产' },
      { status: '投产状态（关联制品全部已投产自动推进）' },
    );
    return { ...task, nextStatus: '已投产' };
  });
}

/** 对一组工作项/投产点重新判定，供投产申请保存、导入、关联调整后调用。 */
export async function reconcileReleaseTasksForArtifactChange(workItemCodes, releasePointId, actorName) {
  const codes = [...new Set((Array.isArray(workItemCodes) ? workItemCodes : [])
    .map((code) => String(code || '').trim()).filter(Boolean))];
  if (!codes.length) return [];
  const placeholders = codes.map(() => '?').join(',');
  const tasks = await all(
    `SELECT id FROM release_task
      WHERE req_code IN (${placeholders})
        AND (release_point_id = ? OR (release_point_id IS NULL AND ? IS NULL))`,
    ...codes, releasePointId ?? null, releasePointId ?? null,
  );
  const updated = [];
  for (const task of tasks) {
    const result = await reconcileReleaseTaskArtifactStatus(task.id, actorName);
    if (result) updated.push(result);
  }
  return updated;
}

export function isApprovedReviewStatus(reviewStatus) {
  return APPROVED_REVIEW_STATUSES.has(reviewStatus);
}

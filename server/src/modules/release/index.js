/**
 * 文件：server/src/modules/release/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

/** Public boundary: release exposes read-only artifact normalization for other aggregate views. */
export { buildReleaseWordDoc, formatWordDateTime } from './application/release-word.js';
export {
  claimReleaseApplyCode, generateReleaseApplyCode, previewReleaseApplyCode,
} from './applications/release-apply/index.js';
export { listReleaseTaskStageTypes, listReleaseTaskStatuses } from './application/task-statuses.js';
export { withArtifactReleaseStatusDefaults } from './application/artifact-release-status.js';
export {
  appliedReleasePointsForWorkItems, pendingAppliedReleasePoint, workItemCodesForAppliedReleasePoints,
} from './application/work-item-release-points.js';
export { MODULE_CONTRACT as releaseContract } from './contracts/index.js';

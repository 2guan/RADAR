/**
 * 文件：server/src/modules/development/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

/** Public delivery contract for downstream lifecycle consumers. */
export {
  getWorkItem, replaceWorkItemDevelopmentSystemRoles, workItemCodesInReleasePoints, releaseDateMapForCodes,
} from './application/work-items.js';
export {
  validateChangeItem, decodeChangeItem, validateCoverageRow,
  formatImpactItemsText, formatCoverageText, impactItemExportLines, coverageItemExportLines,
} from './application/impact-schema.js';
export { calcDeviation } from './application/deviation.js';
export { generateDevTaskCode, generateTestTaskCode } from './application/numbering.js';
export { listDevTaskStatuses } from './application/task-statuses.js';
export { MODULE_CONTRACT as deliveryContract } from './contracts/index.js';

/**
 * 文件：server/src/modules/delivery/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

/** Public delivery contract for downstream lifecycle consumers. */
export {
  getWorkItem, workItemCodesInReleasePoints, releaseDateMapForCodes,
} from './application/work-items.js';
export { formatImpactItemsText, formatCoverageText } from '../../lib/impact-schema.js';
export { MODULE_CONTRACT as deliveryContract } from './contracts/index.js';

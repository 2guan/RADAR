/**
 * 文件：server/src/shared/contracts/work-item.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开契约与稳定数据约定。
 * 作者：hengguan
 */

/**
 * Shared DTO names only. Data access belongs to requirements, tickets and delivery.
 */
export const WORK_ITEM_TYPES = Object.freeze(['requirement', 'ticket']);
export function isWorkItemType(value) {
  return WORK_ITEM_TYPES.includes(value);
}

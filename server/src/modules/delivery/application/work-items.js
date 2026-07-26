/**
 * 文件：modules/delivery/application/work-items.js
 * 说明：本服务不拥有也不写入需求/工单数据，只统一 DTO 与查询结果。
 * 用途：将需求和工单两个独立只读契约组合为交付链路可消费的工作项。
 * 作者：hengguan
 */
import {
  findRequirementWorkItem, requirementCodesInReleasePoints, requirementReleaseDates,
} from '../../requirements/index.js';
import {
  findTicketWorkItem, ticketCodesInReleasePoints, ticketReleaseDates,
} from '../../tickets/index.js';
import { parseJsonArray } from '../../../platform/runtime/index.js';

const JSON_FIELDS = ['main_systems', 'collab_dev_systems', 'collab_test_systems', 'proposer'];

// 统一历史字段命名，确保下游只识别 workItemCode 和 workItemType。
function decode(row) {
  if (!row) return null;
  const item = {
    ...row,
    entity_type: row.workItemType,
    req_code: row.workItemCode,
    code: row.workItemCode,
    entity_label: row.workItemType === 'ticket' ? '工单' : '需求',
  };
  for (const field of JSON_FIELDS) item[field] = parseJsonArray(item[field]);
  return item;
}

export async function getWorkItem(workItemCode) {
  return decode(await findRequirementWorkItem(workItemCode)) || decode(await findTicketWorkItem(workItemCode));
}

export async function workItemCodesInReleasePoints(ids) {
  // 两个模块并行查询后去重，避免投产点筛选重复展示同一编号。
  const [requirements, tickets] = await Promise.all([
    requirementCodesInReleasePoints(ids), ticketCodesInReleasePoints(ids),
  ]);
  return [...new Set([...requirements, ...tickets])];
}

export async function releaseDateMapForCodes(codes) {
  const unique = [...new Set((codes || []).filter(Boolean))];
  const [requirements, tickets] = await Promise.all([
    requirementReleaseDates(unique), ticketReleaseDates(unique),
  ]);
  return { ...requirements, ...tickets };
}

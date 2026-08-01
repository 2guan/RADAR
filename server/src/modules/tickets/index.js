/**
 * 文件：server/src/modules/tickets/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

import { get, all } from '../../platform/persistence/index.js';
import { appliedReleasePointsForWorkItems, workItemCodesForAppliedReleasePoints } from '../release/index.js';
import { TICKET_WORK_ITEM_TYPE } from './contracts/work-item.js';

export { generateTicketCode, ticketCodeRequiresReleasePoint } from './application/numbering.js';
export { replaceTicketDevelopmentSystemRoles } from './application/development-system-roles.js';

/** Public read contract. Other modules must not query the ticket table directly. */
export async function findTicketWorkItem(workItemCode) {
  const row = await get('SELECT * FROM ticket WHERE ticket_code = ?', workItemCode);
  return row ? { ...row, workItemType: TICKET_WORK_ITEM_TYPE, workItemCode: row.ticket_code } : null;
}

export async function ticketCodesInReleasePoints(ids) {
  if (!ids?.length) return null;
  const rows = await all('SELECT ticket_code AS code FROM ticket');
  return workItemCodesForAppliedReleasePoints(rows.map((row) => row.code), ids);
}

export async function ticketReleaseDates(codes) {
  const points = await appliedReleasePointsForWorkItems(codes);
  return Object.fromEntries(Object.entries(points).map(([code, values]) => [code, values[0]?.release_date || null]));
}

export async function ticketAppliedReleasePoints(codes) {
  return appliedReleasePointsForWorkItems(codes);
}

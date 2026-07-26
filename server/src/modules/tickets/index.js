/**
 * 文件：server/src/modules/tickets/index.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：模块公开入口，供其他模块通过契约调用。
 * 作者：hengguan
 */

import { get, all } from '../../platform/persistence/index.js';
import { inClause } from '../../lib/window.js';
import { TICKET_WORK_ITEM_TYPE } from './contracts/work-item.js';

/** Public read contract. Other modules must not query the ticket table directly. */
export async function findTicketWorkItem(workItemCode) {
  const row = await get('SELECT * FROM ticket WHERE ticket_code = ?', workItemCode);
  return row ? { ...row, workItemType: TICKET_WORK_ITEM_TYPE, workItemCode: row.ticket_code } : null;
}

export async function ticketCodesInReleasePoints(ids) {
  const where = inClause('release_point_id', ids);
  if (!where.where) return [];
  const rows = await all('SELECT ticket_code AS code FROM ticket WHERE ' + where.where, ...where.params);
  return rows.map((row) => row.code);
}

export async function ticketReleaseDates(codes) {
  if (!codes.length) return {};
  const placeholders = codes.map(() => '?').join(',');
  const rows = await all(
    'SELECT t.ticket_code AS code, rp.release_date FROM ticket t LEFT JOIN release_point rp ON t.release_point_id = rp.id WHERE t.ticket_code IN (' + placeholders + ')',
    ...codes,
  );
  return Object.fromEntries(rows.map((row) => [row.code, row.release_date]));
}

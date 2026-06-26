import { get, all } from '../db/index.js';
import { inClause } from './window.js';

const JSON_FIELDS = ['main_systems', 'collab_dev_systems', 'collab_test_systems', 'proposer'];

function decodeEntity(row, type) {
  if (!row) return null;
  const code = type === 'ticket' ? row.ticket_code : row.req_code;
  const out = {
    ...row,
    entity_type: type,
    req_code: code,
    code,
    entity_label: type === 'ticket' ? '工单' : '需求',
  };
  for (const field of JSON_FIELDS) {
    if (!out[field]) {
      out[field] = [];
      continue;
    }
    try {
      const parsed = JSON.parse(out[field]);
      out[field] = Array.isArray(parsed) ? parsed : [out[field]];
    } catch {
      out[field] = [out[field]];
    }
  }
  return out;
}

export function getWorkItem(code) {
  const req = get('SELECT * FROM requirement WHERE req_code = ?', code);
  if (req) return decodeEntity(req, 'requirement');
  const ticket = get('SELECT * FROM ticket WHERE ticket_code = ?', code);
  if (ticket) return decodeEntity(ticket, 'ticket');
  return null;
}

export function workItemCodesInReleasePoints(ids) {
  const sub = inClause('release_point_id', ids);
  if (!sub.where) return null;
  const reqs = all(`SELECT req_code AS code FROM requirement WHERE ${sub.where}`, ...sub.params).map((r) => r.code);
  const tickets = all(`SELECT ticket_code AS code FROM ticket WHERE ${sub.where}`, ...sub.params).map((r) => r.code);
  return [...new Set([...reqs, ...tickets])];
}

export function releaseDateMapForCodes(codes) {
  const arr = [...new Set((codes || []).filter(Boolean))];
  const map = {};
  if (!arr.length) return map;
  const ph = arr.map(() => '?').join(',');
  for (const r of all(
    `SELECT r.req_code AS code, rp.release_date
       FROM requirement r
       LEFT JOIN release_point rp ON r.release_point_id = rp.id
      WHERE r.req_code IN (${ph})`,
    ...arr,
  )) {
    map[r.code] = r.release_date;
  }
  for (const r of all(
    `SELECT t.ticket_code AS code, rp.release_date
       FROM ticket t
       LEFT JOIN release_point rp ON t.release_point_id = rp.id
      WHERE t.ticket_code IN (${ph})`,
    ...arr,
  )) {
    map[r.code] = r.release_date;
  }
  return map;
}

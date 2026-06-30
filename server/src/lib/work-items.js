/**
 * 文件：lib/work-items.js
 * 用途：统一封装“需求/工单”工作项查询。业务上两类实体在投产、测试、统计中经常共用，
 *       本文件负责按编号识别实体类型、解析 JSON 字段并返回统一结构。
 * 作者：hengguan
 * 说明：为兼容 SQLite 与 TDSQL，JSON 数组字段统一通过 parseJsonArray 处理；
 *       查询入口保持异步，便于不同 provider 共享同一业务调用方式。
 */

import { get, all } from '../db/index.js';
import { inClause } from './window.js';
import { parseJsonArray } from './json.js';

// 需求与工单中需要按数组语义返回给业务层的 JSON 字段。
const JSON_FIELDS = ['main_systems', 'collab_dev_systems', 'collab_test_systems', 'proposer'];

function decodeEntity(row, type) {
  // 将 requirement/ticket 两张表归一成工作项结构，方便上层按 code/entity_type 处理。
  if (!row) return null;
  const code = type === 'ticket' ? row.ticket_code : row.req_code;
  const out = {
    ...row,
    entity_type: type,
    req_code: code,
    code,
    entity_label: type === 'ticket' ? '工单' : '需求',
  };
  // SQLite 通常返回 JSON 字符串，TDSQL JSON 字段可能返回对象/数组，这里统一成数组。
  for (const field of JSON_FIELDS) out[field] = parseJsonArray(out[field]);
  return out;
}

export async function getWorkItem(code) {
  // 编号可能属于需求或工单，按当前业务编号唯一性依次查询两张表。
  const req = await get('SELECT * FROM requirement WHERE req_code = ?', code);
  if (req) return decodeEntity(req, 'requirement');
  const ticket = await get('SELECT * FROM ticket WHERE ticket_code = ?', code);
  if (ticket) return decodeEntity(ticket, 'ticket');
  return null;
}

export async function workItemCodesInReleasePoints(ids) {
  // 查询投产点下所有需求/工单编号；空 id 集合返回 null，表示调用方无需追加过滤。
  const sub = inClause('release_point_id', ids);
  if (!sub.where) return null;
  const reqs = (await all(`SELECT req_code AS code FROM requirement WHERE ${sub.where}`, ...sub.params)).map((r) => r.code);
  const tickets = (await all(`SELECT ticket_code AS code FROM ticket WHERE ${sub.where}`, ...sub.params)).map((r) => r.code);
  return [...new Set([...reqs, ...tickets])];
}

export async function releaseDateMapForCodes(codes) {
  // 为一组需求/工单编号批量补齐投产日期，减少上层逐条查询数据库。
  const arr = [...new Set((codes || []).filter(Boolean))];
  const map = {};
  if (!arr.length) return map;
  const ph = arr.map(() => '?').join(',');
  for (const r of await all(
    `SELECT r.req_code AS code, rp.release_date
       FROM requirement r
       LEFT JOIN release_point rp ON r.release_point_id = rp.id
      WHERE r.req_code IN (${ph})`,
    ...arr,
  )) {
    map[r.code] = r.release_date;
  }
  for (const r of await all(
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

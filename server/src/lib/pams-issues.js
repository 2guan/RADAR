/**
 * 文件：lib/pams-issues.js
 * 用途：为 RADAR 投产链路提供 PAMS 问题表只读适配。
 * 说明：PAMS 使用 issue_id 作为问题编号；投产链路历史上使用 issue_code，这里做字段兼容。
 */

import { pamsGet, pamsAll } from '../db/pams.js';

export function normalizePamsIssue(row) {
  if (!row) return null;
  return {
    ...row,
    id: row.issue_id,
    issue_code: row.issue_id,
  };
}

export function getPamsIssue(code) {
  return normalizePamsIssue(pamsGet('SELECT * FROM biz_issue WHERE issue_id = ?', code));
}

export function hasPamsIssue(code) {
  return !!pamsGet('SELECT 1 FROM biz_issue WHERE issue_id = ?', code);
}

export function listPamsIssuesByCodes(codes, columns = '*') {
  const arr = [...new Set((codes || []).filter(Boolean))];
  if (!arr.length) return [];
  return pamsAll(
    `SELECT ${columns} FROM biz_issue WHERE issue_id IN (${arr.map(() => '?').join(',')})`,
    ...arr,
  ).map(normalizePamsIssue);
}

export function pamsIssueMapByCode(codes, columns = '*') {
  const map = new Map();
  for (const row of listPamsIssuesByCodes(codes, columns)) {
    map.set(row.issue_code, row);
  }
  return map;
}

export function listAllPamsIssues(columns = '*') {
  return pamsAll(`SELECT ${columns} FROM biz_issue`).map(normalizePamsIssue);
}

/**
 * 用途：把现有 PAMS SQLite 数据库迁移到 RADAR 独立 PAMS 数据库。
 *
 * 用法：
 *   PAMS_SOURCE_DB=/Volumes/GuanMac/Code/PAMS/database/pams.db node server/scripts/migrate-pams-db.js
 *   node server/scripts/migrate-pams-db.js /Volumes/GuanMac/Code/PAMS/database/pams.db
 */

import fs from 'node:fs';
import path from 'node:path';
import { initPamsDatabase, pamsDb } from '../src/db/pams.js';
import { runPamsSeed } from '../src/db/pams-seed.js';
import { config } from '../src/config.js';

const source = process.argv[2] || process.env.PAMS_SOURCE_DB;
if (!source) {
  console.error('缺少源库路径：请传入参数或设置 PAMS_SOURCE_DB');
  process.exit(1);
}

const sourcePath = path.resolve(source);
if (!fs.existsSync(sourcePath)) {
  console.error(`源库不存在：${sourcePath}`);
  process.exit(1);
}

const TABLES = [
  'sys_user',
  'sys_dict',
  'biz_issue',
  'biz_issue_history',
  'biz_common_issue',
  'biz_case',
  'biz_itsm_ticket',
  'biz_kongming_ticket',
  'biz_business_ticket',
  'sys_ai_settings',
  'sys_user_dashboard',
];

function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function hasSourceTable(table) {
  return !!pamsDb.prepare("SELECT name FROM src.sqlite_master WHERE type='table' AND name = ?").get(table);
}

function columns(schema, table) {
  return pamsDb.prepare(`PRAGMA ${schema}.table_info(${quoteIdent(table)})`).all().map((r) => r.name);
}

function migrateTable(table) {
  if (!hasSourceTable(table)) return { table, skipped: true, count: 0 };
  const srcCols = new Set(columns('src', table));
  const dstCols = columns('main', table).filter((col) => srcCols.has(col));
  if (!dstCols.length) return { table, skipped: true, count: 0 };

  const colList = dstCols.map(quoteIdent).join(', ');
  const sql = `INSERT OR REPLACE INTO main.${quoteIdent(table)} (${colList}) SELECT ${colList} FROM src.${quoteIdent(table)}`;
  const result = pamsDb.prepare(sql).run();
  return { table, skipped: false, count: result.changes || 0 };
}

initPamsDatabase();

const escaped = sqlString(sourcePath);
pamsDb.exec(`ATTACH DATABASE ${escaped} AS src`);

const results = [];
try {
  pamsDb.exec('BEGIN IMMEDIATE');
  for (const table of TABLES) results.push(migrateTable(table));
  pamsDb.exec('COMMIT');
} catch (err) {
  pamsDb.exec('ROLLBACK');
  throw err;
} finally {
  pamsDb.exec('DETACH DATABASE src');
}

runPamsSeed();

console.log(`[PAMS迁移] 目标库：${config.pamsDbFile}`);
for (const r of results) {
  console.log(`[PAMS迁移] ${r.table}: ${r.skipped ? '跳过' : `${r.count} 行`}`);
}

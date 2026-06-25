/**
 * 文件：db/pams.js
 * 用途：PAMS 问题管理子系统独立 SQLite 连接、结构初始化与轻量 DAO。
 * 说明：PAMS 数据库与 RADAR 主库隔离，便于导入现有 PAMS pams.db 并逐步迁移页面功能。
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.join(__dirname, 'pams-schema.sql');

fs.mkdirSync(path.dirname(config.pamsDbFile), { recursive: true });

export const pamsDb = new DatabaseSync(config.pamsDbFile);

pamsDb.exec('PRAGMA journal_mode = WAL;');
pamsDb.exec('PRAGMA foreign_keys = ON;');
pamsDb.exec('PRAGMA busy_timeout = 5000;');
pamsDb.exec('PRAGMA synchronous = NORMAL;');
pamsDb.exec('PRAGMA temp_store = MEMORY;');
pamsDb.exec('PRAGMA cache_size = -16000;');
pamsDb.exec('PRAGMA mmap_size = 268435456;');

const stmtCache = new Map();

function prepare(sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = pamsDb.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

export function initPamsDatabase() {
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  pamsDb.exec(schema);
  ensurePamsColumns();
}

function tableColumns(table) {
  return new Set(pamsDb.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name));
}

function addColumnIfMissing(table, column, ddl) {
  const cols = tableColumns(table);
  if (!cols.has(column)) pamsDb.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function ensurePamsColumns() {
  // 兼容用户直接把旧 PAMS pams.db 放到 RADAR 数据目录的场景。
  addColumnIfMissing('sys_dict', 'is_default_val', 'is_default_val INTEGER DEFAULT 0');

  for (const [column, ddl] of [
    ['reporter_name', 'reporter_name TEXT'],
    ['reporter_org', 'reporter_org TEXT'],
    ['reporter_contact', 'reporter_contact TEXT'],
    ['linked_cases', "linked_cases TEXT DEFAULT '[]'"],
    ['detailed_classification', "detailed_classification TEXT DEFAULT '未分类'"],
    ['round', "round TEXT DEFAULT '第二轮'"],
    ['plan_fix_time', 'plan_fix_time DATETIME'],
    ['resolve_time', 'resolve_time DATETIME'],
    ['urgency', "urgency TEXT DEFAULT '中'"],
    ['handling_method', "handling_method TEXT DEFAULT '其它'"],
    ['version_number', 'version_number TEXT'],
    ['release_status', "release_status TEXT DEFAULT ''"],
    ['work_order_no', 'work_order_no TEXT'],
  ]) {
    addColumnIfMissing('biz_issue', column, ddl);
  }

  for (const [column, ddl] of [
    ['radar_role_id', 'radar_role_id INTEGER'],
    ['radar_role_name', 'radar_role_name TEXT'],
    ['created_at', "created_at DATETIME DEFAULT CURRENT_TIMESTAMP"],
  ]) {
    addColumnIfMissing('pams_role_mapping', column, ddl);
  }
}

export function pamsGet(sql, ...params) {
  return prepare(sql).get(...params);
}

export function pamsAll(sql, ...params) {
  return prepare(sql).all(...params);
}

export function pamsRun(sql, ...params) {
  return prepare(sql).run(...params);
}

export function pamsTx(fn) {
  pamsDb.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    pamsDb.exec('COMMIT');
    return result;
  } catch (err) {
    pamsDb.exec('ROLLBACK');
    throw err;
  }
}

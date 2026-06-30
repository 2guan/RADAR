#!/usr/bin/env node
/**
 * 文件：scripts/sqlite-to-tdsql.js
 * 用途：RADAR 应用级数据库迁移工具。支持 SQLite -> TDSQL、TDSQL -> SQLite、
 *       TDSQL -> TDSQL 三种方向，按业务表依赖顺序迁移数据并处理 JSON 字段差异。
 * 作者：hengguan
 * 说明：该脚本面向跨数据库形态和应用字段兼容场景，保留原始 id，支持 dry-run
 *       和 truncate；TDSQL 直连迁移使用 source/target 前缀参数区分源库和目标库。
 *
 * 用法：
 *   node server/scripts/sqlite-to-tdsql.js --sqlite ./data/radar.db
 *   node server/scripts/sqlite-to-tdsql.js --direction sqlite-to-tdsql --sqlite ./data/radar.db --truncate
 *   node server/scripts/sqlite-to-tdsql.js --direction tdsql-to-sqlite --sqlite ./data/radar-from-tdsql.db --truncate
 *   node server/scripts/sqlite-to-tdsql.js --direction tdsql-to-tdsql --source-host src --target-host dst --truncate
 *
 * TDSQL 连接参数优先读取命令行，其次读取 .env：
 *   TDSQL_HOST/TDSQL_PORT/TDSQL_USER/TDSQL_PASSWORD/TDSQL_DATABASE/TDSQL_SSL
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import mysql from 'mysql2/promise';
import { loadEnvFile } from '../src/lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SERVER_ROOT, '..');
const SQLITE_MIGRATIONS_DIR = path.join(SERVER_ROOT, 'src', 'db', 'migrations');
loadEnvFile(path.join(REPO_ROOT, '.env'));

const DIRECTIONS = new Set(['sqlite-to-tdsql', 'tdsql-to-sqlite', 'tdsql-to-tdsql']);

const TABLE_ORDER = [
  'app_config',
  'dict_item',
  'system',
  'role',
  'permission',
  'user',
  'user_role',
  'release_point',
  'requirement',
  'ticket',
  'dev_task',
  'test_task',
  'issue',
  'release_task',
  'release_system',
  'release_signoff',
  'release_apply',
  'attachment',
  'audit_log',
  'saved_filter',
  'dashboard_chart',
  'user_signature',
  'login_fail_tracker',
];

const JSON_COLUMNS = new Set([
  'dict_item.extra',
  'requirement.proposer',
  'requirement.main_systems',
  'requirement.collab_dev_systems',
  'requirement.collab_test_systems',
  'ticket.proposer',
  'ticket.main_systems',
  'ticket.collab_dev_systems',
  'ticket.collab_test_systems',
  'issue.analysis_log',
  'issue.linked_cases',
  'issue.tags',
  'release_apply.delivery_units',
  'release_apply.ref_codes',
  'saved_filter.payload',
  'dashboard_chart.config',
]);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--truncate') { out.truncate = true; continue; }
    if (arg === '--dry-run') { out.dryRun = true; continue; }
    if (arg.startsWith('--')) {
      const [rawKey, inline] = arg.slice(2).split('=');
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = inline ?? argv[++i];
    }
  }
  return out;
}

/** 必填参数校验：统一输出中文参数名，便于部署人员定位缺失项。 */
function required(value, name) {
  if (value === undefined || value === '') throw new Error(`缺少参数：${name}`);
  return value;
}

/** 兼容字符串端口和空值，保证连接配置中的端口始终是有效整数。 */
function intValue(value, fallback) {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

/** 解析命令行和环境变量中的布尔配置，例如 TDSQL_SSL。 */
function boolValue(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

/** 解析迁移方向；未显式指定时保持历史默认行为 sqlite-to-tdsql。 */
function directionOf(args) {
  const direction = args.direction || `${args.from || 'sqlite'}-to-${args.to || 'tdsql'}`;
  if (!DIRECTIONS.has(direction)) {
    throw new Error(`迁移方向非法：${direction}，可选 sqlite-to-tdsql、tdsql-to-sqlite 或 tdsql-to-tdsql`);
  }
  return direction;
}

function ident(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function sqliteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function sqlitePathOf(args, direction) {
  if (direction === 'tdsql-to-tdsql') return null;
  return path.resolve(REPO_ROOT, required(args.sqlite || process.env.MIGRATE_SQLITE_FILE || process.env.DB_FILE, '--sqlite'));
}

/** 读取带前缀的命令行参数，例如 sourceHost/targetHost。 */
function argValue(args, prefix, name) {
  if (!prefix) return args[name];
  return args[`${prefix}${name[0].toUpperCase()}${name.slice(1)}`];
}

/** 读取带前缀的环境变量，例如 SOURCE_TDSQL_HOST/TARGET_TDSQL_HOST。 */
function envValue(prefix, name) {
  if (!prefix) return process.env[`TDSQL_${name}`];
  return process.env[`${prefix.toUpperCase()}_TDSQL_${name}`];
}

/**
 * 组装 TDSQL 连接配置。
 * allowGenericFallback=true 时可回退到 TDSQL_*，用于单库迁移或 source 默认值；
 * target 配置默认不回退，避免 TDSQL->TDSQL 时误把目标库解析成源库。
 */
function tdsqlConfig(args, prefix = '', allowGenericFallback = true) {
  const fallback = (name) => (allowGenericFallback ? (args[name] || process.env[`TDSQL_${name.toUpperCase()}`]) : undefined);
  const fallbackNullish = (name) => (allowGenericFallback ? (args[name] ?? process.env[`TDSQL_${name.toUpperCase()}`]) : undefined);
  return {
    host: argValue(args, prefix, 'host') || envValue(prefix, 'HOST') || fallback('host') || '127.0.0.1',
    port: intValue(argValue(args, prefix, 'port') || envValue(prefix, 'PORT') || fallback('port'), 3306),
    user: argValue(args, prefix, 'user') || envValue(prefix, 'USER') || fallback('user') || 'radar',
    password: required(
      argValue(args, prefix, 'password') ?? envValue(prefix, 'PASSWORD') ?? fallbackNullish('password'),
      prefix ? `${prefix.toUpperCase()}_TDSQL_PASSWORD 或 --${prefix}-password` : 'TDSQL_PASSWORD',
    ),
    database: required(
      argValue(args, prefix, 'database') || envValue(prefix, 'DATABASE') || fallback('database'),
      prefix ? `${prefix.toUpperCase()}_TDSQL_DATABASE 或 --${prefix}-database` : 'TDSQL_DATABASE',
    ),
    charset: 'utf8mb4',
    timezone: argValue(args, prefix, 'timezone') || envValue(prefix, 'TIMEZONE') || fallback('timezone') || '+08:00',
    multipleStatements: true,
    ssl: boolValue(argValue(args, prefix, 'ssl') ?? envValue(prefix, 'SSL') ?? fallbackNullish('ssl')) ? {} : undefined,
  };
}

/** 打印连接标签时不包含密码。 */
function tdsqlLabel(config) {
  return `${config.host}:${config.port}/${config.database}`;
}

/** SQLite -> TDSQL 时，JSON 字段需要保证写入 MySQL JSON 列的是合法 JSON 字符串。 */
function normalizeJsonForTdsql(table, column, value) {
  if (!JSON_COLUMNS.has(`${table}.${column}`)) return value;
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return JSON.stringify(value);
  JSON.parse(value);
  return value;
}

/** TDSQL -> SQLite 时，Date 转字符串，JSON 数组/对象转字符串，保持 SQLite 存储格式。 */
function normalizeValueForSqlite(table, column, value) {
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  if (!JSON_COLUMNS.has(`${table}.${column}`)) return value;
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function mysqlColumns(conn, table) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM ${ident(table)}`);
  return new Set(rows.map((r) => r.Field));
}

/** 读取 TDSQL 当前库中所有业务表，用于自动跳过目标端不存在的表。 */
async function mysqlTables(conn) {
  const [rows] = await conn.query('SHOW TABLES');
  return new Set(rows.map((r) => Object.values(r)[0]));
}

/** 读取 SQLite 文件中的业务表清单。 */
function sqliteTables(db) {
  return new Set(
    db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((r) => r.name),
  );
}

/** 读取 SQLite 表字段，迁移时只写入目标端真实存在的字段。 */
function sqliteColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${sqliteIdent(table)})`).all().map((r) => r.name));
}

/** 读取 SQLite 主键字段，用于构造 ON CONFLICT upsert 语句。 */
function sqlitePrimaryKeyColumns(db, table) {
  return db.prepare(`PRAGMA table_info(${sqliteIdent(table)})`)
    .all()
    .filter((r) => r.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((r) => r.name);
}

/** 目标 SQLite 文件不存在或结构不完整时，按项目迁移脚本补齐 schema。 */
function ensureSqliteSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);
  const applied = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => r.name));
  const files = fs.readdirSync(SQLITE_MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(SQLITE_MIGRATIONS_DIR, file), 'utf8');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
      console.log(`[迁移] SQLite 已应用结构迁移：${file}`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

/** TDSQL 导入保留原 id 后，需要把 AUTO_INCREMENT 调整到 MAX(id)+1。 */
async function resetMysqlAutoIncrement(conn, table) {
  const [[row]] = await conn.query(`SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ${ident(table)}`);
  const nextId = Math.max(1, Number(row?.next_id || 1));
  await conn.query(`ALTER TABLE ${ident(table)} AUTO_INCREMENT = ${nextId}`);
}

/** SQLite 导入保留原 id 后，清理 sqlite_sequence，使后续自增从当前最大值继续。 */
function resetSqliteAutoIncrement(db, table) {
  const hasSequence = !!db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='sqlite_sequence'").get();
  if (!hasSequence) return;
  db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(table);
}

/** 迁移单表：SQLite 源表 -> TDSQL 目标表。 */
async function migrateSqliteTableToTdsql({ sqlite, conn, table, dryRun }) {
  const targetColumns = await mysqlColumns(conn, table);
  const rows = sqlite.prepare(`SELECT * FROM ${sqliteIdent(table)}`).all();
  if (!rows.length) return { table, rows: 0 };

  const columns = Object.keys(rows[0]).filter((col) => targetColumns.has(col));
  if (!columns.length) return { table, rows: 0, skipped: true };

  const insertSql = `
    INSERT INTO ${ident(table)} (${columns.map(ident).join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
    ON DUPLICATE KEY UPDATE
      ${columns.filter((c) => c !== 'id').map((c) => `${ident(c)} = VALUES(${ident(c)})`).join(', ') || `${ident(columns[0])} = ${ident(columns[0])}`}
  `;

  if (dryRun) return { table, rows: rows.length, dryRun: true };

  for (const row of rows) {
    const values = columns.map((col) => normalizeJsonForTdsql(table, col, row[col]));
    await conn.execute(insertSql, values);
  }

  if (targetColumns.has('id')) await resetMysqlAutoIncrement(conn, table);
  return { table, rows: rows.length };
}

/** 迁移单表：TDSQL 源表 -> SQLite 目标表。 */
async function migrateTdsqlTableToSqlite({ conn, sqlite, table, dryRun }) {
  const targetColumns = sqliteColumns(sqlite, table);
  const [rows] = await conn.query(`SELECT * FROM ${ident(table)}`);
  if (!rows.length) return { table, rows: 0 };

  const columns = Object.keys(rows[0]).filter((col) => targetColumns.has(col));
  if (!columns.length) return { table, rows: 0, skipped: true };

  const pkColumns = sqlitePrimaryKeyColumns(sqlite, table).filter((col) => columns.includes(col));
  const updates = columns
    .filter((col) => !pkColumns.includes(col))
    .map((col) => `${sqliteIdent(col)} = excluded.${sqliteIdent(col)}`)
    .join(', ');
  const upsertSql = `
    INSERT INTO ${sqliteIdent(table)} (${columns.map(sqliteIdent).join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
    ${pkColumns.length && updates ? `ON CONFLICT (${pkColumns.map(sqliteIdent).join(', ')}) DO UPDATE SET ${updates}` : ''}
  `;
  const insert = sqlite.prepare(upsertSql);

  if (dryRun) return { table, rows: rows.length, dryRun: true };

  for (const row of rows) {
    const values = columns.map((col) => normalizeValueForSqlite(table, col, row[col]));
    insert.run(...values);
  }

  if (targetColumns.has('id')) resetSqliteAutoIncrement(sqlite, table);
  return { table, rows: rows.length };
}

/** 迁移单表：TDSQL 源表 -> TDSQL 目标表，不经过中间文件。 */
async function migrateTdsqlTableToTdsql({ sourceConn, targetConn, table, dryRun }) {
  const targetColumns = await mysqlColumns(targetConn, table);
  const [rows] = await sourceConn.query(`SELECT * FROM ${ident(table)}`);
  if (!rows.length) return { table, rows: 0 };

  const columns = Object.keys(rows[0]).filter((col) => targetColumns.has(col));
  if (!columns.length) return { table, rows: 0, skipped: true };

  const insertSql = `
    INSERT INTO ${ident(table)} (${columns.map(ident).join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
    ON DUPLICATE KEY UPDATE
      ${columns.filter((c) => c !== 'id').map((c) => `${ident(c)} = VALUES(${ident(c)})`).join(', ') || `${ident(columns[0])} = ${ident(columns[0])}`}
  `;

  if (dryRun) return { table, rows: rows.length, dryRun: true };

  for (const row of rows) {
    const values = columns.map((col) => normalizeJsonForTdsql(table, col, row[col]));
    await targetConn.execute(insertSql, values);
  }

  if (targetColumns.has('id')) await resetMysqlAutoIncrement(targetConn, table);
  return { table, rows: rows.length };
}

/** 判断两个 TDSQL 配置是否指向同一库，用于防止同库 truncate 误删。 */
function sameTdsqlEndpoint(a, b) {
  return String(a.host) === String(b.host)
    && Number(a.port) === Number(b.port)
    && String(a.database) === String(b.database)
    && String(a.user) === String(b.user);
}

/** 执行 SQLite -> TDSQL 方向迁移。 */
async function migrateSqliteToTdsql(args, sqlitePath, config) {
  if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite 文件不存在：${sqlitePath}`);
  const conn = await mysql.createConnection(config);
  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const sourceTables = sqliteTables(sqlite);
  const targetTables = await mysqlTables(conn);
  const tables = TABLE_ORDER.filter((table) => sourceTables.has(table) && targetTables.has(table));

  console.log(`[迁移] 方向：SQLite -> TDSQL`);
  console.log(`[迁移] SQLite 源：${sqlitePath}`);
  console.log(`[迁移] TDSQL 目标：${config.host}:${config.port}/${config.database}`);
  if (args.dryRun) console.log('[迁移] dry-run：仅统计，不写入目标库');

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    if (args.truncate && !args.dryRun) {
      for (const table of [...tables].reverse()) {
        await conn.query(`TRUNCATE TABLE ${ident(table)}`);
      }
    }

    for (const table of tables) {
      const result = await migrateSqliteTableToTdsql({ sqlite, conn, table, dryRun: args.dryRun });
      console.log(`[迁移] ${result.table}: ${result.rows} 行${result.dryRun ? '（dry-run）' : ''}`);
    }
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    sqlite.close();
    await conn.end();
  }
}

/** 执行 TDSQL -> SQLite 方向迁移。 */
async function migrateTdsqlToSqlite(args, sqlitePath, config) {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const conn = await mysql.createConnection(config);
  const sqlite = new DatabaseSync(sqlitePath);
  sqlite.exec('PRAGMA foreign_keys = ON;');
  ensureSqliteSchema(sqlite);

  const sourceTables = await mysqlTables(conn);
  const targetTables = sqliteTables(sqlite);
  const tables = TABLE_ORDER.filter((table) => sourceTables.has(table) && targetTables.has(table));

  console.log(`[迁移] 方向：TDSQL -> SQLite`);
  console.log(`[迁移] TDSQL 源：${config.host}:${config.port}/${config.database}`);
  console.log(`[迁移] SQLite 目标：${sqlitePath}`);
  if (args.dryRun) console.log('[迁移] dry-run：仅统计，不写入目标库');

  try {
    sqlite.exec('PRAGMA foreign_keys = OFF;');
    if (args.truncate && !args.dryRun) {
      for (const table of [...tables].reverse()) {
        sqlite.prepare(`DELETE FROM ${sqliteIdent(table)}`).run();
        resetSqliteAutoIncrement(sqlite, table);
      }
    }

    if (!args.dryRun) sqlite.exec('BEGIN IMMEDIATE');
    try {
      for (const table of tables) {
        const result = await migrateTdsqlTableToSqlite({ conn, sqlite, table, dryRun: args.dryRun });
        console.log(`[迁移] ${result.table}: ${result.rows} 行${result.dryRun ? '（dry-run）' : ''}`);
      }
      if (!args.dryRun) sqlite.exec('COMMIT');
    } catch (err) {
      if (!args.dryRun) sqlite.exec('ROLLBACK');
      throw err;
    }
  } finally {
    sqlite.exec('PRAGMA foreign_keys = ON;');
    sqlite.close();
    await conn.end();
  }
}

/** 执行 TDSQL -> TDSQL 直连迁移。 */
async function migrateTdsqlToTdsql(args, sourceConfig, targetConfig) {
  if (args.truncate && sameTdsqlEndpoint(sourceConfig, targetConfig)) {
    throw new Error('源 TDSQL 与目标 TDSQL 指向同一库，禁止使用 --truncate');
  }

  const sourceConn = await mysql.createConnection(sourceConfig);
  const targetConn = await mysql.createConnection(targetConfig);
  const sourceTables = await mysqlTables(sourceConn);
  const targetTables = await mysqlTables(targetConn);
  const tables = TABLE_ORDER.filter((table) => sourceTables.has(table) && targetTables.has(table));

  console.log(`[迁移] 方向：TDSQL -> TDSQL`);
  console.log(`[迁移] TDSQL 源：${tdsqlLabel(sourceConfig)}`);
  console.log(`[迁移] TDSQL 目标：${tdsqlLabel(targetConfig)}`);
  if (args.dryRun) console.log('[迁移] dry-run：仅统计，不写入目标库');

  try {
    await targetConn.query('SET FOREIGN_KEY_CHECKS = 0');
    if (args.truncate && !args.dryRun) {
      for (const table of [...tables].reverse()) {
        await targetConn.query(`TRUNCATE TABLE ${ident(table)}`);
      }
    }

    for (const table of tables) {
      const result = await migrateTdsqlTableToTdsql({ sourceConn, targetConn, table, dryRun: args.dryRun });
      console.log(`[迁移] ${result.table}: ${result.rows} 行${result.dryRun ? '（dry-run）' : ''}`);
    }
  } finally {
    await targetConn.query('SET FOREIGN_KEY_CHECKS = 1');
    await sourceConn.end();
    await targetConn.end();
  }
}

/** 命令入口：解析参数后分派到具体迁移方向。 */
async function main() {
  const args = parseArgs(process.argv);
  const direction = directionOf(args);
  const sqlitePath = sqlitePathOf(args, direction);

  if (direction === 'sqlite-to-tdsql') {
    const config = tdsqlConfig(args);
    await migrateSqliteToTdsql(args, sqlitePath, config);
  } else if (direction === 'tdsql-to-sqlite') {
    const config = tdsqlConfig(args);
    await migrateTdsqlToSqlite(args, sqlitePath, config);
  } else {
    const sourceConfig = tdsqlConfig(args, 'source', true);
    const targetConfig = tdsqlConfig(args, 'target', false);
    await migrateTdsqlToTdsql(args, sourceConfig, targetConfig);
  }

  console.log('[迁移] 完成。建议登录系统后抽查用户、需求/工单、附件、投产审批与仪表盘。');
}

main().catch((err) => {
  console.error('[迁移] 失败：', err.message);
  process.exit(1);
});

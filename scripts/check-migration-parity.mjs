/**
 * 文件：scripts/check-migration-parity.mjs
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：项目治理与自动化检查。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sqliteDir = path.join(root, 'server/src/db/migrations');
const tdsqlDir = path.join(sqliteDir, 'tdsql');
const exceptions = JSON.parse(fs.readFileSync(path.join(root, 'governance/migration-parity-exceptions.json'), 'utf8'));
const suffix = (name) => name.replace(/^\d+_/, '');
const names = (dir) => fs.readdirSync(dir).filter((name) => /^\d+_.+\.sql$/.test(name)).map(suffix);
const sqlite = new Set(names(sqliteDir));
const tdsql = new Set(names(tdsqlDir));
const allowedSqlite = new Set(exceptions.sqliteOnly || []);
const allowedTdsql = new Set(exceptions.tdsqlOnly || []);
const missingTdsql = [...sqlite].filter((name) => !tdsql.has(name) && !allowedSqlite.has(name));
const missingSqlite = [...tdsql].filter((name) => !sqlite.has(name) && !allowedTdsql.has(name));

if (missingTdsql.length || missingSqlite.length) {
  console.error(`Migration parity failed. Missing TDSQL: ${missingTdsql.join(', ') || 'none'}; missing SQLite: ${missingSqlite.join(', ') || 'none'}`);
  process.exit(1);
}
console.log('Migration parity check passed.');

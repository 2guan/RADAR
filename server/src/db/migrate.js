/**
 * 文件：db/migrate.js
 * 用途：数据库迁移执行器。按文件名序号顺序执行 migrations/ 目录下的 *.sql 文件，
 *       已执行的迁移记录在 _migrations 表中，保证幂等、可重复启动。
 * 作者：hengguan
 * 说明：迁移文件命名规范 NNNN_描述.sql（如 0001_init.sql），按 NNNN 升序执行。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * 执行全部未应用的迁移。
 */
export function runMigrations() {
  // 迁移记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
  `);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r) => r.name),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    // 每个迁移文件整体在一个事务中执行
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
      console.log(`[迁移] 已应用：${file}`);
    } catch (err) {
      db.exec('ROLLBACK');
      console.error(`[迁移] 失败：${file}`, err);
      throw err;
    }
  }
}

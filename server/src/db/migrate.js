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
import { all, exec, run, tx, dbClient } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_ROOT = path.join(__dirname, 'migrations');

function migrationsDir() {
  const clientDir = path.join(MIGRATIONS_ROOT, dbClient);
  return fs.existsSync(clientDir) ? clientDir : MIGRATIONS_ROOT;
}

/**
 * 执行全部未应用的迁移。
 */
export async function runMigrations() {
  // 迁移记录表
  if (dbClient === 'sqlite') {
    await exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name        TEXT PRIMARY KEY,
        applied_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
      );
    `);
  } else {
    await exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name        VARCHAR(255) PRIMARY KEY,
        applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  const applied = new Set(
    (await all('SELECT name FROM _migrations')).map((r) => r.name),
  );

  const dir = migrationsDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    // 每个迁移文件整体在一个事务中执行
    try {
      await tx(async () => {
        await exec(sql);
        await run('INSERT INTO _migrations (name) VALUES (?)', file);
      });
      console.log(`[迁移] 已应用：${file}`);
    } catch (err) {
      console.error(`[迁移] 失败：${file}`, err);
      throw err;
    }
  }
}

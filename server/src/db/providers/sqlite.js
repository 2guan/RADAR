/**
 * 文件：db/providers/sqlite.js
 * 说明：上层业务统一 await 数据库方法；SQLite provider 内部使用语句缓存、
 *       WAL 与外键开关，保持原文件库场景下的性能与一致性。
 * 用途：SQLite 数据库访问适配器。封装 node:sqlite 的同步 API，
 *       对外提供 async 风格的 get/all/run/exec/tx/close 接口。
 * 作者：hengguan
 */

import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { sqliteDialect } from '../dialects/sqlite.js';
import { logger } from '../../platform/runtime/index.js';

/** 记录慢 SQL 的结构化摘要；不输出绑定参数，避免日志包含业务敏感数据。 */
function measureQuery(config, operation, sql, fn) {
  const startedAt = performance.now();
  try {
    return fn();
  } finally {
    const elapsed = performance.now() - startedAt;
    if (elapsed >= config.logging.slowQueryMs) {
      logger.warn({ client: 'sqlite', operation, elapsedMs: Math.round(elapsed), sql: String(sql).replace(/\s+/g, ' ').slice(0, 240) }, 'Slow database query');
    }
  }
}

export function createSqliteProvider(config) {
  fs.mkdirSync(path.dirname(config.db.file), { recursive: true });

  const db = new DatabaseSync(config.db.file);
  // SQLite 运行参数：WAL 提升并发读写，foreign_keys 保证业务外键约束。
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA temp_store = MEMORY;');
  db.exec('PRAGMA cache_size = -16000;');
  db.exec('PRAGMA mmap_size = 268435456;');

  const stmtCache = new Map();
  // 导入等复合业务会在外层事务中保存扩展字段；嵌套时复用同一事务，
  // 与 TDSQL provider 的事务语义保持一致。
  const txStore = new AsyncLocalStorage();
  /** 缓存 prepare 结果，避免热点列表和详情接口反复编译同一 SQL。 */
  function prepare(sql) {
    let stmt = stmtCache.get(sql);
    if (!stmt) {
      stmt = db.prepare(sql);
      stmtCache.set(sql, stmt);
    }
    return stmt;
  }

  return {
    client: 'sqlite',
    dialect: sqliteDialect,
    raw: db,
    async get(sql, params = []) {
      return measureQuery(config, 'get', sql, () => prepare(sql).get(...params));
    },
    async all(sql, params = []) {
      return measureQuery(config, 'all', sql, () => prepare(sql).all(...params));
    },
    async run(sql, params = []) {
      const result = measureQuery(config, 'run', sql, () => prepare(sql).run(...params));
      return {
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid ?? 0),
      };
    },
    async exec(sql) {
      return measureQuery(config, 'exec', sql, () => db.exec(sql));
    },
    async tx(fn) {
      if (txStore.getStore()) return await fn();
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = await txStore.run(true, fn);
        db.exec('COMMIT');
        return result;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    async close() {
      db.close();
    },
  };
}

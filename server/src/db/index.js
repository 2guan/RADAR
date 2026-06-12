/**
 * 文件：db/index.js
 * 用途：基于 Node 原生 node:sqlite 建立数据库连接（单例），并提供一组轻量 DAO 辅助方法。
 *       所有 SQL 均使用预编译参数化语句，杜绝 SQL 注入。
 * 作者：hengguan
 * 说明：启用 WAL 日志模式与外键约束；导出 db 实例及常用查询封装（get/all/run/tx）。
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

// 确保数据库所在目录存在
fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

// 建立连接（同步 API）
export const db = new DatabaseSync(config.dbFile);

// 基础 PRAGMA：WAL 提升并发读性能；外键约束保证关联完整性
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');
// 读性能 PRAGMA：WAL 下 NORMAL 同步级别安全且少 fsync；排序/临时表走内存；
// 加大页缓存(~16MB)与内存映射(256MB)，显著降低整表扫描与重复查询的磁盘开销
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA temp_store = MEMORY;');
db.exec('PRAGMA cache_size = -16000;');
db.exec('PRAGMA mmap_size = 268435456;');

/**
 * 预编译语句缓存：同一 SQL 仅编译一次后复用，避免热点路径（列表枚举/N+1）反复 prepare。
 * 缓存以 SQL 文本为键；语句可携不同参数多次执行，线程模型为同步单连接，安全。
 */
const stmtCache = new Map();
function prepare(sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

/**
 * 查询单行。
 * @param {string} sql 含 ? 占位符的 SQL
 * @param  {...any} params 绑定参数
 * @returns {object|undefined}
 */
export function get(sql, ...params) {
  return prepare(sql).get(...params);
}

/**
 * 查询多行。
 * @returns {object[]}
 */
export function all(sql, ...params) {
  return prepare(sql).all(...params);
}

/**
 * 执行写操作（INSERT/UPDATE/DELETE），返回 { changes, lastInsertRowid }。
 */
export function run(sql, ...params) {
  return prepare(sql).run(...params);
}

/**
 * 事务包装：传入的回调在事务中执行，抛错自动回滚。
 * @param {Function} fn 事务体，无参数
 * @returns {any} 回调返回值
 */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

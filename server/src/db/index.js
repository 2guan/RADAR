/**
 * 文件：db/index.js
 * 用途：统一数据库访问入口。通过 DB_CLIENT 在 SQLite 与 TDSQL(MySQL 兼容版) 之间切换，
 *       对业务层暴露 get/all/run/exec/tx 等轻量 DAO 方法。
 * 作者：hengguan
 * 说明：业务模块只依赖本文件导出的统一接口，避免在路由和工具函数里判断底层数据库。
 *       新增数据库类型时优先扩展 provider 与 dialect，而不是改动业务 SQL 调用点。
 */

import { config } from '../config.js';
import { createSqliteProvider } from './providers/sqlite.js';
import { createTdsqlProvider } from './providers/tdsql.js';

function createProvider() {
  // 根据 .env 中的 DB_CLIENT 创建实际 provider；mysql 作为 tdsql 的兼容别名保留。
  switch (config.db.client) {
    case 'sqlite':
      return createSqliteProvider(config);
    case 'tdsql':
    case 'mysql':
      return createTdsqlProvider(config);
    default:
      throw new Error(`不支持的 DB_CLIENT：${config.db.client}`);
  }
}

const provider = createProvider();

// raw 仅提供给少数底层工具使用；常规业务代码应使用 get/all/run/exec/tx。
export const db = provider.raw;
export const dbClient = provider.client;
export const dialect = provider.dialect;

export function isSqlite() {
  // 便于迁移和少数兼容逻辑判断 SQLite 行为。
  return provider.client === 'sqlite';
}

export function isTdsql() {
  // TDSQL 使用 MySQL 兼容协议，provider.client 统一归一为 tdsql。
  return provider.client === 'tdsql';
}

export async function get(sql, ...params) {
  // 查询单行记录，provider 负责参数占位符、保留字和返回格式兼容。
  return provider.get(sql, params);
}

export async function all(sql, ...params) {
  // 查询多行记录，返回数组；SQLite 与 TDSQL 在这里保持同一调用形态。
  return provider.all(sql, params);
}

export async function run(sql, ...params) {
  // 执行写入语句，返回 changes/lastInsertRowid 等统一结果字段。
  return provider.run(sql, params);
}

export async function exec(sql) {
  // 执行批量 SQL，主要用于迁移、初始化和测试准备。
  return provider.exec(sql);
}

export async function tx(fn) {
  // 统一事务入口：SQLite 与 TDSQL 的 BEGIN/COMMIT/ROLLBACK 由 provider 处理。
  return provider.tx(fn);
}

export async function closeDb() {
  // 测试或进程退出时释放底层连接/连接池。
  return provider.close();
}

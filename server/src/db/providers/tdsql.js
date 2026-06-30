/**
 * 文件：db/providers/tdsql.js
 * 用途：TDSQL MySQL 兼容版数据库访问适配器。基于 mysql2/promise 连接池，
 *       对外提供与 SQLite provider 一致的 get/all/run/exec/tx/close 接口。
 * 作者：hengguan
 * 说明：业务代码大量复用 SQLite 时代的 SQL 写法，本适配器负责处理必要的
 *       MySQL 方言归一化、保留字表名引用、事务连接复用和返回值兼容。
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import mysql from 'mysql2/promise';
import { mysqlDialect } from '../dialects/mysql.js';

const txStore = new AsyncLocalStorage();

/** 将 .env/config 中的 TDSQL 配置转换为 mysql2 连接池参数。 */
function mysqlConfig(config) {
  const tdsql = config.db.tdsql;
  return {
    host: tdsql.host,
    port: tdsql.port,
    user: tdsql.user,
    password: tdsql.password,
    database: tdsql.database,
    waitForConnections: true,
    connectionLimit: tdsql.connectionLimit,
    charset: 'utf8mb4',
    timezone: tdsql.timezone,
    multipleStatements: true,
    namedPlaceholders: false,
    decimalNumbers: true,
    supportBigNumbers: true,
    bigNumberStrings: false,
    ssl: tdsql.ssl ? {} : undefined,
  };
}

/**
 * 在不触碰字符串字面量的前提下引用保留字标识符。
 * 例如 system/user/role 在 MySQL 语境中容易与关键字或系统对象冲突，
 * 这里统一转成反引号形式，同时避免把 SQL 字符串里的业务值误改。
 */
function quoteIdentifiersOutsideStrings(sql, identifiers) {
  const words = new Set(identifiers);
  let out = '';
  let token = '';
  let quote = null;

  const flushToken = () => {
    if (!token) return;
    out += words.has(token.toLowerCase()) ? `\`${token}\`` : token;
    token = '';
  };

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      out += ch;
      if (ch === '\\' && (quote === '"' || quote === "'")) {
        if (i + 1 < sql.length) out += sql[++i];
      } else if (ch === quote) {
        if ((quote === '"' || quote === "'") && sql[i + 1] === quote) {
          out += sql[++i];
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (ch === '`' || ch === '"' || ch === "'") {
      flushToken();
      quote = ch;
      out += ch;
      continue;
    }

    if (/[A-Za-z0-9_]/.test(ch)) {
      token += ch;
      continue;
    }

    flushToken();
    out += ch;
  }
  flushToken();
  return out;
}

/**
 * app_config.key 是历史 SQLite schema 中的列名，但 key 在 MySQL 中容易与
 * KEY 关键字冲突；这里只在 app_config 的列名语境下引用，不污染 PRIMARY KEY
 * 或 ON DUPLICATE KEY UPDATE 等 SQL 关键字。
 */
function quoteAppConfigKeyColumn(sql) {
  return sql
    .replace(/\bSELECT\s+key\s+FROM\s+app_config\b/gi, 'SELECT `key` FROM app_config')
    .replace(/\bSELECT\s+key\s*,\s*value\s*,\s*remark\s+FROM\s+app_config\b/gi, 'SELECT `key`, value, remark FROM app_config')
    .replace(/\bORDER\s+BY\s+key\b/gi, 'ORDER BY `key`')
    .replace(/\bWHERE\s+key\s*=/gi, 'WHERE `key` =')
    .replace(/\bINSERT\s+INTO\s+app_config\s*\(\s*key\s*,/gi, 'INSERT INTO app_config (`key`,')
    .replace(/\bON\s+CONFLICT\s*\(\s*key\s*\)/gi, 'ON CONFLICT (`key`)');
}

/**
 * 将项目中少量 SQLite 写法转换为 TDSQL/MySQL 兼容写法。
 * 这里保持“窄转换”原则：只转换项目已知 SQL 片段，避免通用正则误伤复杂 SQL。
 */
function normalizeSql(sql) {
  const normalized = quoteAppConfigKeyColumn(String(sql))
    .replace(/datetime\('now','localtime'\)/g, 'CURRENT_TIMESTAMP')
    .replace(/date\('now'\)/g, 'CURRENT_DATE')
    .replace(/\bINSERT\s+OR\s+IGNORE\b/gi, 'INSERT IGNORE')
    .replace(
      /ON\s+CONFLICT\s*\(\s*role_id\s*,\s*module_key\s*,\s*action_key\s*\)\s*DO\s+UPDATE\s+SET\s+allowed\s*=\s*1/gi,
      'ON DUPLICATE KEY UPDATE allowed = 1',
    )
    .replace(
      /ON\s+CONFLICT\s*\(\s*`?key`?\s*\)\s*DO\s+UPDATE\s+SET\s+value\s*=\s*excluded\.value\s*,\s*updated_at\s*=\s*CURRENT_TIMESTAMP/gi,
      'ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP',
    )
    .replace(
      /ON\s+CONFLICT\s*\(\s*`?key`?\s*\)\s*DO\s+UPDATE\s+SET\s+value\s*=\s*excluded\.value\s*,\s*remark\s*=\s*excluded\.remark\s*,\s*updated_at\s*=\s*CURRENT_TIMESTAMP/gi,
      'ON DUPLICATE KEY UPDATE value = VALUES(value), remark = VALUES(remark), updated_at = CURRENT_TIMESTAMP',
    );
  return quoteIdentifiersOutsideStrings(normalized, ['system', 'user', 'role']);
}

/** 当前执行上下文：事务内使用同一个连接，事务外使用连接池。 */
function current(pool) {
  return txStore.getStore() || pool;
}

export function createTdsqlProvider(config) {
  const pool = mysql.createPool(mysqlConfig(config));

  return {
    client: 'tdsql',
    dialect: mysqlDialect,
    raw: pool,
    async get(sql, params = []) {
      const [rows] = await current(pool).execute(normalizeSql(sql), params);
      return rows[0];
    },
    async all(sql, params = []) {
      const [rows] = await current(pool).execute(normalizeSql(sql), params);
      return rows;
    },
    async run(sql, params = []) {
      const [result] = await current(pool).execute(normalizeSql(sql), params);
      return {
        changes: result.affectedRows ?? 0,
        lastInsertRowid: result.insertId ?? 0,
        insertId: result.insertId ?? 0,
      };
    },
    async exec(sql) {
      return current(pool).query(normalizeSql(sql));
    },
    async tx(fn) {
      const existing = txStore.getStore();
      if (existing) return fn();
      // TDSQL/MySQL 的事务必须绑定单条连接；AsyncLocalStorage 让嵌套调用共享该连接。
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await txStore.run(conn, fn);
        await conn.commit();
        return result;
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

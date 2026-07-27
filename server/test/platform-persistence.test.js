/**
 * 文件：server/test/platform-persistence.test.js
 * 说明：覆盖 TDSQL/MySQL 方言转换，防止 SQLite 兼容 SQL 在启动时回归。
 * 用途：平台持久化适配器的无数据库单元测试。
 * 作者：hengguan
 * 运行：cd server && npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTdsqlSql } from '../src/platform/persistence/engine/providers/tdsql.js';

test('TDSQL 配置查询：引用 app_config 的 key 列，支持 IN 条件', () => {
  const sql = 'SELECT key, value FROM app_config WHERE key IN (?,?,?,?,?,?,?,?,?,?)';

  assert.equal(
    normalizeTdsqlSql(sql),
    'SELECT `key`, value FROM app_config WHERE `key` IN (?,?,?,?,?,?,?,?,?,?)',
  );
});

test('TDSQL 问题同步配置查询：转换实际的固定 IN 条件', () => {
  const sql = `SELECT key, value FROM app_config
    WHERE key IN ('issue.sync.baseUrl', 'issue.sync.apiKey', 'issue.sync.overviewApi', 'issue.sync.detailApi')`;

  assert.equal(
    normalizeTdsqlSql(sql),
    `SELECT \`key\`, value FROM app_config
    WHERE \`key\` IN ('issue.sync.baseUrl', 'issue.sync.apiKey', 'issue.sync.overviewApi', 'issue.sync.detailApi')`,
  );
});

test('TDSQL 配置查询：保留其他表的 key 文本不变', () => {
  assert.equal(
    normalizeTdsqlSql('SELECT key, value FROM external_config WHERE key IN (?,?)'),
    'SELECT key, value FROM external_config WHERE key IN (?,?)',
  );
});

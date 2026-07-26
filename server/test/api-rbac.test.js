/**
 * 文件：server/test/api-rbac.test.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：自动化回归测试。
 * 作者：hengguan
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

if (!process.env.RADAR_RUN_API_TESTS) {
  test('API/RBAC integration suite is opt-in outside CI', { skip: true }, () => {});
} else {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-api-test-'));
  process.env.DB_FILE = path.join(temporaryDirectory, 'radar.db');
  process.env.ADMIN_PASSWORD = 'Radar@Test2026!';
  process.env.NODE_ENV = 'test';

  const { runMigrations } = await import('../src/db/migrate.js');
  const { runSeed } = await import('../src/db/seed.js');
  const { buildApp } = await import('../src/app.js');
  const { run, closeDb } = await import('../src/db/index.js');
  await runMigrations();
  await runSeed();
  const app = await buildApp();

  after(async () => {
    await app.close();
    await closeDb();
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  test('API health endpoint uses the standard success envelope', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().code, 0);
    assert.equal(response.json().data.status, 'ok');
  });

  test('protected API rejects unauthenticated requests', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/requirements/list',
      payload: {},
      headers: { 'x-requested-by': 'RADAR' },
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().code, 401);
  });

  test('RBAC rejects an authenticated user without the required permission', async () => {
    const result = await run(
      "INSERT INTO user (phone, name, org, password_hash, status, is_super, password_changed_at) " +
      "VALUES (?,?,?,?,?,?,datetime('now','localtime'))",
      'rbac-test-user', 'RBAC 测试用户', '测试机构', 'not-used', '启用', 0,
    );
    const token = await app.jwt.sign({ id: result.lastInsertRowid, phone: 'rbac-test-user' });
    const response = await app.inject({
      method: 'POST',
      url: '/api/requirements/list',
      payload: {},
      headers: { authorization: 'Bearer ' + token, 'x-requested-by': 'RADAR' },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().code, 403);
  });
}

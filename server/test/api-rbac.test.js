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
  const staticDirectory = path.join(temporaryDirectory, 'web-dist');
  // CI 在前端构建之前执行 API 测试；创建最小静态产物，使首页回归不依赖仓库中的 dist。
  fs.mkdirSync(staticDirectory, { recursive: true });
  fs.writeFileSync(path.join(staticDirectory, 'index.html'), '<!doctype html><div id="root"></div>');
  process.env.DB_FILE = path.join(temporaryDirectory, 'radar.db');
  process.env.WEB_DIST = staticDirectory;
  process.env.ADMIN_PASSWORD = 'Radar@Test2026!';
  process.env.NODE_ENV = 'test';

  const { runMigrations } = await import('../src/db/migrate.js');
  const { runSeed } = await import('../src/db/seed.js');
  const { buildApp } = await import('../src/app.js');
  const { get, all, run, closeDb } = await import('../src/db/index.js');
  const { generateRequirementCode } = await import('../src/modules/requirements/index.js');
  await runMigrations();
  await runSeed();
  const app = await buildApp();

  // 关闭顺序与生产运行时一致：先停止 HTTP 与定时器，再释放 SQLite 文件句柄后清理夹具。
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

  test('生产静态首页可返回且使用 no-cache，避免 Fastify 静态回调导致服务退出', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<div id="root"><\/div>/);
    assert.equal(response.headers['cache-control'], 'no-cache');
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

  test('投产申请写入索引关联表，投产审批列表可按关联编号读取', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    assert.ok(administrator);
    assert.ok(releasePoint);
    const code = 'PERF-REF-001';
    await run(
      `INSERT INTO requirement (req_code, title, status, release_point_id)
       VALUES (?,?,?,?)`,
      code, '索引关联回归需求', '待分析', releasePoint.id,
    );
    const token = await app.jwt.sign({ id: administrator.id, phone: administrator.phone });
    const headers = { authorization: `Bearer ${token}`, 'x-requested-by': 'RADAR' };
    const created = await app.inject({
      method: 'POST', url: '/api/release-apply', headers,
      payload: {
        change_content: '索引关联回归变更', change_system: 'PERF-SYSTEM', release_point_id: releasePoint.id,
        ref_codes: [code], delivery_units: [{ artifact_type: '程序包', delivery_unit: 'perf.tar.gz', new_version: '1.0.0' }],
      },
    });
    assert.equal(created.statusCode, 200);
    const applyId = created.json().data.id;
    const reference = await get('SELECT ref_code, release_point_id FROM release_apply_reference WHERE release_apply_id = ?', applyId);
    assert.equal(reference.ref_code, code);
    assert.equal(reference.release_point_id, releasePoint.id);

    const updatedCode = 'PERF-REF-002';
    await run(
      `INSERT INTO requirement (req_code, title, status, release_point_id)
       VALUES (?,?,?,?)`,
      updatedCode, '索引关联更新回归需求', '待分析', releasePoint.id,
    );
    const updated = await app.inject({
      method: 'PUT', url: `/api/release-apply/${applyId}`, headers, payload: { ref_codes: [updatedCode] },
    });
    assert.equal(updated.statusCode, 200);
    const updatedReferences = await all('SELECT ref_code FROM release_apply_reference WHERE release_apply_id = ?', applyId);
    assert.equal(updatedReferences.length, 1);
    assert.equal(updatedReferences[0].ref_code, updatedCode);

    const list = await app.inject({ method: 'POST', url: '/api/release/list', headers, payload: { page: 1, pageSize: 20 } });
    assert.equal(list.statusCode, 200);
    assert.ok(list.json().data.list.some((row) => row.code === updatedCode));

    const metrics = await app.inject({ method: 'GET', url: '/api/dashboard/metrics', headers });
    assert.equal(metrics.statusCode, 200);
    assert.ok(metrics.json().data.requirement.total >= 2);

    const overview = await app.inject({
      method: 'POST', url: '/api/overview/list', headers, payload: { page: 1, pageSize: 20 },
    });
    assert.equal(overview.statusCode, 200);
    assert.equal(overview.json().data.page, 1);
    assert.ok(overview.json().data.total >= overview.json().data.list.length);
  });

  test('业务编号序列：首次从历史最大值接续，后续调用原子递增', async () => {
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    const releaseWindow = '20990101';
    await run(
      `INSERT INTO requirement (req_code, title, status, release_point_id)
       VALUES (?,?,?,?)`,
      `RC_${releaseWindow}_007`, '编号序列历史记录', '待分析', releasePoint.id,
    );

    const [first, second] = await Promise.all([
      generateRequirementCode(releaseWindow),
      generateRequirementCode(releaseWindow),
    ]);
    assert.deepEqual(new Set([first, second]), new Set([
      `RC_${releaseWindow}_008`,
      `RC_${releaseWindow}_009`,
    ]));
    const sequence = await get(
      'SELECT next_value FROM code_sequence WHERE rule_key = ? AND prefix = ?',
      'code.requirement', `RC_${releaseWindow}_`,
    );
    assert.equal(sequence.next_value, 10);
  });
}

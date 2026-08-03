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
  process.env.ATTACHMENT_DIR = path.join(temporaryDirectory, 'attachments');
  process.env.WEB_DIST = staticDirectory;
  process.env.ADMIN_PASSWORD = 'Radar@Test2026!';
  process.env.NODE_ENV = 'test';
  process.env.KKFILEVIEW_ALLOWED_ORIGINS = 'http://127.0.0.1:8012';
  process.env.ATTACHMENT_PREVIEW_SOURCE_BASE_URL = 'http://127.0.0.1:3100';

  const { runMigrations } = await import('../src/platform/persistence/migrate.js');
  const { runSeed } = await import('../src/bootstrap/seed.js');
  const { buildApp } = await import('../src/app.js');
  const { get, all, run, closeDb } = await import('../src/platform/persistence/engine/index.js');
  const { claimRequirementCode, generateRequirementCode, previewRequirementCode } = await import('../src/modules/requirements/index.js');
  const { appliedReleasePointsForWorkItems, workItemCodesForAppliedReleasePoints } = await import('../src/modules/release/index.js');
  const { applyBuiltinConfigurationUpgrades, BUILTIN_CONFIGURATION_UPGRADE_ID } = await import('../src/modules/settings/process-configuration/index.js');
  const { STAGE_BUILTIN_FIELD_METADATA, STAGE_BUILTIN_SECTION_DEFAULTS } = await import('../src/bootstrap/seed.js');
  const { LOCAL_STAGE_CONTENT_SEED } = await import('../src/modules/settings/process-configuration/application/local-stage-content-seed.js');
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

  test('概览详情兼容历史提交人对象，且跳过没有姓名的无效对象', async () => {
    const administrator = await get('SELECT id, phone, name, org FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const reqCode = 'OVERVIEW-PERSON-OBJECT-001';
    await run(
      'INSERT INTO requirement (req_code, title, status, proposer) VALUES (?,?,?,?)',
      reqCode,
      '概览历史人员对象回归',
      '需求登记',
      JSON.stringify(['历史姓名提交人', { name: administrator.name, org: '历史机构', phone: '13800000000' }, { org: '没有姓名的历史对象' }]),
    );

    const response = await app.inject({ method: 'GET', url: `/api/overview/${reqCode}/detail`, headers });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.requirement.proposerInfo, [
      { name: '历史姓名提交人', org: null, phone: null },
      { name: administrator.name, org: administrator.org, phone: administrator.phone },
    ]);
  });

  test('申请投产点公共契约支持多点命中，并将未申请工作项归入待定', async () => {
    const first = await run("INSERT INTO release_point (release_date, version_type) VALUES (?,?)", '20990115', '常规版本');
    const second = await run("INSERT INTO release_point (release_date, version_type) VALUES (?,?)", '20990130', '常规版本');
    const points = [
      { id: Number(first.lastInsertRowid), release_date: '20990115' },
      { id: Number(second.lastInsertRowid), release_date: '20990130' },
    ];
    const pending = await get("SELECT id, release_date FROM release_point WHERE release_date = '投产点待定' ORDER BY id LIMIT 1");
    assert.ok(pending);
    const appliedCode = 'APPLY-POINT-MULTI-001';
    const pendingCode = 'APPLY-POINT-PENDING-001';
    await run('INSERT INTO requirement (req_code, title, status) VALUES (?,?,?)', appliedCode, '多申请投产点回归', '需求登记');
    await run('INSERT INTO requirement (req_code, title, status) VALUES (?,?,?)', pendingCode, '待定投产点回归', '需求登记');
    for (const [index, point] of points.entries()) {
      const apply = await run('INSERT INTO release_apply (change_code, change_content, release_point_id) VALUES (?,?,?)', `APPLY-POINT-MULTI-${index + 1}`, '申请投产点多值回归', point.id);
      await run('INSERT INTO release_apply_reference (release_apply_id, ref_code, release_point_id) VALUES (?,?,?)', apply.lastInsertRowid, appliedCode, point.id);
    }
    const pointMap = await appliedReleasePointsForWorkItems([appliedCode, pendingCode]);
    assert.deepEqual(pointMap[appliedCode].map((point) => point.id), points.map((point) => Number(point.id)));
    assert.deepEqual(pointMap[pendingCode], [{ id: Number(pending.id), release_date: pending.release_date }]);
    assert.deepEqual(await workItemCodesForAppliedReleasePoints([appliedCode, pendingCode], [points[0].id]), [appliedCode]);
    assert.deepEqual(await workItemCodesForAppliedReleasePoints([appliedCode, pendingCode], [pending.id]), [pendingCode]);

    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const overview = await app.inject({
      method: 'POST', url: '/api/overview/list', headers,
      payload: { pageSize: 100, filters: [{ field: 'release_point_id', op: 'in', value: [points[0].id] }] },
    });
    assert.equal(overview.statusCode, 200, overview.body);
    assert.ok(overview.json().data.list.flatMap((group) => group.cards).some((card) => card.code === appliedCode));
  });

  test('投产申请新增默认实施机构取唯一开发实施方，并安全处理无匹配和冲突', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const workItemCode = 'RELEASE-APPLY-IMPL-ORG-001';
    await run('INSERT INTO requirement (req_code, title, status) VALUES (?,?,?)', workItemCode, '投产申请实施机构默认值回归', '需求登记');
    await run(
      'INSERT INTO dev_task (req_code, task_code, status, impl_system, impl_org) VALUES (?,?,?,?,?)',
      workItemCode, 'DEV-RELEASE-APPLY-IMPL-ORG-001', '开发承接', 'IMPL-ORG-SYS', '示例开发机构',
    );

    const unauthorized = await app.inject({
      method: 'POST', url: '/api/release-apply/implementation-org-default',
      payload: { refCodes: [workItemCode], systemCode: 'IMPL-ORG-SYS' },
    });
    assert.equal(unauthorized.statusCode, 401);

    const resolved = await app.inject({
      method: 'POST', url: '/api/release-apply/implementation-org-default', headers,
      payload: { refCodes: [workItemCode], systemCode: 'IMPL-ORG-SYS' },
    });
    assert.equal(resolved.statusCode, 200, resolved.body);
    assert.deepEqual(resolved.json().data, { implOrg: '示例开发机构', reason: 'resolved' });

    const unmatched = await app.inject({
      method: 'POST', url: '/api/release-apply/implementation-org-default', headers,
      payload: { refCodes: [workItemCode], systemCode: 'NO-DEV-TASK-SYS' },
    });
    assert.deepEqual(unmatched.json().data, { implOrg: null, reason: 'no_match' });

    await run(
      'INSERT INTO dev_task (req_code, task_code, status, impl_system, impl_org) VALUES (?,?,?,?,?)',
      workItemCode, 'DEV-RELEASE-APPLY-IMPL-ORG-002', '开发承接', 'IMPL-ORG-SYS', '另一示例开发机构',
    );
    const conflict = await app.inject({
      method: 'POST', url: '/api/release-apply/implementation-org-default', headers,
      payload: { refCodes: [workItemCode], systemCode: 'IMPL-ORG-SYS' },
    });
    assert.deepEqual(conflict.json().data, { implOrg: null, reason: 'conflict' });
  });

  test('生产静态首页可返回且使用 no-cache，避免 Fastify 静态回调导致服务退出', async () => {
    const response = await app.inject({ method: 'GET', url: '/' });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /<div id="root"><\/div>/);
    assert.equal(response.headers['cache-control'], 'no-cache');
  });

  test('重点列表的展示别名与投产审批聚合字段均可按稳定键排序', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const point = await run('INSERT INTO release_point (release_date, version_type) VALUES (?,?)', '20991231', '常规版本');
    const releasePointId = Number(point.lastInsertRowid);
    const rows = [
      { code: 'LIST-SORT-REQ-A', org: '乙机构', change: 'CHG-SORT-B', status: '待投产', review: '待评审', signed: '未签署' },
      { code: 'LIST-SORT-REQ-B', org: '甲机构', change: 'CHG-SORT-A', status: '投产完成', review: '评审同意', signed: '已签署' },
    ];
    for (const row of rows) {
      await run('INSERT INTO requirement (req_code, title, status) VALUES (?,?,?)', row.code, `${row.code} 标题`, '需求分析完成');
      const apply = await run(
        'INSERT INTO release_apply (change_code, change_content, impl_org, release_point_id, ref_codes, review_status) VALUES (?,?,?,?,?,?)',
        row.change, '列表排序回归', row.org, releasePointId, JSON.stringify([row.code]), row.review,
      );
      await run('INSERT INTO release_apply_reference (release_apply_id, ref_code, release_point_id) VALUES (?,?,?)', apply.lastInsertRowid, row.code, releasePointId);
      const task = await run(
        'INSERT INTO release_task (req_code, release_point_id, entity_type, status, review_status) VALUES (?,?,?,?,?)',
        row.code, releasePointId, 'requirement', row.status, row.review,
      );
      await run('INSERT INTO release_signoff (release_task_id, role_name, result) VALUES (?,?,?)', task.lastInsertRowid, '列表排序角色', row.signed);
    }

    const releaseByOrg = await app.inject({
      method: 'POST', url: '/api/release/list', headers,
      payload: { releasePointIds: [releasePointId], pageSize: 100, sort: [{ field: 'impl_org', order: 'asc' }] },
    });
    assert.equal(releaseByOrg.statusCode, 200, releaseByOrg.body);
    assert.deepEqual(releaseByOrg.json().data.list.map((row) => row.code), ['LIST-SORT-REQ-B', 'LIST-SORT-REQ-A']);

    const releaseBySignoff = await app.inject({
      method: 'POST', url: '/api/release/list', headers,
      payload: { releasePointIds: [releasePointId], pageSize: 100, sort: [{ field: 'signoff', order: 'desc' }] },
    });
    assert.equal(releaseBySignoff.statusCode, 200, releaseBySignoff.body);
    assert.equal(releaseBySignoff.json().data.list[0].code, 'LIST-SORT-REQ-B');

    const applyByReview = await app.inject({
      method: 'POST', url: '/api/release-apply/list', headers,
      payload: { releasePointIds: [releasePointId], pageSize: 100, sort: [{ field: 'review_status', order: 'desc' }] },
    });
    assert.equal(applyByReview.statusCode, 200, applyByReview.body);
    assert.deepEqual(applyByReview.json().data.list.map((row) => row.change_code), ['CHG-SORT-A', 'CHG-SORT-B']);
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

  test('用户列表偏好按认证用户隔离、校验字段并记录审计', async () => {
    const administrator = await get('SELECT id, phone, name FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const payload = {
      visibleKeys: ['task_status', 'status', 'req_code', 'title'],
      orderedKeys: ['task_status', 'status', 'req_code', 'title'],
      widthByKey: { task_status: 120, title: 280 },
    };
    const saved = await app.inject({ method: 'PUT', url: '/api/user-list-preferences/requirements.analysis', headers, payload });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.deepEqual(saved.json().data, payload);
    const loaded = await app.inject({ method: 'GET', url: '/api/user-list-preferences/requirements.analysis', headers });
    assert.deepEqual(loaded.json().data, payload);
    assert.ok(await get("SELECT id FROM audit_log WHERE entity_type = 'user_list_preference' AND entity_code = 'requirements.analysis' AND action = 'create'"));

    const other = await run("INSERT INTO user (phone, name, org, password_hash, status, password_changed_at) VALUES (?,?,?,?,?,datetime('now','localtime'))", 'preference-other-user', '偏好隔离用户', '测试机构', 'not-used', '启用');
    const otherHeaders = { authorization: `Bearer ${await app.jwt.sign({ id: other.lastInsertRowid, phone: 'preference-other-user' })}`, 'x-requested-by': 'RADAR' };
    const otherLoaded = await app.inject({ method: 'GET', url: '/api/user-list-preferences/requirements.analysis', headers: otherHeaders });
    assert.equal(otherLoaded.statusCode, 200);
    assert.equal(otherLoaded.json().data, null);

    const invalid = await app.inject({ method: 'PUT', url: '/api/user-list-preferences/requirements.analysis', headers, payload: { ...payload, visibleKeys: ['op'], orderedKeys: ['op'] } });
    assert.equal(invalid.statusCode, 400);
    assert.deepEqual((await app.inject({ method: 'GET', url: '/api/user-list-preferences/requirements.analysis', headers })).json().data, payload);

    const deleted = await app.inject({ method: 'DELETE', url: '/api/user-list-preferences/requirements.analysis', headers });
    assert.equal(deleted.statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/user-list-preferences/requirements.analysis', headers })).json().data, null);
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

  test('流程输入项状态规则是需求和工单详情保存的唯一必填事实源', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    const cases = [
      { scopeKey: 'requirement', table: 'requirement', codeKey: 'req_code', code: 'REQUIRED-RULE-REQ-001', status: '需求登记', title: '需求规则唯一事实源' },
      { scopeKey: 'ticket', table: 'ticket', codeKey: 'ticket_code', code: 'REQUIRED-RULE-TICKET-001', status: '工单登记', title: '工单规则唯一事实源' },
    ];

    for (const item of cases) {
      const schemaResponse = await app.inject({ method: 'GET', url: `/api/settings/stage-content/${item.scopeKey}`, headers });
      assert.equal(schemaResponse.statusCode, 200);
      const schema = schemaResponse.json().data;
      const initialStatus = schema.statuses.find((status) => status.value === item.status);
      const implementationOrg = schema.fields.find((field) => field.field_key === 'implementation_org');
      const mainSystems = schema.fields.find((field) => field.field_key === 'main_systems');
      assert.ok(initialStatus && implementationOrg && mainSystems);
      const originalRules = await all(`SELECT field_definition_id, required FROM stage_field_status_rule
        WHERE status_dict_item_id = ? AND field_definition_id IN (?, ?)`, initialStatus.id, implementationOrg.id, mainSystems.id);
      try {
        await run('UPDATE stage_field_status_rule SET required = 1 WHERE field_definition_id = ? AND status_dict_item_id = ?', implementationOrg.id, initialStatus.id);
        await run('UPDATE stage_field_status_rule SET required = 0 WHERE field_definition_id = ? AND status_dict_item_id = ?', mainSystems.id, initialStatus.id);
        const typeKey = item.scopeKey === 'requirement' ? 'req_type' : 'ticket_type';
        const inserted = await run(`INSERT INTO ${item.table} (${item.codeKey}, title, summary, status, ${typeKey}, is_accounting, propose_dept, proposer, propose_time, expected_release_date, main_systems)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        item.code, item.title, '用于验证系统设置必填规则', item.status, '业务需求', '否', '计划财务板块', JSON.stringify(['测试用户']), '2026-07-31', '2026-08-15', JSON.stringify([]));

        const missingImplementationOrg = await app.inject({
          method: 'PUT', url: `/api/${item.scopeKey === 'requirement' ? 'requirements' : 'tickets'}/${inserted.lastInsertRowid}`,
          headers, payload: { title: `${item.title}-缺失实施机构` },
        });
        assert.equal(missingImplementationOrg.statusCode, 400);
        assert.match(missingImplementationOrg.json().message, /实施机构/);

        const optionalMainSystems = await app.inject({
          method: 'PUT', url: `/api/${item.scopeKey === 'requirement' ? 'requirements' : 'tickets'}/${inserted.lastInsertRowid}`,
          headers, payload: { implementation_org: '测试机构', main_systems: [] },
        });
        assert.equal(optionalMainSystems.statusCode, 200);
      } finally {
        for (const rule of originalRules) {
          await run('UPDATE stage_field_status_rule SET required = ? WHERE field_definition_id = ? AND status_dict_item_id = ?', rule.required, rule.field_definition_id, initialStatus.id);
        }
      }
    }
  });

  test('角色全机构权限默认值可由人员单独覆盖，且认证上下文返回最终值', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const adminHeaders = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const role = await get("SELECT id FROM role WHERE code = '金科开发'");
    assert.ok(role);
    assert.equal(Number((await get('SELECT all_org_access FROM role WHERE id = ?', role.id)).all_org_access), 0);
    const user = await run(
      "INSERT INTO user (phone, name, org, password_hash, status, password_changed_at) VALUES (?,?,?,?,?,datetime('now','localtime'))",
      'org-scope-role-test', '角色默认测试', '测试机构', 'not-used', '启用',
    );
    await run('INSERT INTO user_role (user_id, role_id) VALUES (?,?)', user.lastInsertRowid, role.id);
    const token = await app.jwt.sign({ id: user.lastInsertRowid, phone: 'org-scope-role-test' });
    const inherited = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token}`, 'x-requested-by': 'RADAR' } });
    assert.equal(inherited.statusCode, 200);
    assert.equal(inherited.json().data.allOrgAccess, false);
    assert.equal(inherited.json().data.allOrgAccessSource, 'role');

    const override = await app.inject({
      method: 'PUT', url: `/api/users/${user.lastInsertRowid}`, headers: adminHeaders,
      payload: { all_org_access_override: '是' },
    });
    assert.equal(override.statusCode, 200);
    const overridden = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token}`, 'x-requested-by': 'RADAR' } });
    assert.equal(overridden.json().data.allOrgAccess, true);
    assert.equal(overridden.json().data.allOrgAccessSource, 'person');
  });

  test('受限角色按主责/协同改造系统或手填实施机构收窄需求，且详情不可绕过', async () => {
    const role = await get("SELECT id FROM role WHERE code = '金科开发'");
    await run('INSERT INTO system (sys_code, sys_name, org) VALUES (?,?,?)', 'ORG-SCOPE-A', '机构A系统', '机构A');
    await run('INSERT INTO system (sys_code, sys_name, org) VALUES (?,?,?)', 'ORG-SCOPE-B', '机构B系统', '机构B');
    const visibleBySystem = await run(
      'INSERT INTO requirement (req_code, title, status, main_systems, collab_dev_systems) VALUES (?,?,?,?,?)',
      'ORG-SCOPE-REQ-A', '主责系统命中', '需求登记', JSON.stringify(['ORG-SCOPE-A']), JSON.stringify([]),
    );
    await run(
      'INSERT INTO requirement (req_code, title, status, main_systems, collab_dev_systems, implementation_org) VALUES (?,?,?,?,?,?)',
      'ORG-SCOPE-REQ-MANUAL', '手填机构命中', '需求登记', JSON.stringify(['ORG-SCOPE-B']), JSON.stringify([]), '机构A',
    );
    const hidden = await run(
      'INSERT INTO requirement (req_code, title, status, main_systems, collab_dev_systems) VALUES (?,?,?,?,?)',
      'ORG-SCOPE-REQ-B', '外机构系统', '需求登记', JSON.stringify(['ORG-SCOPE-B']), JSON.stringify([]),
    );
    const user = await run(
      "INSERT INTO user (phone, name, org, password_hash, status, password_changed_at) VALUES (?,?,?,?,?,datetime('now','localtime'))",
      'org-scope-data-test', '机构范围测试', '机构A', 'not-used', '启用',
    );
    await run('INSERT INTO user_role (user_id, role_id) VALUES (?,?)', user.lastInsertRowid, role.id);
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: user.lastInsertRowid, phone: 'org-scope-data-test' })}`, 'x-requested-by': 'RADAR' };

    const list = await app.inject({ method: 'POST', url: '/api/requirements/list', headers, payload: { pageSize: 100 } });
    assert.equal(list.statusCode, 200);
    const codes = list.json().data.list.map((row) => row.req_code);
    assert.ok(codes.includes('ORG-SCOPE-REQ-A'));
    assert.ok(codes.includes('ORG-SCOPE-REQ-MANUAL'));
    assert.ok(!codes.includes('ORG-SCOPE-REQ-B'));

    const matchedDetail = await app.inject({ method: 'GET', url: `/api/requirements/${visibleBySystem.lastInsertRowid}`, headers });
    const hiddenDetail = await app.inject({ method: 'GET', url: `/api/requirements/${hidden.lastInsertRowid}`, headers });
    assert.equal(matchedDetail.statusCode, 200);
    assert.equal(hiddenDetail.statusCode, 403);

    await run('INSERT INTO system (sys_code, sys_name, org) VALUES (?,?,?)', 'ORG-SCOPE-XM', '厦门机构系统', '厦门事业群');
    await run(
      'INSERT INTO requirement (req_code, title, status, main_systems, collab_dev_systems) VALUES (?,?,?,?,?)',
      'ORG-SCOPE-REQ-XM', '属性值显示值兼容', '需求登记', JSON.stringify(['ORG-SCOPE-XM']), JSON.stringify([]),
    );
    const mappedUser = await run(
      "INSERT INTO user (phone, name, org, password_hash, status, password_changed_at) VALUES (?,?,?,?,?,datetime('now','localtime'))",
      'org-scope-xiamen-test', '厦门显示值用户', '厦门', 'not-used', '启用',
    );
    await run('INSERT INTO user_role (user_id, role_id) VALUES (?,?)', mappedUser.lastInsertRowid, role.id);
    const mappedHeaders = { authorization: `Bearer ${await app.jwt.sign({ id: mappedUser.lastInsertRowid, phone: 'org-scope-xiamen-test' })}`, 'x-requested-by': 'RADAR' };
    const mappedList = await app.inject({ method: 'POST', url: '/api/requirements/list', headers: mappedHeaders, payload: { pageSize: 100 } });
    assert.equal(mappedList.statusCode, 200);
    assert.ok(mappedList.json().data.list.some((row) => row.req_code === 'ORG-SCOPE-REQ-XM'));
    const mappedMe = await app.inject({ method: 'GET', url: '/api/auth/me', headers: mappedHeaders });
    assert.deepEqual(mappedMe.json().data.organizationValues.sort(), ['厦门', '厦门事业群'].sort());

    await run('INSERT INTO system (sys_code, sys_name, org) VALUES (?,?,?)', 'ORG-SCOPE-XM-EXTERNAL', '未同步归属系统', '成都事业群');
    await run(
      'INSERT INTO requirement (req_code, title, status, main_systems, collab_dev_systems, implementation_org) VALUES (?,?,?,?,?,?)',
      'ORG-SCOPE-REQ-XM-MANUAL', '手工实施机构承接', '需求登记', JSON.stringify(['ORG-SCOPE-XM-EXTERNAL']), JSON.stringify([]), '厦门事业群',
    );
    const preview = await app.inject({ method: 'POST', url: '/api/dev-tasks/intake-preview', headers: mappedHeaders, payload: { reqCode: 'ORG-SCOPE-REQ-XM-MANUAL' } });
    assert.equal(preview.statusCode, 200);
    assert.ok(preview.json().data.some((item) => item.sysCode === 'ORG-SCOPE-XM-EXTERNAL'));
    assert.equal(preview.json().data.find((item) => item.sysCode === 'ORG-SCOPE-XM-EXTERNAL').defaultImplOrg, '成都事业群');
    const intake = await app.inject({ method: 'POST', url: '/api/dev-tasks/intake', headers: mappedHeaders, payload: {
      reqCode: 'ORG-SCOPE-REQ-XM-MANUAL',
      systemRoles: [{ sysCode: 'ORG-SCOPE-XM-EXTERNAL', role: '主责' }],
      assignments: [{ sysCode: 'ORG-SCOPE-XM-EXTERNAL', owner: '厦门显示值用户', implOrg: '厦门事业群' }],
    } });
    assert.equal(intake.statusCode, 200);
    const acceptedTask = await get('SELECT owner, intake_owner, impl_org FROM dev_task WHERE req_code = ?', 'ORG-SCOPE-REQ-XM-MANUAL');
    assert.equal(acceptedTask.owner, '厦门显示值用户');
    assert.equal(acceptedTask.intake_owner, '厦门显示值用户');
    assert.equal(acceptedTask.impl_org, '厦门事业群');
    const completedCandidates = await app.inject({ method: 'POST', url: '/api/dev-tasks/intake-pending-codes', headers: mappedHeaders, payload: { reqCodes: ['ORG-SCOPE-REQ-XM-MANUAL'] } });
    assert.deepEqual(completedCandidates.json().data, []);
    await run('DELETE FROM dev_task WHERE req_code = ?', 'ORG-SCOPE-REQ-XM-MANUAL');
    const restoredCandidates = await app.inject({ method: 'POST', url: '/api/dev-tasks/intake-pending-codes', headers: mappedHeaders, payload: { reqCodes: ['ORG-SCOPE-REQ-XM-MANUAL'] } });
    assert.deepEqual(restoredCandidates.json().data, ['ORG-SCOPE-REQ-XM-MANUAL']);

    const administrator = await get('SELECT id, phone, name FROM user WHERE is_super = 1 LIMIT 1');
    const adminHeaders = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    await run('INSERT INTO system (sys_code, sys_name, org) VALUES (?,?,?)', 'INTAKE-TEST-SYS', '承接测试系统', '厦门事业群');
    await run(
      'INSERT INTO requirement (req_code, title, status, main_systems, collab_test_systems) VALUES (?,?,?,?,?)',
      'INTAKE-TEST-REQ', '测试负责人承接', '需求登记', JSON.stringify(['INTAKE-TEST-SYS']), JSON.stringify([]),
    );
    const pendingTest = await app.inject({ method: 'POST', url: '/api/test-tasks/intake-pending-codes', headers: adminHeaders, payload: { testType: 'SIT', reqCodes: ['INTAKE-TEST-REQ'] } });
    assert.deepEqual(pendingTest.json().data, ['INTAKE-TEST-REQ']);
    const testPreview = await app.inject({ method: 'POST', url: '/api/test-tasks/intake-preview', headers: adminHeaders, payload: { reqCode: 'INTAKE-TEST-REQ', testType: 'SIT' } });
    assert.equal(testPreview.statusCode, 200);
    assert.equal(testPreview.json().data.overall[0].defaultImplOrg, '厦门事业群');
    assert.equal(testPreview.json().data.split[0].defaultImplOrg, '厦门事业群');
    const acceptedTest = await app.inject({ method: 'POST', url: '/api/test-tasks/intake', headers: adminHeaders, payload: {
      reqCode: 'INTAKE-TEST-REQ', testType: 'SIT', splitMode: 'split', assignments: [{ sysCode: 'INTAKE-TEST-SYS', owner: administrator.name, implOrg: '厦门事业群' }],
    } });
    assert.equal(acceptedTest.statusCode, 200);
    const acceptedTestTask = await get('SELECT owner, intake_owner, impl_org FROM test_task WHERE req_code = ?', 'INTAKE-TEST-REQ');
    assert.equal(acceptedTestTask.owner, administrator.name);
    assert.equal(acceptedTestTask.intake_owner, administrator.name);
    assert.equal(acceptedTestTask.impl_org, '厦门事业群');
    const completedTestCandidates = await app.inject({ method: 'POST', url: '/api/test-tasks/intake-pending-codes', headers: adminHeaders, payload: { testType: 'SIT', reqCodes: ['INTAKE-TEST-REQ'] } });
    assert.deepEqual(completedTestCandidates.json().data, []);
    await run('DELETE FROM test_task WHERE req_code = ?', 'INTAKE-TEST-REQ');
    const restoredTestCandidates = await app.inject({ method: 'POST', url: '/api/test-tasks/intake-pending-codes', headers: adminHeaders, payload: { testType: 'SIT', reqCodes: ['INTAKE-TEST-REQ'] } });
    assert.deepEqual(restoredTestCandidates.json().data, ['INTAKE-TEST-REQ']);
  });

  test('开发承接临时实施方统一预填规则可配置、可停用且拒绝非法名单', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const configKey = 'development.intake.implementation_org_override_orgs';
    const originalConfig = await get('SELECT value FROM app_config WHERE key = ?', configKey);
    await run('INSERT INTO system (sys_code, sys_name, org) VALUES (?,?,?)', 'INTAKE-OVERRIDE-SYS-A', '统一预填系统A', '厦门事业群');
    await run('INSERT INTO system (sys_code, sys_name, org) VALUES (?,?,?)', 'INTAKE-OVERRIDE-SYS-B', '统一预填系统B', '武汉事业群');
    await run(
      'INSERT INTO requirement (req_code, title, status, implementation_org, main_systems, collab_dev_systems) VALUES (?,?,?,?,?,?)',
      'INTAKE-OVERRIDE-REQ', '开发实施方统一预填', '需求登记', '开发一部', JSON.stringify(['INTAKE-OVERRIDE-SYS-A']), JSON.stringify(['INTAKE-OVERRIDE-SYS-B']),
    );

    try {
      const initialPreview = await app.inject({ method: 'POST', url: '/api/dev-tasks/intake-preview', headers, payload: { reqCode: 'INTAKE-OVERRIDE-REQ' } });
      assert.equal(initialPreview.statusCode, 200);
      assert.deepEqual(initialPreview.json().data.map((item) => item.defaultImplOrg), ['开发一部', '开发一部']);

      const disabled = await app.inject({
        method: 'PUT', url: '/api/settings/app-config', headers,
        payload: { items: { [configKey]: '[]' } },
      });
      assert.equal(disabled.statusCode, 200);
      const disabledPreview = await app.inject({ method: 'POST', url: '/api/dev-tasks/intake-preview', headers, payload: { reqCode: 'INTAKE-OVERRIDE-REQ' } });
      assert.equal(disabledPreview.statusCode, 200);
      assert.deepEqual(disabledPreview.json().data.map((item) => item.defaultImplOrg), ['厦门事业群', '武汉事业群']);

      const invalidJson = await app.inject({
        method: 'PUT', url: '/api/settings/app-config', headers,
        payload: { items: { [configKey]: '{"开发一部":true}' } },
      });
      assert.equal(invalidJson.statusCode, 400);
      assert.match(invalidJson.json().message, /JSON 数组/);

      const unknownOrg = await app.inject({
        method: 'PUT', url: '/api/settings/app-config', headers,
        payload: { items: { [configKey]: '["不存在的机构"]' } },
      });
      assert.equal(unknownOrg.statusCode, 400);
      assert.match(unknownOrg.json().message, /不存在/);

      const tooManyOrgs = await app.inject({
        method: 'PUT', url: '/api/settings/app-config', headers,
        payload: { items: { [configKey]: JSON.stringify(Array.from({ length: 21 }, () => '开发一部')) } },
      });
      assert.equal(tooManyOrgs.statusCode, 400);
      assert.match(tooManyOrgs.json().message, /最多 20 项/);

      const readonlyUser = await run(
        "INSERT INTO user (phone, name, org, password_hash, status, password_changed_at) VALUES (?,?,?,?,?,datetime('now','localtime'))",
        'intake-override-readonly', '临时规则只读用户', '开发一部', 'not-used', '启用',
      );
      const readonlyHeaders = {
        authorization: `Bearer ${await app.jwt.sign({ id: readonlyUser.lastInsertRowid, phone: 'intake-override-readonly' })}`,
        'x-requested-by': 'RADAR',
      };
      const forbiddenSave = await app.inject({
        method: 'PUT', url: '/api/settings/app-config', headers: readonlyHeaders,
        payload: { items: { [configKey]: '["开发一部"]' } },
      });
      assert.equal(forbiddenSave.statusCode, 403);
    } finally {
      if (originalConfig) {
        await run('UPDATE app_config SET value = ? WHERE key = ?', originalConfig.value, configKey);
      } else {
        await run('DELETE FROM app_config WHERE key = ?', configKey);
      }
    }
  });

  test('开发承接确认角色回写需求/工单，且角色和实施方错误整体回滚', async () => {
    const administrator = await get('SELECT id, phone, name FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    await run('INSERT INTO system (sys_code, sys_name, org) VALUES (?,?,?)', 'INTAKE-ROLE-SYS-A', '角色确认系统A', '厦门事业群');
    await run('INSERT INTO system (sys_code, sys_name, org) VALUES (?,?,?)', 'INTAKE-ROLE-SYS-B', '角色确认系统B', '武汉事业群');
    await run(
      'INSERT INTO requirement (req_code, title, status, main_systems, collab_dev_systems) VALUES (?,?,?,?,?)',
      'INTAKE-ROLE-REQ', '需求角色回写', '需求登记', JSON.stringify(['INTAKE-ROLE-SYS-A']), JSON.stringify(['INTAKE-ROLE-SYS-B']),
    );
    const requirementIntake = await app.inject({ method: 'POST', url: '/api/dev-tasks/intake', headers, payload: {
      reqCode: 'INTAKE-ROLE-REQ',
      systemRoles: [
        { sysCode: 'INTAKE-ROLE-SYS-A', role: '协同' },
        { sysCode: 'INTAKE-ROLE-SYS-B', role: '主责' },
      ],
      assignments: [
        { sysCode: 'INTAKE-ROLE-SYS-A', owner: administrator.name, implOrg: '厦门事业群' },
        { sysCode: 'INTAKE-ROLE-SYS-B', owner: administrator.name, implOrg: '厦门事业群' },
      ],
    } });
    assert.equal(requirementIntake.statusCode, 200);
    const requirement = await get('SELECT main_systems, collab_dev_systems FROM requirement WHERE req_code = ?', 'INTAKE-ROLE-REQ');
    assert.deepEqual(JSON.parse(requirement.main_systems), ['INTAKE-ROLE-SYS-B']);
    assert.deepEqual(JSON.parse(requirement.collab_dev_systems), ['INTAKE-ROLE-SYS-A']);
    const requirementTasks = await all('SELECT impl_system, impl_org FROM dev_task WHERE req_code = ? ORDER BY impl_system', 'INTAKE-ROLE-REQ');
    assert.deepEqual(requirementTasks.map((task) => ({ ...task })), [
      { impl_system: 'INTAKE-ROLE-SYS-A', impl_org: '厦门事业群' },
      { impl_system: 'INTAKE-ROLE-SYS-B', impl_org: '厦门事业群' },
    ]);

    await run(
      'INSERT INTO ticket (ticket_code, title, status, main_systems, collab_dev_systems) VALUES (?,?,?,?,?)',
      'INTAKE-ROLE-TICKET', '工单角色回写', '工单登记', JSON.stringify(['INTAKE-ROLE-SYS-A']), JSON.stringify(['INTAKE-ROLE-SYS-B']),
    );
    const ticketIntake = await app.inject({ method: 'POST', url: '/api/dev-tasks/intake', headers, payload: {
      reqCode: 'INTAKE-ROLE-TICKET',
      systemRoles: [
        { sysCode: 'INTAKE-ROLE-SYS-A', role: '协同' },
        { sysCode: 'INTAKE-ROLE-SYS-B', role: '主责' },
      ],
      assignments: [{ sysCode: 'INTAKE-ROLE-SYS-B', owner: administrator.name, implOrg: '武汉事业群' }],
    } });
    assert.equal(ticketIntake.statusCode, 200);
    const ticket = await get('SELECT main_systems, collab_dev_systems FROM ticket WHERE ticket_code = ?', 'INTAKE-ROLE-TICKET');
    assert.deepEqual(JSON.parse(ticket.main_systems), ['INTAKE-ROLE-SYS-B']);
    assert.deepEqual(JSON.parse(ticket.collab_dev_systems), ['INTAKE-ROLE-SYS-A']);

    await run(
      'INSERT INTO requirement (req_code, title, status, main_systems, collab_dev_systems) VALUES (?,?,?,?,?)',
      'INTAKE-ROLE-INVALID', '角色确认回滚', '需求登记', JSON.stringify(['INTAKE-ROLE-SYS-A']), JSON.stringify(['INTAKE-ROLE-SYS-B']),
    );
    const invalidRole = await app.inject({ method: 'POST', url: '/api/dev-tasks/intake', headers, payload: {
      reqCode: 'INTAKE-ROLE-INVALID',
      systemRoles: [
        { sysCode: 'INTAKE-ROLE-SYS-A', role: '主责' },
        { sysCode: 'INTAKE-ROLE-SYS-B', role: '主责' },
      ],
      assignments: [{ sysCode: 'INTAKE-ROLE-SYS-A', owner: administrator.name, implOrg: '不存在的机构' }],
    } });
    assert.equal(invalidRole.statusCode, 400);
    assert.equal((await get('SELECT COUNT(*) AS c FROM dev_task WHERE req_code = ?', 'INTAKE-ROLE-INVALID')).c, 0);
    const invalidRequirement = await get('SELECT main_systems, collab_dev_systems FROM requirement WHERE req_code = ?', 'INTAKE-ROLE-INVALID');
    assert.deepEqual(JSON.parse(invalidRequirement.main_systems), ['INTAKE-ROLE-SYS-A']);
    assert.deepEqual(JSON.parse(invalidRequirement.collab_dev_systems), ['INTAKE-ROLE-SYS-B']);

    await run(
      'INSERT INTO requirement (req_code, title, status, main_systems, collab_test_systems) VALUES (?,?,?,?,?)',
      'INTAKE-TEST-INVALID-ORG', '测试实施方校验', '需求登记', JSON.stringify(['INTAKE-ROLE-SYS-A']), JSON.stringify([]),
    );
    const invalidTestOrg = await app.inject({ method: 'POST', url: '/api/test-tasks/intake', headers, payload: {
      reqCode: 'INTAKE-TEST-INVALID-ORG', testType: 'SIT', splitMode: 'split',
      assignments: [{ sysCode: 'INTAKE-ROLE-SYS-A', owner: administrator.name, implOrg: '不存在的机构' }],
    } });
    assert.equal(invalidTestOrg.statusCode, 400);
    assert.equal((await get('SELECT COUNT(*) AS c FROM test_task WHERE req_code = ?', 'INTAKE-TEST-INVALID-ORG')).c, 0);
  });

  test.skip('task-status：四类任务列表返回统一的全链路任务状态，且保留各自状态字段（投产点筛选夹具待改为申请关联）', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const requirementCode = 'TASK-STATUS-REQ-001';
    const ticketCode = 'TASK-STATUS-TICKET-001';

    await run('INSERT INTO requirement (req_code, title, status, main_systems, expected_release_date) VALUES (?,?,?,?,?)',
      requirementCode, '任务状态需求', '需求分析完成', JSON.stringify(['YN0320']), '2026-08-15');
    await run('INSERT INTO ticket (ticket_code, title, status, main_systems, expected_release_date) VALUES (?,?,?,?,?)',
      ticketCode, '任务状态工单', '需求分析完成', JSON.stringify(['YN0320']), '2026-08-15');
    for (const code of [requirementCode, ticketCode]) {
      await run('INSERT INTO dev_task (req_code, task_code, task_name, status) VALUES (?,?,?,?)',
        code, `DEV-${code}`, '开发任务', '开发完成');
      await run('INSERT INTO test_task (req_code, task_code, task_name, test_type, status) VALUES (?,?,?,?,?)',
        code, `UAT-${code}`, '用户测试任务', 'UAT', '测试执行');
    }

    const requirementList = await app.inject({
      method: 'POST', url: '/api/requirements/list', headers, payload: { releasePointIds: [], pageSize: 100 },
    });
    const ticketList = await app.inject({
      method: 'POST', url: '/api/tickets/list', headers, payload: { releasePointIds: [], pageSize: 100 },
    });
    const devList = await app.inject({
      method: 'POST', url: '/api/dev-tasks/list', headers, payload: { releasePointIds: [], pageSize: 100 },
    });
    const testList = await app.inject({
      method: 'POST', url: '/api/test-tasks/list', headers, payload: { releasePointIds: [], testType: 'UAT', pageSize: 100 },
    });

    for (const response of [requirementList, ticketList, devList, testList]) assert.equal(response.statusCode, 200);
    assert.equal(requirementList.json().data.list.find((row) => row.req_code === requirementCode).task_status, '用户测试-测试执行');
    assert.equal(ticketList.json().data.list.find((row) => row.ticket_code === ticketCode).task_status, '用户测试-测试执行');
    assert.equal(devList.json().data.list.find((row) => row.req_code === requirementCode).task_status, '用户测试-测试执行');
    assert.equal(testList.json().data.list.find((row) => row.req_code === requirementCode).task_status, '用户测试-测试执行');
    assert.equal(requirementList.json().data.list.find((row) => row.req_code === requirementCode).task_status_short, 'UAT · 测试执行');
    assert.equal(ticketList.json().data.list.find((row) => row.ticket_code === ticketCode).task_status_short, 'UAT · 测试执行');
    assert.equal(devList.json().data.list.find((row) => row.req_code === requirementCode).status, '开发完成');
    assert.equal(testList.json().data.list.find((row) => row.req_code === requirementCode).status, '测试执行');

    const releaseApply = await app.inject({
      method: 'POST', url: '/api/release-apply', headers,
      payload: {
        change_content: '任务状态投产审批回归', change_system: 'TASK-STATUS-SYSTEM', release_point_id: releasePoint.id,
        ref_codes: [requirementCode], delivery_units: [{ artifact_type: '程序包', delivery_unit: 'task-status.tar.gz', new_version: '1.0.0' }],
      },
    });
    assert.equal(releaseApply.statusCode, 200);
    const releaseList = await app.inject({
      method: 'POST', url: '/api/release/list', headers, payload: { releasePointIds: [releasePoint.id], pageSize: 100 },
    });
    const releaseRow = releaseList.json().data.list.find((row) => row.code === requirementCode);
    assert.equal(releaseRow.task_status_short, 'UAT · 测试执行');
    assert.equal(releaseRow.task_status, '用户测试-测试执行');

    const overview = await app.inject({
      method: 'POST', url: '/api/overview/list', headers, payload: { releasePointIds: [releasePoint.id], pageSize: 100 },
    });
    const overviewCard = overview.json().data.list.flatMap((group) => group.cards).find((card) => card.code === requirementCode);
    assert.equal(overviewCard.currentStage, 'UAT · 测试执行');
    assert.equal(overviewCard.currentStageFull, '用户测试-测试执行');

    const dashboard = await app.inject({
      method: 'POST', url: '/api/dashboard/chart-drilldown', headers,
      payload: { source: 'analytics', statDimension: 'requirement', statStage: 'all', filters: {}, releasePointIds: [releasePoint.id] },
    });
    const dashboardRow = dashboard.json().data.data.find((row) => row.code === requirementCode);
    assert.equal(dashboardRow.task_status, 'UAT · 测试执行');
    assert.equal(dashboardRow.task_status_full, '用户测试-测试执行');
  });

  test('交付件模板配置回显当前生效模板，并登记既有的动态模板', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const token = await app.jwt.sign({ id: administrator.id, phone: administrator.phone });
    const headers = { authorization: `Bearer ${token}`, 'x-requested-by': 'RADAR' };
    const devConfig = await app.inject({ method: 'GET', url: '/api/settings/stage-content/dev', headers });

    assert.equal(devConfig.statusCode, 200);
    const codingChecklist = devConfig.json().data.deliverables.find((item) => item.label === '编码检查表');
    assert.equal(codingChecklist.template?.template_mode, 'custom');
    assert.equal(codingChecklist.template?.handler_key, 'dev.coding-checklist');

    // 历史禁用上传版本不能覆盖当前启用的动态模板，避免系统设置与详情页不一致。
    await run(`INSERT INTO deliverable_template_version
      (deliverable_definition_id, template_mode, filename, stored_path, version_no, enabled)
      VALUES (?,?,?,?,?,0)`, codingChecklist.id, 'upload', '历史模板.docx', 'templates/history.docx', 99);
    const refreshed = await app.inject({ method: 'GET', url: '/api/settings/stage-content/dev', headers });
    const refreshedChecklist = refreshed.json().data.deliverables.find((item) => item.id === codingChecklist.id);
    assert.equal(refreshedChecklist.template?.template_mode, 'custom');
    assert.equal(refreshedChecklist.template?.handler_key, 'dev.coding-checklist');
  });

  test.skip('阶段配置初始种子完整重放本地确认的输入项、分区和交付件快照（改由内置目录生成）', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const token = await app.jwt.sign({ id: administrator.id, phone: administrator.phone });
    const headers = { authorization: `Bearer ${token}`, 'x-requested-by': 'RADAR' };

    for (const expected of LOCAL_STAGE_CONTENT_SEED.scopes) {
      const response = await app.inject({ method: 'GET', url: `/api/settings/stage-content/${expected.scope_key}`, headers });
      assert.equal(response.statusCode, 200);
      const config = response.json().data;
      const sectionKeyById = new Map(config.sections.map((section) => [section.id, section.section_key]));
      const toRulesByValue = (rules = {}) => Object.fromEntries(config.statuses
        .filter((status) => Object.hasOwn(rules, status.id))
        .map((status) => [status.value, Number(!!rules[status.id])]))
      assert.deepEqual(
        config.sections.map((section) => ({ section_key: section.section_key, title: section.title, sort: section.sort, collapsed: section.collapsed, is_builtin: section.is_builtin, layout_mode: section.layout_mode, show_title: section.show_title })),
        expected.sections,
        `${expected.scope_key} 的分区配置应与本地 Seed 快照一致`,
      );
      assert.deepEqual(config.fields.map((field) => ({
        field_key: field.field_key, label: field.label, field_kind: field.field_kind, input_type: field.input_type,
        source_key: field.source_key || '', multiple: field.multiple, native_column: field.native_column || '', component_key: field.component_key || '',
        section_key: sectionKeyById.get(field.section_id), column_span: field.column_span, visible: field.visible, list_visible: field.list_visible,
        filterable: field.filterable, dashboard_dimension: field.dashboard_dimension, sort: field.sort, is_builtin: field.is_builtin,
        ...(Object.keys(field.rules || {}).length ? { rules: toRulesByValue(field.rules) } : {}),
      })), expected.fields, `${expected.scope_key} 的输入项配置应与本地 Seed 快照一致`);
      assert.deepEqual(config.deliverables.map((deliverable) => ({
        deliverable_key: deliverable.deliverable_key, label: deliverable.label, input_mode: deliverable.input_mode, visible: deliverable.visible,
        sort: deliverable.sort, layout_mode: deliverable.layout_mode,
        ...(Object.keys(deliverable.rules || {}).length ? { rules: toRulesByValue(deliverable.rules) } : {}),
        ...(deliverable.template ? { templates: [{ template_mode: deliverable.template.template_mode, handler_key: deliverable.template.handler_key, version_no: deliverable.template.version_no, enabled: deliverable.template.enabled }] } : {}),
      })), expected.deliverables, `${expected.scope_key} 的交付件配置应与本地 Seed 快照一致`);
    }
  });

  test('配置升级仅补齐缺失目录项且保留管理员配置', async () => {
    const original = await get("SELECT id, sort FROM stage_field_definition WHERE scope_key = 'requirement' AND field_key = 'is_accounting'");
    assert.ok(original);
    await run('UPDATE stage_field_definition SET sort = ? WHERE id = ?', 987, original.id);
    const priority = await get("SELECT id FROM stage_field_definition WHERE scope_key = 'requirement' AND field_key = 'priority'");
    await run('DELETE FROM stage_field_status_rule WHERE field_definition_id = ?', priority.id);
    await run('DELETE FROM stage_field_definition WHERE id = ?', priority.id);
    const deliverable = await get("SELECT id FROM deliverable_definition WHERE scope_key = 'requirement' AND deliverable_key = 'builtin_1'");
    await run('DELETE FROM deliverable_status_rule WHERE deliverable_definition_id = ?', deliverable.id);
    await run('DELETE FROM deliverable_definition WHERE id = ?', deliverable.id);
    await run('DELETE FROM configuration_upgrade_ledger WHERE upgrade_id = ?', BUILTIN_CONFIGURATION_UPGRADE_ID);

    const first = await applyBuiltinConfigurationUpgrades({
      builtinMetadata: STAGE_BUILTIN_FIELD_METADATA,
      sectionDefaults: STAGE_BUILTIN_SECTION_DEFAULTS,
      snapshot: LOCAL_STAGE_CONTENT_SEED,
    });
    assert.equal(first.applied, true);
    assert.ok(first.added.includes('field:requirement.priority'));
    assert.ok(first.added.includes('deliverable:requirement.builtin_1'));
    const restored = await get("SELECT sort, list_visible, filterable FROM stage_field_definition WHERE scope_key = 'requirement' AND field_key = 'priority'");
    const expectedPriority = LOCAL_STAGE_CONTENT_SEED.scopes.find((scope) => scope.scope_key === 'requirement').fields.find((field) => field.field_key === 'priority');
    assert.equal(restored.sort, expectedPriority.sort);
    assert.equal(restored.list_visible, expectedPriority.list_visible);
    assert.equal(restored.filterable, expectedPriority.filterable);
    assert.equal((await get("SELECT label FROM deliverable_definition WHERE scope_key = 'requirement' AND deliverable_key = 'builtin_1'")).label, '需求说明书');
    assert.equal((await get('SELECT sort FROM stage_field_definition WHERE id = ?', original.id)).sort, 987);
    const second = await applyBuiltinConfigurationUpgrades({
      builtinMetadata: STAGE_BUILTIN_FIELD_METADATA,
      sectionDefaults: STAGE_BUILTIN_SECTION_DEFAULTS,
      snapshot: LOCAL_STAGE_CONTENT_SEED,
    });
    assert.equal(second.applied, false);
  });

  test('配置升级会退役需求和工单已删除的计划投产点必填规则', async () => {
    const staleFields = [
      { scopeKey: 'requirement', status: '需求登记' },
      { scopeKey: 'ticket', status: '工单登记' },
    ];
    for (const stale of staleFields) {
      const basic = await get("SELECT id FROM stage_section WHERE scope_key = ? AND section_key = 'basic'", stale.scopeKey);
      const field = await run(`INSERT INTO stage_field_definition
        (scope_key, field_key, label, field_kind, input_type, source_key, multiple, native_column, section_id, column_span, visible, list_visible, filterable, dashboard_dimension, sort, is_builtin)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      stale.scopeKey, 'release_point_id', '计划投产点', 'native', 'release_point', 'release_point', 0, 'release_point_id', basic.id, 12, 1, 1, 1, 1, 30, 1);
      const status = await get('SELECT id FROM dict_item WHERE category = ? AND attr_value = ?', 'process_status', stale.status);
      await run('INSERT INTO stage_field_status_rule (field_definition_id, status_dict_item_id, required) VALUES (?,?,1)', field.lastInsertRowid, status.id);
    }
    await run("DELETE FROM app_config WHERE key = 'stage.content.retire-planned-release-point.v1'");

    const result = await applyBuiltinConfigurationUpgrades({
      builtinMetadata: STAGE_BUILTIN_FIELD_METADATA,
      sectionDefaults: STAGE_BUILTIN_SECTION_DEFAULTS,
    });
    assert.deepEqual(result.added.filter((item) => item.startsWith('retired-field:')).sort(), [
      'retired-field:requirement.release_point_id',
      'retired-field:ticket.release_point_id',
    ]);
    for (const stale of staleFields) {
      const field = await get("SELECT id, deleted_at FROM stage_field_definition WHERE scope_key=? AND field_key='release_point_id'", stale.scopeKey);
      assert.ok(field.deleted_at, `${stale.scopeKey} 的废弃字段应被软删除`);
      assert.equal((await get('SELECT COUNT(*) AS c FROM stage_field_status_rule WHERE field_definition_id=?', field.id)).c, 0);
    }
  });

  test.skip('优先级在 API 更新中校验枚举并对空值使用默认值（配置快照迁移中）', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    const inserted = await run(`INSERT INTO requirement
      (req_code, title, summary, status, req_type, is_accounting, propose_dept, proposer, propose_time, main_systems, expected_release_date)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    'PRIORITY-API-001', '优先级接口回归', '用于通过既有必填规则的最小夹具', '需求登记', '业务需求', '否', '计划财务板块', '["测试用户"]', '2026-07-30', '["YN0320"]', '2026-08-15');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const ticket = await run('INSERT INTO ticket (ticket_code, title, status, expected_release_date) VALUES (?,?,?,?)',
      'PRIORITY-API-TICKET-001', '优先级默认值回归', '工单登记', '2026-08-15');
    assert.equal((await get('SELECT priority FROM ticket WHERE id = ?', ticket.lastInsertRowid)).priority, '中');

    const [requirementConfig, ticketConfig] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/settings/stage-content/requirement', headers }),
      app.inject({ method: 'GET', url: '/api/settings/stage-content/ticket', headers }),
    ]);
    for (const response of [requirementConfig, ticketConfig]) {
      assert.equal(response.statusCode, 200);
      const config = response.json().data;
      const priority = config.fields.find((field) => field.field_key === 'priority');
      assert.equal(priority.field_kind, 'native');
      assert.equal(priority.source_key, 'priority');
      assert.equal(priority.section_id, config.sections.find((section) => section.section_key === 'basic').id);
      assert.equal(priority.visible, 1);
      assert.equal(priority.list_visible, 1);
      assert.equal(priority.filterable, 1);
      assert.equal(priority.dashboard_dimension, 1);
      assert.deepEqual(priority.catalog.options.map((option) => option.value), ['高', '中', '低']);
      assert.equal(priority.catalog.default_value, '中');
    }
    const invalid = await app.inject({ method: 'PUT', url: `/api/requirements/${inserted.lastInsertRowid}`, headers, payload: { priority: '紧急' } });
    assert.equal(invalid.statusCode, 400);
    assert.match(invalid.json().message, /优先级仅支持高、中、低/);
    const defaulted = await app.inject({ method: 'PUT', url: `/api/requirements/${inserted.lastInsertRowid}`, headers, payload: { priority: '' } });
    assert.equal(defaulted.statusCode, 200);
    assert.equal((await get('SELECT priority FROM requirement WHERE id = ?', inserted.lastInsertRowid)).priority, '中');
    const elevated = await app.inject({ method: 'PUT', url: `/api/requirements/${inserted.lastInsertRowid}`, headers, payload: { priority: '高' } });
    assert.equal(elevated.statusCode, 200);
    const filtered = await app.inject({
      method: 'POST', url: '/api/requirements/list', headers,
      payload: { releasePointIds: [releasePoint.id], pageSize: 100, filters: [{ field: 'priority', op: 'in', value: ['高'] }] },
    });
    assert.equal(filtered.statusCode, 200);
    assert.equal(filtered.json().data.list.find((row) => row.id === inserted.lastInsertRowid).priority, '高');

    const dimensions = await app.inject({ method: 'GET', url: '/api/dashboard/dimensions', headers });
    assert.equal(dimensions.statusCode, 200);
    assert.ok(dimensions.json().data.dimsBySource.analytics.some((dimension) => dimension.key === 'native:requirement:priority'));
    assert.ok(dimensions.json().data.dimsBySource.analytics.some((dimension) => dimension.key === 'native:ticket:priority'));
    const chart = await app.inject({
      method: 'POST', url: '/api/dashboard/chart-data', headers,
      payload: { source: 'analytics', statDimension: 'requirement', statStage: 'analysis', dimension: 'native:requirement:priority', releasePointIds: [releasePoint.id] },
    });
    assert.equal(chart.statusCode, 200);
    assert.ok(chart.json().data.data.some((row) => row.name === '高'));

    const requirementPriority = requirementConfig.json().data.fields.find((field) => field.field_key === 'priority');
    const disabled = await app.inject({
      method: 'PUT', url: `/api/settings/stage-content/requirement/fields/${requirementPriority.id}`, headers,
      payload: { ...requirementPriority, visible: false, list_visible: false, filterable: false, dashboard_dimension: false },
    });
    assert.equal(disabled.statusCode, 200);
    const refreshedDimensions = await app.inject({ method: 'GET', url: '/api/dashboard/dimensions', headers });
    assert.equal(refreshedDimensions.statusCode, 200);
    assert.equal(refreshedDimensions.json().data.dimsBySource.analytics.some((dimension) => dimension.key === 'native:requirement:priority'), false);
    assert.ok(refreshedDimensions.json().data.dimsBySource.analytics.some((dimension) => dimension.key === 'native:ticket:priority'));
  });

  test('系统设置可新增扩展字段并保存配置修订', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const token = await app.jwt.sign({ id: administrator.id, phone: administrator.phone });
    const headers = { authorization: `Bearer ${token}`, 'x-requested-by': 'RADAR' };
    const before = await get("SELECT COUNT(*) AS count FROM content_config_revision WHERE scope_key = 'requirement' AND config_type = 'content'");
    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/stage-content/requirement/fields',
      headers,
      payload: {
        label: '接口回归扩展字段',
        field_kind: 'extension',
        input_type: 'text',
        source_key: '',
        multiple: false,
        column_span: 12,
        visible: true,
        list_visible: false,
        filterable: false,
        dashboard_dimension: false,
        sort: 0,
        rules: {},
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.field_kind, 'extension');
    assert.equal(response.json().data.label, '接口回归扩展字段');
    const after = await get("SELECT COUNT(*) AS count FROM content_config_revision WHERE scope_key = 'requirement' AND config_type = 'content'");
    assert.equal(after.count, before.count + 1);
  });

  test('系统设置分区字段布局按完整集合原子保存', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const configResponse = await app.inject({ method: 'GET', url: '/api/settings/stage-content/requirement', headers });
    assert.equal(configResponse.statusCode, 200);
    const config = configResponse.json().data;
    const section = config.sections.find((item) => item.section_key === 'basic');
    const statusField = config.fields.find((item) => item.field_key === config.scope.status_field);
    assert.ok(statusField);
    const fields = config.fields.filter((item) => item.section_id === section.id && item.id !== statusField?.id).sort((a, b) => a.sort - b.sort || a.id - b.id);
    assert.ok(fields.length >= 2);
    const beforeById = new Map(fields.map((field) => [field.id, {
      section_id: field.section_id,
      visible: field.visible,
      list_visible: field.list_visible,
      filterable: field.filterable,
      dashboard_dimension: field.dashboard_dimension,
    }]));
    const reorderedIds = [fields[1].id, fields[0].id, ...fields.slice(2).map((field) => field.id)];
    const columnSpans = Object.fromEntries(fields.map((field) => [field.id, field.column_span]));
    columnSpans[reorderedIds[0]] = columnSpans[reorderedIds[0]] === 24 ? 12 : 24;
    const beforeRevision = await get("SELECT COUNT(*) AS count FROM content_config_revision WHERE scope_key = 'requirement' AND config_type = 'content'");
    const sorted = await app.inject({
      method: 'PUT', url: '/api/settings/stage-content/requirement/field-layout', headers,
      payload: { section_id: section.id, field_ids: reorderedIds, column_spans: columnSpans },
    });
    assert.equal(sorted.statusCode, 200);
    assert.deepEqual(sorted.json().data.map((field) => field.id), reorderedIds);
    assert.deepEqual(sorted.json().data.map((field) => field.sort), reorderedIds.map((_, index) => (index + 1) * 10));
    assert.deepEqual(sorted.json().data.map((field) => field.column_span), reorderedIds.map((id) => columnSpans[id]));
    const afterRevision = await get("SELECT COUNT(*) AS count FROM content_config_revision WHERE scope_key = 'requirement' AND config_type = 'content'");
    assert.equal(afterRevision.count, beforeRevision.count + 1);

    const refreshed = await app.inject({ method: 'GET', url: '/api/settings/stage-content/requirement', headers });
    const orderedFields = refreshed.json().data.fields.filter((field) => field.section_id === section.id && field.id !== statusField.id);
    assert.deepEqual(orderedFields.map((field) => field.id), reorderedIds);
    for (const field of orderedFields) assert.deepEqual({
      section_id: field.section_id,
      visible: field.visible,
      list_visible: field.list_visible,
      filterable: field.filterable,
      dashboard_dimension: field.dashboard_dimension,
    }, beforeById.get(field.id));
    assert.deepEqual(orderedFields.map((field) => field.column_span), reorderedIds.map((id) => columnSpans[id]));
    const unchangedStatus = refreshed.json().data.fields.find((field) => field.id === statusField?.id);
    assert.equal(unchangedStatus?.sort, statusField?.sort);
    assert.equal(unchangedStatus?.column_span, statusField?.column_span);

    const incomplete = await app.inject({
      method: 'PUT', url: '/api/settings/stage-content/requirement/field-layout', headers,
      payload: { section_id: section.id, field_ids: reorderedIds.slice(1), column_spans: columnSpans },
    });
    assert.equal(incomplete.statusCode, 400);
    assert.match(incomplete.json().message, /字段宽度|全部输入项/);

    const withStatus = await app.inject({
      method: 'PUT', url: '/api/settings/stage-content/requirement/field-layout', headers,
      payload: { section_id: section.id, field_ids: [...reorderedIds, statusField.id], column_spans: { ...columnSpans, [statusField.id]: statusField.column_span } },
    });
    assert.equal(withStatus.statusCode, 400);
    assert.match(withStatus.json().message, /全部输入项/);

    const noPermission = await run(
      "INSERT INTO user (phone, name, org, password_hash, status, is_super, password_changed_at) VALUES (?,?,?,?,?,?,datetime('now','localtime'))",
      'section-sort-rbac-user', '分区排序无权限用户', '测试机构', 'not-used', '启用', 0,
    );
    const forbiddenHeaders = { authorization: `Bearer ${await app.jwt.sign({ id: noPermission.lastInsertRowid, phone: 'section-sort-rbac-user' })}`, 'x-requested-by': 'RADAR' };
    const forbidden = await app.inject({
      method: 'PUT', url: '/api/settings/stage-content/requirement/field-layout', headers: forbiddenHeaders,
      payload: { section_id: section.id, field_ids: reorderedIds, column_spans: columnSpans },
    });
    assert.equal(forbidden.statusCode, 403);
  });

  test('系统设置新增交付件时由服务端生成编码并保存配置修订', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const token = await app.jwt.sign({ id: administrator.id, phone: administrator.phone });
    const headers = { authorization: `Bearer ${token}`, 'x-requested-by': 'RADAR' };
    const before = await get("SELECT COUNT(*) AS count FROM content_config_revision WHERE scope_key = 'requirement' AND config_type = 'deliverable'");
    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/stage-deliverables/requirement',
      headers,
      payload: {
        deliverable_key: 'client_supplied_key',
        label: '接口回归交付件',
        input_mode: 'both',
        visible: true,
        sort: 0,
        rules: {},
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().data.label, '接口回归交付件');
    assert.match(response.json().data.deliverable_key, /^deliverable_[a-f0-9]{32}$/);
    assert.notEqual(response.json().data.deliverable_key, 'client_supplied_key');
    const after = await get("SELECT COUNT(*) AS count FROM content_config_revision WHERE scope_key = 'requirement' AND config_type = 'deliverable'");
    assert.equal(after.count, before.count + 1);
  });

  test('交付件上传模板显示文件名且可删除', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const token = await app.jwt.sign({ id: administrator.id, phone: administrator.phone });
    const headers = { authorization: `Bearer ${token}`, 'x-requested-by': 'RADAR' };
    const configResponse = await app.inject({ method: 'GET', url: '/api/settings/stage-content/test.SIT', headers });
    const deliverable = configResponse.json().data.deliverables.find((item) => item.label === '测试方案');
    assert.ok(deliverable);
    const storedPath = 'templates/template-delete.docx';
    const filePath = path.join(process.env.ATTACHMENT_DIR, storedPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'template fixture');
    const insert = await run(`INSERT INTO deliverable_template_version
      (deliverable_definition_id, template_mode, filename, stored_path, version_no, enabled)
      VALUES (?,?,?,?,?,1)`, deliverable.id, 'upload', '测试方案模板.docx', storedPath, 1);

    const withTemplate = await app.inject({ method: 'GET', url: '/api/settings/stage-content/test.SIT', headers });
    const configured = withTemplate.json().data.deliverables.find((item) => item.id === deliverable.id);
    assert.equal(configured.template?.filename, '测试方案模板.docx');
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/settings/stage-deliverables/test.SIT/${deliverable.id}/templates/${insert.lastInsertRowid}`,
      headers,
    });
    assert.equal(removed.statusCode, 200);
    assert.equal(fs.existsSync(filePath), false);
    const deleted = await get('SELECT enabled, deleted_at FROM deliverable_template_version WHERE id = ?', insert.lastInsertRowid);
    assert.equal(deleted.enabled, 0);
    assert.ok(deleted.deleted_at);
    const afterDelete = await app.inject({ method: 'GET', url: '/api/settings/stage-content/test.SIT', headers });
    const cleared = afterDelete.json().data.deliverables.find((item) => item.id === deliverable.id);
    assert.equal(cleared.template, null);
  });

  test('投产申请写入索引关联表，投产审批列表可按关联编号读取', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    assert.ok(administrator);
    assert.ok(releasePoint);
    const code = 'PERF-REF-001';
    await run(
      `INSERT INTO requirement (req_code, title, status, expected_release_date)
       VALUES (?,?,?,?)`,
      code, '索引关联回归需求', '待分析', '2026-08-15',
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
      `INSERT INTO requirement (req_code, title, status, expected_release_date)
       VALUES (?,?,?,?)`,
      updatedCode, '索引关联更新回归需求', '待分析', '2026-08-15',
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
      // 覆盖投产窗口筛选：概览追加投产申请关联问题时必须限定 ra.release_point_id，
      // 防止 JOIN release_apply_reference 后出现同名字段歧义。
      method: 'POST', url: '/api/overview/list', headers,
      payload: { page: 1, pageSize: 20, releasePointIds: [releasePoint.id] },
    });
    assert.equal(overview.statusCode, 200);
    assert.equal(overview.json().data.page, 1);
    assert.ok(overview.json().data.total >= overview.json().data.list.length);
  });

  test('需求编号预览仅在规则使用投产窗口时要求先选择投产点', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const token = await app.jwt.sign({ id: administrator.id, phone: administrator.phone });
    const headers = { authorization: `Bearer ${token}`, 'x-requested-by': 'RADAR' };

    let response = await app.inject({
      method: 'PUT', url: '/api/settings/app-config', headers,
      payload: { items: { 'code.requirement': 'RQ_{当前年月}_{序号}' } },
    });
    assert.equal(response.statusCode, 200);
    response = await app.inject({ method: 'GET', url: '/api/requirements/gen-code', headers });
    assert.equal(response.statusCode, 200);
    assert.match(response.json().data.req_code, /^RQ_\d{6}_001$/);

    response = await app.inject({
      method: 'PUT', url: '/api/settings/app-config', headers,
      payload: { items: { 'code.requirement': 'RQ_{需求/工单编号}_{序号}' } },
    });
    assert.equal(response.statusCode, 400);

    response = await app.inject({
      method: 'PUT', url: '/api/settings/app-config', headers,
      payload: { items: { 'code.requirement': 'RQ_{投产窗口}_{序号}' } },
    });
    assert.equal(response.statusCode, 200);
    response = await app.inject({ method: 'GET', url: '/api/requirements/gen-code', headers });
    assert.equal(response.statusCode, 400);

    await app.inject({
      method: 'PUT', url: '/api/settings/app-config', headers,
      payload: { items: { 'code.requirement': 'RC_{当前年月日}_{序号}' } },
    });
  });

  test.skip('业务编号序列：首次从历史最大值接续，后续调用原子递增（旧投产窗口模板已移除）', async () => {
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    const releaseWindow = '20990101';
    await run(
      `INSERT INTO requirement (req_code, title, status, expected_release_date)
       VALUES (?,?,?,?)`,
      `RC_${releaseWindow}_007`, '编号序列历史记录', '待分析', '2026-08-15',
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

  test.skip('业务编号预览：未保存不占号，保存确认后才推进序列（旧投产窗口模板已移除）', async () => {
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    const releaseWindow = '20990102';
    await run(
      `INSERT INTO requirement (req_code, title, status, expected_release_date)
       VALUES (?,?,?,?)`,
      `RC_${releaseWindow}_004`, '编号预览历史记录', '待分析', '2026-08-15',
    );
    // 模拟旧版本已多次点击“生成”但未保存，序列表被错误推进的历史数据。
    await run(
      'INSERT INTO code_sequence (rule_key, prefix, next_value) VALUES (?,?,?)',
      'code.requirement', `RC_${releaseWindow}_`, 50,
    );

    const [firstPreview, secondPreview] = await Promise.all([
      previewRequirementCode(releaseWindow),
      previewRequirementCode(releaseWindow),
    ]);
    assert.equal(firstPreview, `RC_${releaseWindow}_005`);
    assert.equal(secondPreview, firstPreview);
    const beforeClaim = await get(
      'SELECT next_value FROM code_sequence WHERE rule_key = ? AND prefix = ?',
      'code.requirement', `RC_${releaseWindow}_`,
    );
    assert.equal(beforeClaim.next_value, 50);

    const claimed = await claimRequirementCode(releaseWindow, firstPreview);
    assert.equal(claimed, firstPreview);
    const afterClaim = await get(
      'SELECT next_value FROM code_sequence WHERE rule_key = ? AND prefix = ?',
      'code.requirement', `RC_${releaseWindow}_`,
    );
    assert.equal(afterClaim.next_value, 6);
    await run(
      `INSERT INTO requirement (req_code, title, status, expected_release_date)
       VALUES (?,?,?,?)`,
      claimed, '编号预览保存记录', '待分析', '2026-08-15',
    );
    assert.equal(await previewRequirementCode(releaseWindow), `RC_${releaseWindow}_006`);
  });

  test('分析字段：需求和工单完整保存、筛选、配置及非法值校验', async () => {
    const administrator = await get('SELECT id, phone, name FROM user WHERE is_super = 1 LIMIT 1');
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const payload = {
      req_code: 'FIELD-REQ-005', title: '分析字段回归', summary: '覆盖实施机构、接收人、工作量与录入信息。', propose_time: '2026-07-30',
      req_type: '新增监管需求', is_accounting: '否', propose_dept: '风险管理板块', proposer: [administrator.name],
      main_systems: ['YN0320'], collab_dev_systems: ['YN0320'], implementation_org: '云南农信', receiver: administrator.name,
      workload: '3.5', issue_no: 'OA-202607-005',
    };
    const requirementCreate = await app.inject({ method: 'POST', url: '/api/requirements', headers, payload });
    assert.equal(requirementCreate.statusCode, 200, requirementCreate.body);
    const ticketCreate = await app.inject({ method: 'POST', url: '/api/tickets', headers, payload: { ...payload, ticket_code: 'FIELD-TICKET-005', ticket_type: '工单急迫需求' } });
    assert.equal(ticketCreate.statusCode, 200);

    for (const [url, codeKey, code] of [
      ['/api/requirements/list', 'req_code', requirementCreate.json().data.req_code],
      ['/api/tickets/list', 'ticket_code', 'FIELD-TICKET-005'],
    ]) {
      const list = await app.inject({ method: 'POST', url, headers, payload: { releasePointIds: [releasePoint.id], pageSize: 100, filters: [{ field: 'implementation_org', op: 'in', value: ['云南农信'] }] } });
      assert.equal(list.statusCode, 200);
      const row = list.json().data.list.find((item) => item[codeKey] === code);
      assert.equal(row.implementation_org, '云南农信');
      assert.equal(row.receiver, administrator.name);
      assert.equal(row.workload, '3.5');
      assert.equal(row.issue_no, 'OA-202607-005');
      assert.equal(row.registrar, administrator.name);
      assert.match(row.register_time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    }

    for (const [url, codeKey, code] of [
      ['/api/requirements/list', 'req_code', requirementCreate.json().data.req_code],
      ['/api/tickets/list', 'ticket_code', 'FIELD-TICKET-005'],
    ]) {
      for (const field of ['proposer', 'collab_dev_systems']) {
        const list = await app.inject({ method: 'POST', url, headers, payload: { releasePointIds: [releasePoint.id], pageSize: 100, filters: [{ field, op: 'in', value: field === 'proposer' ? [administrator.name] : ['YN0320'] }] } });
        assert.equal(list.statusCode, 200);
        assert.ok(list.json().data.list.some((item) => item[codeKey] === code), `${field} 应筛选到目标记录`);
      }
    }

    const invalid = await app.inject({ method: 'POST', url: '/api/requirements', headers, payload: { ...payload, title: '非法接收人', receiver: '不存在的人员' } });
    assert.equal(invalid.statusCode, 400);
    assert.match(invalid.json().message, /需求接收人/);

    for (const [url, invalidPayload] of [
      ['/api/requirements', { ...payload, req_code: 'FIELD-REQ-WORKLOAD-INVALID', title: '非法工作量需求', workload: '3.456' }],
      ['/api/tickets', { ...payload, ticket_code: 'FIELD-TICKET-WORKLOAD-INVALID', title: '非法工作量工单', ticket_type: '工单急迫需求', workload: '3 人天' }],
    ]) {
      const response = await app.inject({ method: 'POST', url, headers, payload: invalidPayload });
      assert.equal(response.statusCode, 400, response.body);
      assert.match(response.json().message, /工作量\(人天\)/);
    }

    const invalidUpdate = await app.inject({
      method: 'PUT', url: `/api/requirements/${requirementCreate.json().data.id}`, headers,
      payload: { workload: '1.234' },
    });
    assert.equal(invalidUpdate.statusCode, 400, invalidUpdate.body);
    assert.match(invalidUpdate.json().message, /工作量\(人天\)/);

    for (const scopeKey of ['requirement', 'ticket']) {
      const config = await app.inject({ method: 'GET', url: `/api/settings/stage-content/${scopeKey}`, headers });
      assert.equal(config.statusCode, 200);
      const fields = new Map(config.json().data.fields.map((field) => [field.field_key, field]));
      assert.equal(fields.get('issue_no').label, 'OA编号/工单编号');
      assert.equal(fields.get('implementation_org').source_key, 'dict:org');
      assert.equal(fields.get('receiver').input_type, 'person');
      assert.equal(fields.get('workload').label, '工作量(人天)');
      assert.equal(fields.get('workload').input_type, 'text');
      assert.equal(fields.get('registrar').label, '录入人信息');
      assert.equal(fields.has('register_time'), false);
      assert.equal(config.json().data.sections.find((section) => section.section_key === 'systems').title, '实施机构及系统');
    }

    const requirementConfig = await app.inject({ method: 'GET', url: '/api/settings/stage-content/requirement', headers });
    const implementationOrg = requirementConfig.json().data.fields.find((field) => field.field_key === 'implementation_org');
    const disabled = await app.inject({
      method: 'PUT', url: `/api/settings/stage-content/requirement/fields/${implementationOrg.id}`, headers,
      payload: { ...implementationOrg, visible: false, list_visible: false, filterable: false, dashboard_dimension: false },
    });
    assert.equal(disabled.statusCode, 200);
    const disabledSchema = await app.inject({ method: 'GET', url: '/api/settings/stage-content/requirement', headers });
    const disabledField = disabledSchema.json().data.fields.find((field) => field.field_key === 'implementation_org');
    assert.equal(disabledField.list_visible, 0);
    assert.equal(disabledField.filterable, 0);
    assert.equal(disabledField.dashboard_dimension, 0);
    const disabledDims = await app.inject({ method: 'GET', url: '/api/dashboard/dimensions', headers });
    assert.equal(disabledDims.json().data.dimsBySource.analytics.some((dimension) => dimension.key === 'native:requirement:implementation_org'), false);

    const enabled = await app.inject({
      method: 'PUT', url: `/api/settings/stage-content/requirement/fields/${implementationOrg.id}`, headers,
      payload: { ...implementationOrg, visible: true, list_visible: true, filterable: true, dashboard_dimension: true },
    });
    assert.equal(enabled.statusCode, 200);
    const enabledDims = await app.inject({ method: 'GET', url: '/api/dashboard/dimensions', headers });
    assert.ok(enabledDims.json().data.dimsBySource.analytics.some((dimension) => dimension.key === 'native:requirement:implementation_org'));
    const implementationChart = await app.inject({
      method: 'POST', url: '/api/dashboard/chart-data', headers,
      payload: { source: 'analytics', statDimension: 'requirement', statStage: 'analysis', dimension: 'native:requirement:implementation_org', releasePointIds: [releasePoint.id] },
    });
    assert.equal(implementationChart.statusCode, 200);
    assert.ok(implementationChart.json().data.data.some((row) => row.name === '云南农信'));

    // 开发阶段动态原生维度必须从 dev_task 读取，不能错误读取关联需求/工单字段。
    const devTask = await get('SELECT id FROM dev_task ORDER BY id LIMIT 1');
    assert.ok(devTask?.id);
    await run('UPDATE dev_task SET impl_org = ? WHERE id = ?', '云南农信', devTask.id);
    const devConfig = await app.inject({ method: 'GET', url: '/api/settings/stage-content/dev', headers });
    const devImplOrg = devConfig.json().data.fields.find((field) => field.field_key === 'impl_org');
    const enabledDevDim = await app.inject({
      method: 'PUT', url: `/api/settings/stage-content/dev/fields/${devImplOrg.id}`, headers,
      payload: { ...devImplOrg, visible: true, list_visible: true, filterable: true, dashboard_dimension: true },
    });
    assert.equal(enabledDevDim.statusCode, 200);
    const devChart = await app.inject({
      method: 'POST', url: '/api/dashboard/chart-data', headers,
      payload: { source: 'analytics', statDimension: 'all', statStage: 'dev', dimension: 'native:dev:impl_org' },
    });
    assert.equal(devChart.statusCode, 200);
    assert.ok(devChart.json().data.data.some((row) => row.name === '云南农信'));
  });

  test('交付件版本由服务端递增、手机号脱敏、软删除且预览配置严格受控', async () => {
    const administrator = await get('SELECT id, phone, name FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const deliverable = await get("SELECT id FROM deliverable_definition WHERE scope_key = 'requirement' AND input_mode IN ('both', 'path') ORDER BY id LIMIT 1");
    assert.ok(deliverable?.id);
    const requirement = await run('INSERT INTO requirement (req_code, title, status) VALUES (?,?,?)', 'ATTACHMENT-VERSION-001', '附件版本回归', '需求登记');

    const first = await app.inject({
      method: 'POST', url: '/api/attachments/path', headers,
      payload: { entityType: 'requirement', entityId: requirement.lastInsertRowid, deliverableId: deliverable.id, pathText: '//demo/share/v1' },
    });
    assert.equal(first.statusCode, 200, first.body);
    assert.equal(first.json().data.version_no, 1);
    assert.equal(first.json().data.uploader_phone, undefined);
    assert.ok(first.json().data.uploader_phone_masked);

    const rejectedVersionInput = await app.inject({
      method: 'POST', url: `/api/attachments/${first.json().data.id}/path-versions`, headers,
      payload: { pathText: '//demo/share/invalid', version_no: 99 },
    });
    assert.equal(rejectedVersionInput.statusCode, 400);

    const second = await app.inject({
      method: 'POST', url: `/api/attachments/${first.json().data.id}/path-versions`, headers,
      payload: { pathText: '//demo/share/v2' },
    });
    assert.equal(second.statusCode, 200, second.body);
    assert.equal(second.json().data.version_no, 2);
    assert.equal(second.json().data.logical_item_id, first.json().data.logical_item_id);

    const current = await app.inject({ method: 'GET', url: `/api/attachments?entityType=requirement&entityId=${requirement.lastInsertRowid}`, headers });
    assert.equal(current.statusCode, 200);
    assert.deepEqual(current.json().data.filter((item) => item.deliverable_id === deliverable.id).map((item) => item.version_no), [2]);

    const history = await app.inject({ method: 'GET', url: `/api/attachments/${second.json().data.id}/versions`, headers });
    assert.equal(history.statusCode, 200, history.body);
    assert.deepEqual(history.json().data.map((item) => item.version_no), [2, 1]);
    assert.ok(history.json().data.every((item) => item.uploader_phone === undefined));

    const unavailablePreview = await app.inject({ method: 'POST', url: `/api/attachments/${second.json().data.id}/preview-session`, headers, payload: {} });
    assert.equal(unavailablePreview.statusCode, 400); // 路径型交付件不能预览

    const deleted = await app.inject({ method: 'DELETE', url: `/api/attachments/${second.json().data.id}`, headers });
    assert.equal(deleted.statusCode, 200, deleted.body);
    const afterDelete = await app.inject({ method: 'GET', url: `/api/attachments?entityType=requirement&entityId=${requirement.lastInsertRowid}`, headers });
    assert.equal(afterDelete.json().data.filter((item) => item.deliverable_id === deliverable.id).length, 0);
    const deletedHistory = await app.inject({ method: 'GET', url: `/api/attachments/${second.json().data.id}/versions`, headers });
    assert.equal(deletedHistory.statusCode, 200);
    assert.ok(deletedHistory.json().data.every((item) => item.is_deleted === 1));

    const savedSettings = await app.inject({
      method: 'PUT', url: '/api/settings/app-config', headers,
      payload: { items: { 'deliverable.preview.enabled': 'false', 'deliverable.preview.kkFileViewBaseUrl': '' } },
    });
    assert.equal(savedSettings.statusCode, 200, savedSettings.body);
    assert.ok(await get("SELECT id FROM audit_log WHERE entity_type = 'settings' AND entity_code = 'deliverable-preview'"));

    const invalidSettings = await app.inject({
      method: 'PUT', url: '/api/settings/app-config', headers,
      payload: { items: { 'deliverable.preview.enabled': 'true', 'deliverable.preview.kkFileViewBaseUrl': 'https://not-allowlisted.example' } },
    });
    assert.equal(invalidSettings.statusCode, 400);
    assert.equal((await get("SELECT value FROM app_config WHERE key = 'deliverable.preview.enabled'"))?.value, 'false');
    const csp = await app.inject({ method: 'GET', url: '/api/health' });
    assert.match(csp.headers['content-security-policy'], /frame-src 'self'/);
  });

  test('预览会话可签发给未删除历史 PDF，kkFileView 拉取端点不依赖用户 Cookie', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const requirement = await run('INSERT INTO requirement (req_code, title, status) VALUES (?,?,?)', 'ATTACHMENT-PREVIEW-001', '附件预览回归', '需求登记');
    const logicalItemId = 'attgrp_preview_api_test';
    const historicalPath = path.join('requirement', 'preview-api-test-v1.pdf');
    const currentPath = path.join('requirement', 'preview-api-test-v2.pdf');
    const absoluteDir = path.dirname(path.join(process.env.ATTACHMENT_DIR, historicalPath));
    fs.mkdirSync(absoluteDir, { recursive: true });
    fs.writeFileSync(path.join(process.env.ATTACHMENT_DIR, historicalPath), '%PDF-1.4\nhistorical preview fixture');
    fs.writeFileSync(path.join(process.env.ATTACHMENT_DIR, currentPath), '%PDF-1.4\ncurrent preview fixture');
    const historical = await run(
      `INSERT INTO attachment
        (entity_type, entity_id, field_key, kind, filename, stored_path, size, uploader, uploader_name,
         uploader_phone, logical_item_id, version_no, is_current, is_deleted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      'requirement', requirement.lastInsertRowid, '预览测试', 'file', '预览测试-v1.pdf', historicalPath, 33,
      '测试管理员', '测试管理员', '13912345678', logicalItemId, 1, 0, 0,
    );
    const attachment = await run(
      `INSERT INTO attachment
        (entity_type, entity_id, field_key, kind, filename, stored_path, size, uploader, uploader_name,
         uploader_phone, logical_item_id, version_no, is_current, is_deleted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      'requirement', requirement.lastInsertRowid, '预览测试', 'file', '预览测试-v2.pdf', currentPath, 30,
      '测试管理员', '测试管理员', '13912345678', logicalItemId, 2, 1, 0,
    );
    const configured = await app.inject({
      method: 'PUT', url: '/api/settings/app-config', headers,
      payload: { items: { 'deliverable.preview.enabled': 'true', 'deliverable.preview.kkFileViewBaseUrl': 'http://127.0.0.1:8012/preview' } },
    });
    assert.equal(configured.statusCode, 200, configured.body);

    const session = await app.inject({ method: 'POST', url: `/api/attachments/${historical.lastInsertRowid}/preview-session`, headers, payload: {} });
    assert.equal(session.statusCode, 200, session.body);
    const previewUrl = session.json().data.previewUrl;
    assert.match(previewUrl, /^\/preview\/onlinePreview\?url=/);
    assert.ok(!previewUrl.includes('127.0.0.1'));
    const previewUrlParts = new URL(previewUrl, 'http://radar.example.test');
    assert.equal(previewUrlParts.pathname, '/preview/onlinePreview');
    const sourceUrl = new URL(Buffer.from(previewUrlParts.searchParams.get('url'), 'base64').toString('utf8'));
    const streamed = await app.inject({ method: 'GET', url: `${sourceUrl.pathname}${sourceUrl.search}` });
    assert.equal(streamed.statusCode, 200, streamed.body);
    assert.match(streamed.headers['content-disposition'], /filename\*=UTF-8''/);
    assert.match(streamed.body, /historical preview fixture/);

    const historicalDownload = await app.inject({ method: 'GET', url: `/api/attachments/${historical.lastInsertRowid}/download`, headers });
    assert.equal(historicalDownload.statusCode, 200, historicalDownload.body);
    assert.match(historicalDownload.body, /historical preview fixture/);

    const currentSession = await app.inject({ method: 'POST', url: `/api/attachments/${attachment.lastInsertRowid}/preview-session`, headers, payload: {} });
    assert.equal(currentSession.statusCode, 200, currentSession.body);
    assert.match(currentSession.json().data.previewUrl, /^\/preview\/onlinePreview\?url=/);

    const rootConfigured = await app.inject({
      method: 'PUT', url: '/api/settings/app-config', headers,
      payload: { items: { 'deliverable.preview.kkFileViewBaseUrl': 'http://127.0.0.1:8012' } },
    });
    assert.equal(rootConfigured.statusCode, 200, rootConfigured.body);
    const directSession = await app.inject({ method: 'POST', url: `/api/attachments/${attachment.lastInsertRowid}/preview-session`, headers, payload: {} });
    assert.equal(directSession.statusCode, 200, directSession.body);
    assert.match(directSession.json().data.previewUrl, /^\/onlinePreview\?url=/);

    const tampered = new URL(sourceUrl);
    tampered.searchParams.set('signature', 'tampered');
    const rejected = await app.inject({ method: 'GET', url: `${tampered.pathname}${tampered.search}` });
    assert.equal(rejected.statusCode, 404);
  });
}

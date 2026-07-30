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

  const { runMigrations } = await import('../src/platform/persistence/migrate.js');
  const { runSeed } = await import('../src/bootstrap/seed.js');
  const { buildApp } = await import('../src/app.js');
  const { get, all, run, closeDb } = await import('../src/platform/persistence/engine/index.js');
  const { claimRequirementCode, generateRequirementCode, previewRequirementCode } = await import('../src/modules/requirements/index.js');
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

  test('task-status：四类任务列表返回统一的全链路任务状态，且保留各自状态字段', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const requirementCode = 'TASK-STATUS-REQ-001';
    const ticketCode = 'TASK-STATUS-TICKET-001';

    await run('INSERT INTO requirement (req_code, title, status, release_point_id) VALUES (?,?,?,?)',
      requirementCode, '任务状态需求', '需求分析完成', releasePoint.id);
    await run('INSERT INTO ticket (ticket_code, title, status, release_point_id) VALUES (?,?,?,?)',
      ticketCode, '任务状态工单', '需求分析完成', releasePoint.id);
    for (const code of [requirementCode, ticketCode]) {
      await run('INSERT INTO dev_task (req_code, task_code, task_name, status) VALUES (?,?,?,?)',
        code, `DEV-${code}`, '开发任务', '开发完成');
      await run('INSERT INTO test_task (req_code, task_code, task_name, test_type, status) VALUES (?,?,?,?,?)',
        code, `UAT-${code}`, '用户测试任务', 'UAT', '测试执行');
    }

    const requirementList = await app.inject({
      method: 'POST', url: '/api/requirements/list', headers, payload: { releasePointIds: [releasePoint.id], pageSize: 100 },
    });
    const ticketList = await app.inject({
      method: 'POST', url: '/api/tickets/list', headers, payload: { releasePointIds: [releasePoint.id], pageSize: 100 },
    });
    const devList = await app.inject({
      method: 'POST', url: '/api/dev-tasks/list', headers, payload: { releasePointIds: [releasePoint.id], pageSize: 100 },
    });
    const testList = await app.inject({
      method: 'POST', url: '/api/test-tasks/list', headers, payload: { releasePointIds: [releasePoint.id], testType: 'UAT', pageSize: 100 },
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

  test('阶段配置初始种子使用已确认的输入项与交付件布局、必填规则', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const token = await app.jwt.sign({ id: administrator.id, phone: administrator.phone });
    const headers = { authorization: `Bearer ${token}`, 'x-requested-by': 'RADAR' };

    const expectedLayouts = {
      requirement: [['basic', 'left'], ['systems', 'right'], ['owners', 'right'], ['extension', 'right'], ['deliverables', 'right']],
      ticket: [['basic', 'left'], ['systems', 'right'], ['owners', 'right'], ['extension', 'right'], ['deliverables', 'right']],
      dev: [['task', 'left'], ['impact', 'right'], ['schedule', 'left'], ['deliverables', 'right'], ['extension', 'right']],
      'test.SIT': [['task', 'left'], ['coverage', 'right'], ['schedule', 'left'], ['deliverables', 'right'], ['extension', 'right']],
      'test.UAT': [['task', 'left'], ['schedule', 'left'], ['deliverables', 'right'], ['extension', 'right']],
      'test.NFT': [['task', 'left'], ['schedule', 'left'], ['deliverables', 'right'], ['extension', 'right']],
      'test.SEC': [['task', 'left'], ['schedule', 'left'], ['deliverables', 'right'], ['extension', 'right']],
      release_apply: [['references', 'left'], ['content', 'left'], ['change', 'right'], ['deliverables', 'right'], ['extension', 'right'], ['artifacts', 'full']],
      release: [['basic', 'left'], ['signoff', 'left'], ['release_info', 'right'], ['deliverables', 'right'], ['extension', 'left'], ['artifacts', 'right']],
    };
    for (const [scopeKey, expected] of Object.entries(expectedLayouts)) {
      const response = await app.inject({ method: 'GET', url: `/api/settings/stage-content/${scopeKey}`, headers });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(
        response.json().data.sections.map((section) => [section.section_key, section.layout_mode]),
        expected,
        `${scopeKey} 的初始分区顺序与列位置应与详情页一致`,
      );
    }

    const releaseApply = await app.inject({ method: 'GET', url: '/api/settings/stage-content/release_apply', headers });
    const releaseApplySections = new Map(releaseApply.json().data.sections.map((section) => [section.section_key, section]));
    assert.equal(releaseApplySections.get('artifacts').collapsed, 1);

    const release = await app.inject({ method: 'GET', url: '/api/settings/stage-content/release', headers });
    const releasePlan = release.json().data.deliverables.find((item) => item.label === '投产变更方案');
    const releaseFinalStatuses = release.json().data.statuses.filter((status) => status.state_type === 'final');
    assert.equal(releasePlan.rules[releaseFinalStatuses[0].id], true);
    assert.equal(releasePlan.rules[releaseFinalStatuses[1].id], true);
  });

  test('priority：需求与工单默认中、固定枚举、列表筛选与仪表盘维度一致', async () => {
    const administrator = await get('SELECT id, phone FROM user WHERE is_super = 1 LIMIT 1');
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    const headers = { authorization: `Bearer ${await app.jwt.sign({ id: administrator.id, phone: administrator.phone })}`, 'x-requested-by': 'RADAR' };
    const requirementCode = 'PRIORITY-REQ-001';
    const ticketCode = 'PRIORITY-TICKET-001';

    const requirement = await run('INSERT INTO requirement (req_code, title, status, release_point_id, priority) VALUES (?,?,?,?,?)', requirementCode, '优先级需求', '需求登记', releasePoint.id, '高');
    const ticket = await run('INSERT INTO ticket (ticket_code, title, status, release_point_id) VALUES (?,?,?,?)', ticketCode, '优先级工单', '工单登记', releasePoint.id);
    assert.equal((await get('SELECT priority FROM ticket WHERE ticket_code = ?', ticketCode)).priority, '中');

    const requirementConfig = await app.inject({ method: 'GET', url: '/api/settings/stage-content/requirement', headers });
    const ticketConfig = await app.inject({ method: 'GET', url: '/api/settings/stage-content/ticket', headers });
    let requirementPriority;
    for (const response of [requirementConfig, ticketConfig]) {
      assert.equal(response.statusCode, 200);
      const priority = response.json().data.fields.find((field) => field.field_key === 'priority');
      if (response === requirementConfig) requirementPriority = priority;
      assert.equal(priority.field_kind, 'native');
      assert.equal(priority.source_key, 'priority');
      assert.equal(priority.visible, 1);
      assert.equal(priority.list_visible, 1);
      assert.equal(priority.filterable, 1);
      assert.equal(priority.dashboard_dimension, 1);
    }

    const requirementList = await app.inject({
      method: 'POST', url: '/api/requirements/list', headers,
      payload: { releasePointIds: [releasePoint.id], pageSize: 100, filters: [{ field: 'priority', op: 'in', value: ['高'] }] },
    });
    assert.equal(requirementList.statusCode, 200);
    assert.equal(requirementList.json().data.list.find((row) => row.req_code === requirementCode).priority, '高');

    for (const [url, id, expected] of [
      [`/api/requirements/${requirement.lastInsertRowid}`, requirement.lastInsertRowid, '高'],
      [`/api/tickets/${ticket.lastInsertRowid}`, ticket.lastInsertRowid, '中'],
    ]) {
      const invalid = await app.inject({ method: 'PUT', url, headers, payload: { priority: '紧急' } });
      assert.equal(invalid.statusCode, 400);
      const table = url.includes('/requirements/') ? 'requirement' : 'ticket';
      assert.equal((await get(`SELECT priority FROM ${table} WHERE id = ?`, id)).priority, expected);
    }

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

    const disabled = await app.inject({
      method: 'PUT', url: `/api/settings/stage-content/requirement/fields/${requirementPriority.id}`, headers,
      payload: { ...requirementPriority, visible: false, list_visible: false, filterable: false, dashboard_dimension: false },
    });
    assert.equal(disabled.statusCode, 200);
    const refreshedDimensions = await app.inject({ method: 'GET', url: '/api/dashboard/dimensions', headers });
    assert.equal(refreshedDimensions.statusCode, 200);
    assert.equal(refreshedDimensions.json().data.dimsBySource.analytics.some((dimension) => dimension.key === 'native:requirement:priority'), false);
    assert.ok(refreshedDimensions.json().data.dimsBySource.analytics.some((dimension) => dimension.key === 'native:ticket:priority'));

    const { normalizePriority } = await import('../src/modules/settings/process-configuration/index.js');
    assert.equal(normalizePriority(undefined), '中');
    assert.equal(normalizePriority(' 低 '), '低');
    assert.throws(() => normalizePriority('紧急'), /仅支持高、中、低/);
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
      payload: { items: { 'code.requirement': 'RC_{投产窗口}_{序号}' } },
    });
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

  test('业务编号预览：未保存不占号，保存确认后才推进序列', async () => {
    const releasePoint = await get('SELECT id FROM release_point ORDER BY id LIMIT 1');
    const releaseWindow = '20990102';
    await run(
      `INSERT INTO requirement (req_code, title, status, release_point_id)
       VALUES (?,?,?,?)`,
      `RC_${releaseWindow}_004`, '编号预览历史记录', '待分析', releasePoint.id,
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
      `INSERT INTO requirement (req_code, title, status, release_point_id)
       VALUES (?,?,?,?)`,
      claimed, '编号预览保存记录', '待分析', releasePoint.id,
    );
    assert.equal(await previewRequirementCode(releaseWindow), `RC_${releaseWindow}_006`);
  });
}

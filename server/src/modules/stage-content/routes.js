/**
 * 文件：modules/stage-content/routes.js
 * 用途：阶段内容与公共交付件接口。系统设置通过本模块维护配置；业务详情页通过
 *       公共读取接口获取动态字段、交付件与扩展字段值。
 * 作者：Codex
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { all, get, run } from '../../db/index.js';
import { config } from '../../config.js';
import { ok, badRequest } from '../../lib/http.js';
import {
  deleteDeliverableDefinition,
  deleteFieldDefinition,
  deleteSection,
  getExtensionValues,
  getStageContentConfig,
  getStageScope,
  listStageScopes,
  listStageStatuses,
  listFieldSourceOptions,
  recordConfigRevision,
  saveDeliverableDefinition,
  saveExtensionValues,
  saveFieldDefinition,
  saveSection,
} from '../../lib/stage-content.js';

/** 仅暴露经过注册的下拉数据源，禁止配置端传入任意 SQL 或表名。 */
async function listSource(sourceKey, keyword = '') {
  const like = `%${String(keyword).trim()}%`;
  if (sourceKey === 'person') {
    const rows = await all('SELECT id, name, phone, status FROM user WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 50', like, like);
    return rows.map((row) => ({ value: row.id, label: `${row.name}(${row.phone})`, ...row }));
  }
  if (sourceKey === 'release_point') {
    const rows = await all("SELECT id, release_date, version_type FROM release_point WHERE release_date LIKE ? OR COALESCE(version_type, '') LIKE ? ORDER BY release_date DESC LIMIT 50", like, like);
    return rows.map((row) => ({ value: row.id, label: `${row.release_date}${row.version_type ? ` / ${row.version_type}` : ''}`, ...row }));
  }
  if (sourceKey === 'system') {
    const rows = await all('SELECT sys_code, sys_name, org, sector FROM system WHERE sys_code LIKE ? OR sys_name LIKE ? ORDER BY sort, sys_code LIMIT 50', like, like);
    return rows.map((row) => ({ value: row.sys_code, label: `${row.sys_code} ${row.sys_name}`, ...row }));
  }
  if (sourceKey.startsWith('dict:')) {
    const category = sourceKey.slice(5);
    return await all(
      `SELECT attr_value AS value, COALESCE(display_value, attr_value) AS label
         FROM dict_item WHERE category = ? AND (attr_value LIKE ? OR display_value LIKE ?) ORDER BY sort, id LIMIT 50`, category, like, like,
    );
  }
  throw badRequest('不支持的数据源');
}

async function assertScopePermission(fastify, request, scopeKey, action) {
  const scope = await getStageScope(scopeKey);
  await fastify.requirePerm(scope.permission_module, action)(request);
  return scope;
}

export default async function stageContentRoutes(fastify) {
  // 业务表单读取：只需登录，真实编辑权限仍由各业务模块保存接口控制。
  fastify.get('/stage-content/scopes', { preHandler: fastify.authenticate }, async () => ok(await listStageScopes()));
  fastify.get('/stage-content/:scopeKey/schema', { preHandler: fastify.authenticate }, async (request) => {
    return ok(await getStageContentConfig(request.params.scopeKey));
  });
  fastify.get('/stage-content/:scopeKey/entities/:entityId/values', { preHandler: fastify.authenticate }, async (request) => {
    return ok(await getExtensionValues(request.params.scopeKey, Number(request.params.entityId)));
  });
  fastify.put('/stage-content/:scopeKey/entities/:entityId/values', { preHandler: fastify.authenticate }, async (request) => {
    await assertScopePermission(fastify, request, request.params.scopeKey, 'edit');
    return ok(await saveExtensionValues(request.params.scopeKey, Number(request.params.entityId), request.body?.values || {}, request.currentUser?.name));
  });
  fastify.get('/stage-content/sources/:sourceKey', { preHandler: fastify.authenticate }, async (request) => {
    return ok(await listSource(request.params.sourceKey, request.query?.keyword));
  });
  // 上传模板仅保存静态 DOCX/XLSX；复杂模板由后续注册的处理器负责，不在这里做变量替换。
  fastify.get('/stage-content/deliverables/:id/template', { preHandler: fastify.authenticate }, async (request, reply) => {
    const template = await get(`SELECT * FROM deliverable_template_version
      WHERE deliverable_definition_id = ? AND enabled = 1 AND deleted_at IS NULL ORDER BY version_no DESC, id DESC LIMIT 1`, Number(request.params.id));
    if (!template) throw badRequest('该交付件未配置可下载模板');
    if (template.template_mode === 'custom') throw badRequest('该模板需由定制处理器下载');
    const abs = path.join(config.attachmentDir, template.stored_path || '');
    if (!template.stored_path || !fs.existsSync(abs)) throw badRequest('模板文件不存在');
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(template.filename || '模板')}`);
    return reply.send(fs.createReadStream(abs));
  });

  // 系统设置配置接口。
  fastify.get('/settings/stage-content/scopes', { preHandler: fastify.requirePerm('settings', 'view') }, async () => ok(await listStageScopes()));
  fastify.get('/settings/stage-content/sources', { preHandler: fastify.requirePerm('settings', 'view') }, async () => ok(await listFieldSourceOptions()));
  fastify.get('/settings/stage-content/:scopeKey', { preHandler: fastify.requirePerm('settings', 'view') }, async (request) => {
    return ok(await getStageContentConfig(request.params.scopeKey));
  });
  fastify.get('/settings/stage-content/:scopeKey/statuses', { preHandler: fastify.requirePerm('settings', 'view') }, async (request) => {
    return ok(await listStageStatuses(request.params.scopeKey));
  });
  fastify.post('/settings/stage-content/:scopeKey/sections', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    return ok(await saveSection(request.params.scopeKey, request.body || {}, request.currentUser?.name));
  });
  fastify.delete('/settings/stage-content/:scopeKey/sections/:id', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    await deleteSection(request.params.scopeKey, Number(request.params.id), request.currentUser?.name);
    return ok(null, '分区已删除');
  });
  fastify.post('/settings/stage-content/:scopeKey/fields', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    return ok(await saveFieldDefinition(request.params.scopeKey, request.body || {}, request.currentUser?.name));
  });
  fastify.put('/settings/stage-content/:scopeKey/fields/:id', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    return ok(await saveFieldDefinition(request.params.scopeKey, { ...(request.body || {}), id: Number(request.params.id) }, request.currentUser?.name));
  });
  fastify.delete('/settings/stage-content/:scopeKey/fields/:id', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    await deleteFieldDefinition(request.params.scopeKey, Number(request.params.id), request.currentUser?.name);
    return ok(null, '输入项已删除');
  });

  fastify.post('/settings/stage-deliverables/:scopeKey', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    return ok(await saveDeliverableDefinition(request.params.scopeKey, request.body || {}, request.currentUser?.name));
  });
  fastify.put('/settings/stage-deliverables/:scopeKey/:id', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    return ok(await saveDeliverableDefinition(request.params.scopeKey, { ...(request.body || {}), id: Number(request.params.id) }, request.currentUser?.name));
  });
  fastify.delete('/settings/stage-deliverables/:scopeKey/:id', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    await deleteDeliverableDefinition(request.params.scopeKey, Number(request.params.id), request.currentUser?.name);
    return ok(null, '交付件已删除');
  });
  fastify.post('/settings/stage-deliverables/:scopeKey/:id/templates/upload', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    const deliverable = await get('SELECT * FROM deliverable_definition WHERE id = ? AND scope_key = ? AND deleted_at IS NULL', Number(request.params.id), request.params.scopeKey);
    if (!deliverable) throw badRequest('交付件不存在');
    const file = await request.file();
    if (!file) throw badRequest('请选择模板文件');
    const ext = path.extname(file.filename || '').toLowerCase();
    if (!['.docx', '.xlsx'].includes(ext)) throw badRequest('模板仅支持 DOCX 或 XLSX 文件');
    const buffer = await file.toBuffer();
    const dir = path.join(config.attachmentDir, 'templates', String(deliverable.id));
    fs.mkdirSync(dir, { recursive: true });
    const filename = path.basename(file.filename).replace(/[/\\?%*:|"<>]/g, '_');
    const storedName = `${randomBytes(8).toString('hex')}_${filename}`;
    const relPath = path.join('templates', String(deliverable.id), storedName);
    fs.writeFileSync(path.join(config.attachmentDir, relPath), buffer);
    const last = await get('SELECT MAX(version_no) AS n FROM deliverable_template_version WHERE deliverable_definition_id = ?', deliverable.id);
    await run('UPDATE deliverable_template_version SET enabled = 0 WHERE deliverable_definition_id = ? AND template_mode = ?', deliverable.id, 'upload');
    const res = await run(`INSERT INTO deliverable_template_version (deliverable_definition_id, template_mode, filename, stored_path, size, version_no, enabled, uploader)
      VALUES (?,?,?,?,?,?,1,?)`, deliverable.id, 'upload', filename, relPath, buffer.length, Number(last?.n || 0) + 1, request.currentUser?.name);
    await recordConfigRevision(request.params.scopeKey, 'deliverable', request.currentUser?.name);
    return ok({ id: res.lastInsertRowid, filename, version_no: Number(last?.n || 0) + 1 }, '模板已上传');
  });
}

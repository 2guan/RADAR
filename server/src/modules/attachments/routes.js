/**
 * 文件：modules/attachments/routes.js
 * 用途：附件接口。上传文件、登记路径、按实体读取、下载、删除。
 * 作者：hengguan
 * 说明：上传走 multipart，校验扩展名与大小；下载按相对路径回读磁盘。
 */

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { get, run } from '../../db/index.js';
import { saveFile, savePath, listByEntity, removeAttachment } from '../../lib/attachment.js';
import { ok, badRequest, notFound } from '../../lib/http.js';

function getEntityCode(entityType, entityId) {
  if (entityType === 'requirement') {
    const row = get('SELECT req_code FROM requirement WHERE id = ?', entityId);
    return row?.req_code || null;
  }
  if (entityType === 'dev') {
    const row = get('SELECT task_code FROM dev_task WHERE id = ?', entityId);
    return row?.task_code || null;
  }
  if (entityType === 'test') {
    const row = get('SELECT task_code FROM test_task WHERE id = ?', entityId);
    return row?.task_code || null;
  }
  return null;
}

function logAttachmentChange({ entityType, entityId, fieldKey, action, operator, oldValue, newValue }) {
  const entityCode = getEntityCode(entityType, entityId);
  run(
    `INSERT INTO audit_log (entity_type, entity_id, entity_code, action, operator, field, old_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    entityType, entityId, entityCode, action, operator, fieldKey, oldValue, newValue
  );
}

export default async function attachmentRoutes(fastify) {
  // 读取某实体的附件
  fastify.get('/attachments', { preHandler: fastify.authenticate }, async (request) => {
    const { entityType, entityId } = request.query;
    if (!entityType || !entityId) throw badRequest('参数缺失');
    return ok(listByEntity(entityType, Number(entityId)));
  });

  // 上传文件
  fastify.post('/attachments/upload', { preHandler: fastify.authenticate }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const entityType = data.fields?.entityType?.value;
    const entityId = data.fields?.entityId?.value;
    const fieldKey = data.fields?.fieldKey?.value;
    if (!entityType || !entityId || !fieldKey) throw badRequest('实体信息缺失');
    const buffer = await data.toBuffer();
    const rec = saveFile({
      entityType, entityId: Number(entityId), fieldKey,
      filename: data.filename, buffer, uploader: request.currentUser?.name,
    });
    logAttachmentChange({
      entityType, entityId: Number(entityId), fieldKey,
      action: 'update', operator: request.currentUser?.name,
      oldValue: null, newValue: `[文件] ${rec.filename}`
    });
    return ok(rec);
  });

  // 登记路径
  fastify.post('/attachments/path', { preHandler: fastify.authenticate }, async (request) => {
    const { entityType, entityId, fieldKey, pathText } = request.body || {};
    if (!entityType || !entityId || !fieldKey) throw badRequest('实体信息缺失');
    const rec = savePath({
      entityType, entityId: Number(entityId), fieldKey, pathText, uploader: request.currentUser?.name,
    });
    logAttachmentChange({
      entityType, entityId: Number(entityId), fieldKey,
      action: 'update', operator: request.currentUser?.name,
      oldValue: null, newValue: `[路径] ${rec.path_text}`
    });
    return ok(rec);
  });

  // 下载
  fastify.get('/attachments/:id/download', { preHandler: fastify.authenticate }, async (request, reply) => {
    const a = get('SELECT * FROM attachment WHERE id = ?', request.params.id);
    if (!a || a.kind !== 'file') throw notFound('文件不存在');
    const abs = path.join(config.attachmentDir, a.stored_path);
    if (!fs.existsSync(abs)) throw notFound('文件已丢失');
    reply.header('Content-Disposition', `attachment; filename=${encodeURIComponent(a.filename)}`);
    return reply.send(fs.createReadStream(abs));
  });

  // 修改路径
  fastify.post('/attachments/edit-path', { preHandler: fastify.authenticate }, async (request) => {
    const { id, pathText } = request.body || {};
    if (!id || !pathText) throw badRequest('参数缺失');
    const old = get('SELECT * FROM attachment WHERE id = ?', id);
    if (!old) throw notFound('记录不存在');
    if (old.kind !== 'path') throw badRequest('只能修改路径型附件');
    run('UPDATE attachment SET path_text = ? WHERE id = ?', pathText, id);
    logAttachmentChange({
      entityType: old.entity_type, entityId: old.entity_id, fieldKey: old.field_key,
      action: 'update', operator: request.currentUser?.name,
      oldValue: `[路径] ${old.path_text}`, newValue: `[路径] ${pathText.trim()}`
    });
    return ok({ id });
  });

  // 删除
  fastify.delete('/attachments/:id', { preHandler: fastify.authenticate }, async (request) => {
    const id = Number(request.params.id);
    const a = get('SELECT * FROM attachment WHERE id = ?', id);
    if (a) {
      logAttachmentChange({
        entityType: a.entity_type, entityId: a.entity_id, fieldKey: a.field_key,
        action: 'update', operator: request.currentUser?.name,
        oldValue: a.kind === 'file' ? `[文件] ${a.filename}` : `[路径] ${a.path_text}`,
        newValue: '已删除'
      });
      removeAttachment(id);
    }
    return ok(null, '已删除');
  });
}

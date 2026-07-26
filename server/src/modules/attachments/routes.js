/**
 * 文件：modules/attachments/routes.js
 * 说明：上传走 multipart，校验扩展名与大小；下载按相对路径回读磁盘。
 * 用途：附件接口。上传文件、登记路径、按实体读取、下载、删除。
 * 作者：hengguan
 */

import fs from 'node:fs';
import { get, run } from '../../platform/persistence/index.js';
import {
  listByEntity, removeAttachment, resolveAttachmentPath, saveFile, savePath,
} from '../../platform/attachments/index.js';
import {
  assertAttachmentInputAllowed, assertDeliverableInputAllowed, assertDeliverableRemovable,
} from '../process-configuration/index.js';
import { ok, badRequest, notFound } from '../../platform/runtime/index.js';
import { authorizeEntity } from '../../platform/auth/index.js';
import { auditEvidenceChange } from '../../platform/audit/index.js';

async function getEntityCode(entityType, entityId) {
  if (entityType === 'requirement') {
    const row = await get('SELECT req_code FROM requirement WHERE id = ?', entityId);
    return row?.req_code || null;
  }
  if (entityType === 'ticket') {
    const row = await get('SELECT ticket_code FROM ticket WHERE id = ?', entityId);
    return row?.ticket_code || null;
  }
  if (entityType === 'dev') {
    const row = await get('SELECT task_code FROM dev_task WHERE id = ?', entityId);
    return row?.task_code || null;
  }
  if (entityType === 'test') {
    const row = await get('SELECT task_code FROM test_task WHERE id = ?', entityId);
    return row?.task_code || null;
  }
  if (entityType === 'release') {
    const row = await get('SELECT req_code FROM release_task WHERE id = ?', entityId);
    return row?.req_code || null;
  }
  if (entityType === 'release_apply') {
    const row = await get('SELECT change_code FROM release_apply WHERE id = ?', entityId);
    return row?.change_code || null;
  }
  return null;
}

async function logAttachmentChange({ entityType, entityId, fieldKey, operator, oldValue, newValue }) {
  const entityCode = await getEntityCode(entityType, entityId);
  await auditEvidenceChange({ entityType, entityId, entityCode, fieldKey, operator, oldValue, newValue });
}

export default async function attachmentRoutes(fastify) {
  // 读取某实体的附件
  fastify.get('/attachments', { preHandler: fastify.authenticate }, async (request) => {
    const { entityType, entityId } = request.query;
    if (!entityType || !entityId) throw badRequest('参数缺失');
    await authorizeEntity(fastify, request, entityType, entityId, 'view');
    return ok(await listByEntity(entityType, Number(entityId)));
  });

  // 上传文件
  fastify.post('/attachments/upload', { preHandler: fastify.authenticate }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const entityType = data.fields?.entityType?.value;
    const entityId = data.fields?.entityId?.value;
    const fieldKey = data.fields?.fieldKey?.value;
    const deliverableId = data.fields?.deliverableId?.value ? Number(data.fields.deliverableId.value) : null;
    if (!entityType || !entityId || (!fieldKey && !deliverableId)) throw badRequest('实体信息缺失');
    await authorizeEntity(fastify, request, entityType, entityId, 'edit');
    if (deliverableId) await assertDeliverableInputAllowed({ entityType, entityId: Number(entityId), deliverableId, kind: 'file' });
    else await assertAttachmentInputAllowed(entityType, Number(entityId), fieldKey, 'file');
    const buffer = await data.toBuffer();
    const rec = await saveFile({
      entityType, entityId: Number(entityId), fieldKey: fieldKey || `deliverable:${deliverableId}`, deliverableId,
      filename: data.filename, buffer, uploader: request.currentUser?.name,
    });
    await logAttachmentChange({
      entityType, entityId: Number(entityId), fieldKey: fieldKey || `deliverable:${deliverableId}`,
      action: 'update', operator: request.currentUser?.name,
      oldValue: null, newValue: `[文件] ${rec.filename}`
    });
    return ok(rec);
  });

  // 登记路径
  fastify.post('/attachments/path', { preHandler: fastify.authenticate }, async (request) => {
    const { entityType, entityId, fieldKey, deliverableId: rawDeliverableId, pathText } = request.body || {};
    const deliverableId = rawDeliverableId ? Number(rawDeliverableId) : null;
    if (!entityType || !entityId || (!fieldKey && !deliverableId)) throw badRequest('实体信息缺失');
    await authorizeEntity(fastify, request, entityType, entityId, 'edit');
    if (deliverableId) await assertDeliverableInputAllowed({ entityType, entityId: Number(entityId), deliverableId, kind: 'path' });
    else await assertAttachmentInputAllowed(entityType, Number(entityId), fieldKey, 'path');
    const rec = await savePath({
      entityType, entityId: Number(entityId), fieldKey: fieldKey || `deliverable:${deliverableId}`, deliverableId, pathText, uploader: request.currentUser?.name,
    });
    await logAttachmentChange({
      entityType, entityId: Number(entityId), fieldKey: fieldKey || `deliverable:${deliverableId}`,
      action: 'update', operator: request.currentUser?.name,
      oldValue: null, newValue: `[路径] ${rec.path_text}`
    });
    return ok(rec);
  });

  // 下载
  fastify.get('/attachments/:id/download', { preHandler: fastify.authenticate }, async (request, reply) => {
    const a = await get('SELECT * FROM attachment WHERE id = ?', request.params.id);
    if (!a || a.kind !== 'file') throw notFound('文件不存在');
    await authorizeEntity(fastify, request, a.entity_type, a.entity_id, 'view');
    const abs = resolveAttachmentPath(a.stored_path);
    if (!fs.existsSync(abs)) throw notFound('文件已丢失');
    reply.header('Content-Disposition', `attachment; filename=${encodeURIComponent(a.filename)}`);
    return reply.send(fs.createReadStream(abs));
  });

  // 修改路径
  fastify.post('/attachments/edit-path', { preHandler: fastify.authenticate }, async (request) => {
    const { id, pathText } = request.body || {};
    if (!id || !pathText) throw badRequest('参数缺失');
    const old = await get('SELECT * FROM attachment WHERE id = ?', id);
    if (!old) throw notFound('记录不存在');
    if (old.kind !== 'path') throw badRequest('只能修改路径型附件');
    await authorizeEntity(fastify, request, old.entity_type, old.entity_id, 'edit');
    await run('UPDATE attachment SET path_text = ? WHERE id = ?', pathText, id);
    await logAttachmentChange({
      entityType: old.entity_type, entityId: old.entity_id, fieldKey: old.field_key,
      action: 'update', operator: request.currentUser?.name,
      oldValue: `[路径] ${old.path_text}`, newValue: `[路径] ${pathText.trim()}`
    });
    return ok({ id });
  });

  // 删除
  fastify.delete('/attachments/:id', { preHandler: fastify.authenticate }, async (request) => {
    const id = Number(request.params.id);
    const a = await get('SELECT * FROM attachment WHERE id = ?', id);
    if (a) {
      await authorizeEntity(fastify, request, a.entity_type, a.entity_id, 'edit');
      await assertDeliverableRemovable(a);
      await logAttachmentChange({
        entityType: a.entity_type, entityId: a.entity_id, fieldKey: a.field_key,
        action: 'update', operator: request.currentUser?.name,
        oldValue: a.kind === 'file' ? `[文件] ${a.filename}` : `[路径] ${a.path_text}`,
        newValue: '已删除'
      });
      await removeAttachment(id);
    }
    return ok(null, '已删除');
  });
}

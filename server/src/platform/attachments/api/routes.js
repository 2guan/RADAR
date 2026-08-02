/**
 * 文件：server/src/platform/attachments/api/routes.js
 * 说明：附件写入均保留不可变版本；预览会话与文件读取分别执行实体授权和短签名校验。
 * 用途：统一附件上传、版本、软删除、下载与 kkFileView 预览 HTTP 适配层。
 * 作者：hengguan
 */

import fs from 'node:fs';
import { get, tx } from '../../persistence/index.js';
import {
  attachmentView, createPreviewSession, getCurrentAttachment, getViewableAttachment, isPreviewableAttachment,
  listAttachmentVersions, listByEntity, removeAttachment, resolveAttachmentPath,
  previewAvailability, saveFile, saveFileVersion, savePath, savePathVersion, verifyPreviewSignature,
} from '../index.js';
import {
  assertAttachmentInputAllowed, assertDeliverableInputAllowed, assertDeliverableRemovable,
} from '../../../modules/settings/process-configuration/index.js';
import { ok, badRequest, notFound } from '../../runtime/index.js';
import { authorizeEntity } from '../../auth/index.js';
import { auditEvidenceChange } from '../../audit/index.js';

const VERSION_FIELD_NAMES = new Set(['version_no', 'versionNo']);

async function getEntityCode(entityType, entityId) {
  const lookups = {
    requirement: ['requirement', 'req_code'], ticket: ['ticket', 'ticket_code'], dev: ['dev_task', 'task_code'],
    test: ['test_task', 'task_code'], release: ['release_task', 'req_code'], release_apply: ['release_apply', 'change_code'],
  };
  const item = lookups[entityType];
  if (!item) return null;
  const row = await get(`SELECT ${item[1]} AS entity_code FROM ${item[0]} WHERE id = ?`, entityId);
  return row?.entity_code || null;
}

async function logAttachmentChange({ entityType, entityId, fieldKey, operator, oldValue, newValue }) {
  const entityCode = await getEntityCode(entityType, entityId);
  await auditEvidenceChange({ entityType, entityId, entityCode, fieldKey, operator, oldValue, newValue });
}

function uploadFieldsContainVersion(fields = {}) {
  return Object.keys(fields).some((key) => VERSION_FIELD_NAMES.has(key));
}

function assertNoVersionInput(payload = {}) {
  if (Object.keys(payload).some((key) => VERSION_FIELD_NAMES.has(key))) throw badRequest('版本号由系统生成，不能提交或修改');
}

async function assertCurrentInputAllowed(attachment) {
  if (attachment.deliverable_id) {
    await assertDeliverableInputAllowed({
      entityType: attachment.entity_type, entityId: Number(attachment.entity_id), deliverableId: attachment.deliverable_id, kind: attachment.kind,
    });
  } else {
    await assertAttachmentInputAllowed(attachment.entity_type, Number(attachment.entity_id), attachment.field_key, attachment.kind);
  }
}

function inlineFilename(filename) {
  return `inline; filename*=UTF-8''${encodeURIComponent(filename || 'attachment')}`;
}

export default async function attachmentRoutes(fastify) {
  fastify.get('/attachments', { preHandler: fastify.authenticate }, async (request) => {
    const { entityType, entityId } = request.query;
    if (!entityType || !entityId) throw badRequest('参数缺失');
    await authorizeEntity(fastify, request, entityType, entityId, 'view');
    return ok(await listByEntity(entityType, Number(entityId)));
  });

  /** 前端仅获得布尔可用性，不获取 kkFileView 地址或内部来源地址。 */
  fastify.get('/attachments/preview-availability', { preHandler: fastify.authenticate }, async () => {
    return ok({ enabled: await previewAvailability() });
  });

  fastify.post('/attachments/upload', { preHandler: fastify.authenticate }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    if (uploadFieldsContainVersion(data.fields)) throw badRequest('版本号由系统生成，不能提交或修改');
    const entityType = data.fields?.entityType?.value;
    const entityId = data.fields?.entityId?.value;
    const fieldKey = data.fields?.fieldKey?.value;
    const deliverableId = data.fields?.deliverableId?.value ? Number(data.fields.deliverableId.value) : null;
    if (!entityType || !entityId || (!fieldKey && !deliverableId)) throw badRequest('实体信息缺失');
    await authorizeEntity(fastify, request, entityType, entityId, 'edit');
    if (deliverableId) await assertDeliverableInputAllowed({ entityType, entityId: Number(entityId), deliverableId, kind: 'file' });
    else await assertAttachmentInputAllowed(entityType, Number(entityId), fieldKey, 'file');
    const buffer = await data.toBuffer();
    let rec;
    await tx(async () => {
      rec = await saveFile({
        entityType, entityId: Number(entityId), fieldKey: fieldKey || `deliverable:${deliverableId}`, deliverableId,
        filename: data.filename, buffer, uploaderName: request.currentUser?.name, uploaderPhone: request.currentUser?.phone,
      });
      await logAttachmentChange({
        entityType, entityId: Number(entityId), fieldKey: fieldKey || `deliverable:${deliverableId}`,
        operator: request.currentUser?.name, oldValue: null, newValue: `[文件 V1] ${rec.filename}`,
      });
    });
    return ok(attachmentView(rec));
  });

  fastify.post('/attachments/path', { preHandler: fastify.authenticate }, async (request) => {
    const payload = request.body || {};
    assertNoVersionInput(payload);
    const { entityType, entityId, fieldKey, deliverableId: rawDeliverableId, pathText } = payload;
    const deliverableId = rawDeliverableId ? Number(rawDeliverableId) : null;
    if (!entityType || !entityId || (!fieldKey && !deliverableId)) throw badRequest('实体信息缺失');
    await authorizeEntity(fastify, request, entityType, entityId, 'edit');
    if (deliverableId) await assertDeliverableInputAllowed({ entityType, entityId: Number(entityId), deliverableId, kind: 'path' });
    else await assertAttachmentInputAllowed(entityType, Number(entityId), fieldKey, 'path');
    let rec;
    await tx(async () => {
      rec = await savePath({
        entityType, entityId: Number(entityId), fieldKey: fieldKey || `deliverable:${deliverableId}`, deliverableId, pathText,
        uploaderName: request.currentUser?.name, uploaderPhone: request.currentUser?.phone,
      });
      await logAttachmentChange({
        entityType, entityId: Number(entityId), fieldKey: fieldKey || `deliverable:${deliverableId}`,
        operator: request.currentUser?.name, oldValue: null, newValue: `[路径 V1] ${rec.path_text}`,
      });
    });
    return ok(attachmentView(rec));
  });

  fastify.get('/attachments/:id/versions', { preHandler: fastify.authenticate }, async (request) => {
    const attachment = await get('SELECT * FROM attachment WHERE id = ?', request.params.id);
    if (!attachment) throw notFound('交付件不存在');
    await authorizeEntity(fastify, request, attachment.entity_type, attachment.entity_id, 'view');
    return ok(await listAttachmentVersions(attachment.logical_item_id));
  });

  fastify.post('/attachments/:id/versions', { preHandler: fastify.authenticate }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    if (uploadFieldsContainVersion(data.fields)) throw badRequest('版本号由系统生成，不能提交或修改');
    const current = await getCurrentAttachment(request.params.id);
    if (!current) throw notFound('当前交付件不存在或已更新');
    await authorizeEntity(fastify, request, current.entity_type, current.entity_id, 'edit');
    await assertCurrentInputAllowed(current);
    const buffer = await data.toBuffer();
    const rec = await saveFileVersion({
      id: current.id, filename: data.filename, buffer, uploaderName: request.currentUser?.name, uploaderPhone: request.currentUser?.phone,
      onCreated: async (created) => logAttachmentChange({
        entityType: current.entity_type, entityId: current.entity_id, fieldKey: current.field_key, operator: request.currentUser?.name,
        oldValue: `[文件 V${current.version_no}] ${current.filename}`, newValue: `[文件 V${created.version_no}] ${created.filename}`,
      }),
    });
    return ok(attachmentView(rec));
  });

  async function createPathVersion(request) {
    const payload = request.body || {};
    assertNoVersionInput(payload);
    const current = await getCurrentAttachment(request.params.id || payload.id);
    if (!current) throw notFound('当前交付件不存在或已更新');
    await authorizeEntity(fastify, request, current.entity_type, current.entity_id, 'edit');
    await assertCurrentInputAllowed(current);
    const rec = await savePathVersion({
      id: current.id, pathText: payload.pathText, uploaderName: request.currentUser?.name, uploaderPhone: request.currentUser?.phone,
      onCreated: async (created) => logAttachmentChange({
        entityType: current.entity_type, entityId: current.entity_id, fieldKey: current.field_key, operator: request.currentUser?.name,
        oldValue: `[路径 V${current.version_no}] ${current.path_text}`, newValue: `[路径 V${created.version_no}] ${created.path_text}`,
      }),
    });
    return ok(attachmentView(rec));
  }

  fastify.post('/attachments/:id/path-versions', { preHandler: fastify.authenticate }, createPathVersion);
  // 保持历史客户端兼容：原“编辑路径”现在产生版本，而非覆盖旧记录。
  fastify.post('/attachments/edit-path', { preHandler: fastify.authenticate }, createPathVersion);

  fastify.post('/attachments/:id/preview-session', { preHandler: fastify.authenticate }, async (request) => {
    const attachment = await getViewableAttachment(request.params.id);
    if (!attachment) throw notFound('交付件版本不存在');
    await authorizeEntity(fastify, request, attachment.entity_type, attachment.entity_id, 'view');
    return ok(await createPreviewSession(attachment));
  });

  /** kkFileView 的短签名拉取端点：不依赖用户 Cookie，但只返回单个未删除文件版本。 */
  fastify.get('/attachments/:id/preview-file', async (request, reply) => {
    const attachment = await getViewableAttachment(request.params.id);
    if (!attachment || !isPreviewableAttachment(attachment)) throw notFound('预览文件不存在');
    if (!verifyPreviewSignature(attachment.id, request.query?.expires, request.query?.signature)) throw notFound('预览链接已失效');
    const absolutePath = resolveAttachmentPath(attachment.stored_path);
    if (!fs.existsSync(absolutePath)) throw notFound('文件已丢失');
    reply.header('Content-Disposition', inlineFilename(attachment.filename));
    reply.header('Cache-Control', 'private, no-store');
    return reply.send(fs.createReadStream(absolutePath));
  });

  fastify.get('/attachments/:id/download', { preHandler: fastify.authenticate }, async (request, reply) => {
    const attachment = await getViewableAttachment(request.params.id);
    if (!attachment || attachment.kind !== 'file') throw notFound('文件不存在');
    await authorizeEntity(fastify, request, attachment.entity_type, attachment.entity_id, 'view');
    const absolutePath = resolveAttachmentPath(attachment.stored_path);
    if (!fs.existsSync(absolutePath)) throw notFound('文件已丢失');
    reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.filename || 'attachment')}`);
    return reply.send(fs.createReadStream(absolutePath));
  });

  fastify.delete('/attachments/:id', { preHandler: fastify.authenticate }, async (request) => {
    const current = await getCurrentAttachment(request.params.id);
    if (!current) return ok(null, '已删除');
    await authorizeEntity(fastify, request, current.entity_type, current.entity_id, 'edit');
    await assertDeliverableRemovable(current);
    await removeAttachment(current.id, {
      onRemoved: async (removed) => logAttachmentChange({
        entityType: removed.entity_type, entityId: removed.entity_id, fieldKey: removed.field_key, operator: request.currentUser?.name,
        oldValue: `[${removed.kind === 'file' ? '文件' : '路径'} V${removed.version_no}] ${removed.filename || removed.path_text}`,
        newValue: '逻辑交付项已删除',
      }),
    });
    return ok(null, '已删除');
  });
}

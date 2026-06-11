/**
 * 文件：modules/attachments/routes.js
 * 用途：附件接口。上传文件、登记路径、按实体读取、下载、删除。
 * 作者：hengguan
 * 说明：上传走 multipart，校验扩展名与大小；下载按相对路径回读磁盘。
 */

import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { get } from '../../db/index.js';
import { saveFile, savePath, listByEntity, removeAttachment } from '../../lib/attachment.js';
import { ok, badRequest, notFound } from '../../lib/http.js';

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
    return ok(rec);
  });

  // 登记路径
  fastify.post('/attachments/path', { preHandler: fastify.authenticate }, async (request) => {
    const { entityType, entityId, fieldKey, pathText } = request.body || {};
    if (!entityType || !entityId || !fieldKey) throw badRequest('实体信息缺失');
    const rec = savePath({
      entityType, entityId: Number(entityId), fieldKey, pathText, uploader: request.currentUser?.name,
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

  // 删除
  fastify.delete('/attachments/:id', { preHandler: fastify.authenticate }, async (request) => {
    removeAttachment(Number(request.params.id));
    return ok(null, '已删除');
  });
}

/**
 * 文件：modules/signatures/routes.js
 * 用途：当前用户的电子签名库接口。列出/新增（手绘或上传的 DataURL）/设默认/删除自己的签名。
 * 作者：hengguan
 * 说明：签名为用户私有资源，所有操作仅作用于登录用户自身；图片以 base64 DataURL 出入参，便于内嵌展示。
 */

import { all, get, run, tx } from '../../db/index.js';
import { ok, badRequest, notFound } from '../../lib/http.js';
import { decodeSignatureDataUrl, saveSignatureFile, removeSignatureFile, signatureDataUrl } from '../../lib/signature.js';

/** 签名行 -> 前端对象（含内嵌 DataURL） */
function toClient(row) {
  return {
    id: row.id,
    label: row.label,
    is_default: !!row.is_default,
    created_at: row.created_at,
    dataUrl: signatureDataUrl(row.stored_path),
  };
}

export default async function signatureRoutes(fastify) {
  // 我的签名列表（默认在前、其余按新到旧）
  fastify.get('/signatures', { preHandler: fastify.authenticate }, async (request) => {
    const rows = all(
      'SELECT * FROM user_signature WHERE user_id = ? ORDER BY is_default DESC, id DESC',
      request.currentUser.id,
    );
    return ok(rows.map(toClient));
  });

  // 新增签名（dataUrl 为手绘或上传图片的 base64 DataURL）；首枚自动设为默认
  fastify.post('/signatures', { preHandler: fastify.authenticate }, async (request) => {
    const { dataUrl, label } = request.body || {};
    const { ext, buffer } = decodeSignatureDataUrl(dataUrl);
    const relPath = saveSignatureFile(request.currentUser.id, buffer, ext);
    const count = get('SELECT COUNT(*) AS c FROM user_signature WHERE user_id = ?', request.currentUser.id)?.c || 0;
    const res = run(
      'INSERT INTO user_signature (user_id, label, stored_path, is_default) VALUES (?,?,?,?)',
      request.currentUser.id, (label || '').trim() || null, relPath, count === 0 ? 1 : 0,
    );
    return ok(toClient(get('SELECT * FROM user_signature WHERE id = ?', res.lastInsertRowid)), '签名已保存');
  });

  // 设为默认签名
  fastify.post('/signatures/:id/default', { preHandler: fastify.authenticate }, async (request) => {
    const row = get('SELECT * FROM user_signature WHERE id = ?', request.params.id);
    if (!row || row.user_id !== request.currentUser.id) throw notFound('签名不存在');
    tx(() => {
      run('UPDATE user_signature SET is_default = 0 WHERE user_id = ?', request.currentUser.id);
      run('UPDATE user_signature SET is_default = 1 WHERE id = ?', row.id);
    });
    return ok(null, '已设为默认');
  });

  // 删除自己的签名
  fastify.delete('/signatures/:id', { preHandler: fastify.authenticate }, async (request) => {
    const row = get('SELECT * FROM user_signature WHERE id = ?', request.params.id);
    if (!row || row.user_id !== request.currentUser.id) throw notFound('签名不存在');
    removeSignatureFile(row.stored_path);
    run('DELETE FROM user_signature WHERE id = ?', row.id);
    return ok(null, '已删除');
  });
}

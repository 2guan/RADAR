/**
 * 文件：lib/io.js
 * 用途：通用导入/导出/模板路由助手。为各配置资源（字典/系统/角色/投产点等）统一提供
 *       "下载模板 / 导出 xlsx / 导入 xlsx（覆盖更新·重复跳过·出错回滚 三模式）"能力。
 * 作者：hengguan
 * 说明：各资源通过 list(query) 提供导出数据、upsert(row, mode) 实现按业务键的插入/更新/跳过。
 */

import { tx } from '../db/index.js';
import { exportXlsx, parseXlsx } from './excel.js';
import { ok, badRequest } from './http.js';

/**
 * 为某资源注册 模板/导出/导入 三个接口。
 * @param {import('fastify').FastifyInstance} fastify
 * @param {object} cfg
 * @param {string} cfg.prefix 路由前缀，如 '/systems'
 * @param {string} cfg.module RBAC 模块键（通常 'settings' 或 'user'）
 * @param {string} cfg.name 资源中文名（用于文件名）
 * @param {Array<{key:string,title:string}>} cfg.columns 导入导出列定义
 * @param {Function} cfg.list (query)=>对象数组，导出用（已是导出形状）
 * @param {Function} cfg.upsert (row, mode, ctx)=>'inserted'|'updated'|'skipped'；rollback 模式冲突应抛错
 */
export function registerIO(fastify, cfg) {
  const { prefix, module, name, columns, list, upsert } = cfg;

  // 模板下载（仅表头）
  fastify.get(`${prefix}/template`, { preHandler: fastify.requirePerm(module, 'import') }, async (request, reply) => {
    const buf = await exportXlsx(columns, [], `${name}模板`);
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename=${encodeURIComponent(name)}_template.xlsx`);
    return reply.send(buf);
  });

  // 导出（支持当前筛选；pageSize=0 全量）
  fastify.post(`${prefix}/export`, { preHandler: fastify.requirePerm(module, 'export') }, async (request, reply) => {
    const rows = list({ ...(request.body || {}), pageSize: 0 });
    const buf = await exportXlsx(columns, rows, name);
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', `attachment; filename=${encodeURIComponent(name)}.xlsx`);
    return reply.send(buf);
  });

  // 导入
  fastify.post(`${prefix}/import`, { preHandler: fastify.requirePerm(module, 'import') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = data.fields?.mode?.value || request.query.mode || 'skip';
    const buffer = await data.toBuffer();
    const rows = await parseXlsx(buffer, columns);
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0 };
    const ctx = { operator: request.currentUser?.name };
    const apply = () => {
      for (const row of rows) {
        const r = upsert(row, mode, ctx);
        if (r === 'inserted') stat.inserted++;
        else if (r === 'updated') stat.updated++;
        else stat.skipped++;
      }
    };
    if (mode === 'rollback') tx(apply); else apply();
    return ok(stat, '导入完成');
  });
}

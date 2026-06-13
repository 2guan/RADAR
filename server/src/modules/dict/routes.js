/**
 * 文件：modules/dict/routes.js
 * 用途：字典管理接口。提供标准 CRUD（受 settings 权限约束）、面向全平台下拉框的按分类读取，
 *       以及按分类的导入/导出/模板下载（流程状态额外含"阶段/终态"列）。
 * 作者：hengguan
 * 说明：流程状态等字典的 extra 字段存 JSON（stage/isTerminal）。
 */

import { all, get, run, tx } from '../../db/index.js';
import { registerCrud } from '../../lib/crud.js';
import { listQuery } from '../../lib/query.js';
import { exportXlsx, parseXlsx } from '../../lib/excel.js';
import { ok, badRequest } from '../../lib/http.js';

// 基础列；流程状态额外含 阶段/终态
const BASE_COLS = [
  { key: 'attr_value', title: '属性值' },
  { key: 'display_value', title: '显示值' },
  { key: 'sort', title: '排序' },
];
const PROCESS_COLS = [
  { key: 'stage', title: '阶段' },
  ...BASE_COLS,
  { key: 'state_type', title: '状态类型' },
];

/** 按分类取导入导出列定义 */
function colsOf(category) {
  return category === 'process_status' ? PROCESS_COLS : BASE_COLS;
}

/** 把字典行转为导出对象 */
function toExport(category, r) {
  const extra = r.extra ? JSON.parse(r.extra) : {};
  if (category === 'process_status') {
    const stLabel = extra.stateType === 'initial' ? '初始态' : (extra.stateType === 'final' ? '终态' : '进行中');
    return { stage: extra.stage || '', attr_value: r.attr_value, display_value: r.display_value, sort: r.sort, state_type: stLabel };
  }
  return { attr_value: r.attr_value, display_value: r.display_value, sort: r.sort };
}

export default async function dictRoutes(fastify) {
  // 标准 CRUD
  registerCrud(fastify, {
    prefix: '/dict',
    table: 'dict_item',
    module: 'settings',
    entityType: 'dict',
    columns: ['id', 'category', 'attr_value', 'display_value', 'sort', 'created_at'],
    searchColumns: ['attr_value', 'display_value'],
    writable: ['category', 'attr_value', 'display_value', 'sort', 'extra'],
    fieldLabels: {
      category: '分类', attr_value: '属性值', display_value: '显示值', sort: '排序', extra: '扩展',
    },
    codeField: 'attr_value',
    skipList: true,
  });

  // 列表（自定义：支持流程状态阶段、状态类型及模糊搜索）
  fastify.post('/dict/list', { preHandler: fastify.requirePerm('settings', 'view') }, async (request) => {
    const body = request.body || {};
    const wh = [];
    const params = [];
    const filters = Array.isArray(body.filters) ? body.filters : [];
    const normalFilters = [];

    for (const f of filters) {
      if (!f || f.value === undefined || f.value === null || f.value === '') continue;
      
      if (f.field === 'stage') {
        const vals = Array.isArray(f.value) ? f.value : [f.value];
        if (vals.length) {
          wh.push(`json_extract(extra, '$.stage') IN (${vals.map(() => '?').join(',')})`);
          params.push(...vals);
        }
      } else if (f.field === 'state_type') {
        const vals = Array.isArray(f.value) ? f.value : [f.value];
        if (vals.length) {
          wh.push(`json_extract(extra, '$.stateType') IN (${vals.map(() => '?').join(',')})`);
          params.push(...vals);
        }
      } else if (f.field === 'dict_query') {
        wh.push('(attr_value LIKE ? OR display_value LIKE ?)');
        params.push(`%${f.value}%`, `%${f.value}%`);
      } else {
        normalFilters.push(f);
      }
    }

    const newBody = { ...body, filters: normalFilters };
    const baseWhere = wh.join(' AND ');

    const result = listQuery({
      table: 'dict_item',
      columns: ['id', 'category', 'attr_value', 'display_value', 'sort', 'created_at'],
      searchColumns: ['attr_value', 'display_value'],
      query: newBody,
      baseWhere,
      baseParams: params,
    });
    return ok(result);
  });

  // 按分类读取（供下拉框/筛选器使用，任意登录用户可读）
  fastify.get('/dict/by-category/:category', { preHandler: fastify.authenticate }, async (request) => {
    const rows = all(
      'SELECT id, attr_value, display_value, sort, extra FROM dict_item WHERE category = ? ORDER BY sort, id',
      request.params.category,
    );
    return ok(rows.map((r) => ({ ...r, extra: r.extra ? JSON.parse(r.extra) : null })));
  });

  // 模板下载（按分类）
  fastify.get('/dict/template', { preHandler: fastify.requirePerm('settings', 'import') }, async (request, reply) => {
    const category = request.query.category;
    const buf = await exportXlsx(colsOf(category), [], '字典模板');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=dict_template.xlsx');
    return reply.send(buf);
  });

  // 导出（按分类）
  fastify.post('/dict/export', { preHandler: fastify.requirePerm('settings', 'export') }, async (request, reply) => {
    const { category } = request.body || {};
    const rows = all('SELECT * FROM dict_item WHERE category = ? ORDER BY sort, id', category);
    const buf = await exportXlsx(colsOf(category), rows.map((r) => toExport(category, r)), '字典');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=dict.xlsx');
    return reply.send(buf);
  });

  // 导入（按分类，三种冲突模式）
  fastify.post('/dict/import', { preHandler: fastify.requirePerm('settings', 'import') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = data.fields?.mode?.value || 'skip';
    const category = data.fields?.category?.value || request.query.category;
    if (!category) throw badRequest('缺少字典分类');
    const buffer = await data.toBuffer();
    const rows = await parseXlsx(buffer, colsOf(category));
    if (!rows.length) throw badRequest('文件中无有效数据');

    const stat = { inserted: 0, updated: 0, skipped: 0 };
    const apply = () => {
      for (const r of rows) {
        if (!r.attr_value) { stat.skipped++; continue; }
        let extra = null;
        if (category === 'process_status') {
          const stStr = String(r.state_type || '').trim();
          let stateType = 'in-progress';
          if (['初始', '初始态', 'initial', 'start'].some(k => stStr.includes(k))) {
            stateType = 'initial';
          } else if (['终态', '完成', 'final', 'success', 'end', '是'].some(k => stStr.includes(k))) {
            stateType = 'final';
          }
          extra = JSON.stringify({ stage: r.stage || '', stateType, isTerminal: stateType === 'final' });
        }
        const exists = get('SELECT id FROM dict_item WHERE category = ? AND attr_value = ?', category, r.attr_value);
        if (exists) {
          if (mode === 'skip') { stat.skipped++; continue; }
          if (mode === 'rollback') throw badRequest(`属性值重复：${r.attr_value}，已回滚`);
          run('UPDATE dict_item SET display_value=?, sort=?, extra=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?',
            r.display_value || r.attr_value, Number(r.sort) || 0, extra, exists.id);
          stat.updated++;
        } else {
          run('INSERT INTO dict_item (category, attr_value, display_value, sort, extra) VALUES (?,?,?,?,?)',
            category, r.attr_value, r.display_value || r.attr_value, Number(r.sort) || 0, extra);
          stat.inserted++;
        }
      }
    };
    if (mode === 'rollback') tx(apply); else apply();
    return ok(stat, '导入完成');
  });
}

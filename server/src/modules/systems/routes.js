/**
 * 文件：modules/systems/routes.js
 * 用途：所属系统（物理子系统清单）管理接口。标准 CRUD + 全量读取（供下拉框）+ 导入/导出/模板。
 * 作者：hengguan
 */

import { all, get, run } from '../../db/index.js';
import { registerCrud } from '../../lib/crud.js';
import { registerIO } from '../../lib/io.js';
import { listQuery } from '../../lib/query.js';
import { ok, badRequest } from '../../lib/http.js';

const COLUMNS = ['id', 'sys_code', 'sys_name', 'org', 'sector', 'sort', 'created_at'];

export default async function systemRoutes(fastify) {
  registerCrud(fastify, {
    prefix: '/systems',
    table: 'system',
    module: 'settings',
    entityType: 'system',
    columns: COLUMNS,
    searchColumns: ['sys_code', 'sys_name', 'org', 'sector'],
    writable: ['sys_code', 'sys_name', 'org', 'sector', 'sort'],
    fieldLabels: {
      sys_code: '系统编号', sys_name: '系统名称', org: '所属机构', sector: '所属板块', sort: '排序',
    },
    codeField: 'sys_code',
  });

  // 全量读取（供需求等表单的系统多选下拉，输入即搜由前端完成）
  fastify.get('/systems/all', { preHandler: fastify.authenticate }, async () => {
    const rows = all('SELECT id, sys_code, sys_name, org, sector FROM system ORDER BY sort, id');
    return ok(rows);
  });

  // 导入/导出/模板
  registerIO(fastify, {
    prefix: '/systems', module: 'settings', name: '所属系统',
    columns: [
      { key: 'sys_code', title: '系统编号' }, { key: 'sys_name', title: '系统名称' },
      { key: 'org', title: '所属机构' }, { key: 'sector', title: '所属板块' }, { key: 'sort', title: '排序' },
    ],
    list: (q) => listQuery({ table: 'system', columns: COLUMNS, searchColumns: ['sys_code', 'sys_name', 'org', 'sector'], query: q }).list,
    upsert: (r, mode) => {
      if (!r.sys_code || !r.sys_name) return 'skipped';
      const exists = get('SELECT id FROM system WHERE sys_code = ?', r.sys_code);
      if (exists) {
        if (mode === 'skip') return 'skipped';
        if (mode === 'rollback') throw badRequest(`系统编号重复：${r.sys_code}，已回滚`);
        run('UPDATE system SET sys_name=?, org=?, sector=?, sort=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?',
          r.sys_name, r.org || null, r.sector || null, Number(r.sort) || 0, exists.id);
        return 'updated';
      }
      run('INSERT INTO system (sys_code, sys_name, org, sector, sort) VALUES (?,?,?,?,?)',
        r.sys_code, r.sys_name, r.org || null, r.sector || null, Number(r.sort) || 0);
      return 'inserted';
    },
  });
}

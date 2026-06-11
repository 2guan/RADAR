/**
 * 文件：modules/roles/routes.js
 * 用途：角色管理与权限矩阵接口。角色 CRUD + 读取/保存某角色的权限矩阵 + 权限目录。
 * 作者：hengguan
 * 说明：内置角色（is_builtin=1，如超级管理员）不可删除；超级管理员权限恒为全集。
 */

import { get, all, run, tx } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { registerIO } from '../../lib/io.js';
import { PERM_CATALOG } from '../../lib/perm-catalog.js';
import { ok, notFound, badRequest } from '../../lib/http.js';

/** 把"是/否"等文本解析为布尔标识 */
function truthy(v) {
  return ['是', 'Y', 'y', 'true', '1', '会签'].includes(String(v ?? '').trim());
}

export default async function roleRoutes(fastify) {
  // 权限目录（供矩阵 UI 渲染）
  fastify.get('/permissions/catalog', { preHandler: fastify.authenticate }, async () => ok(PERM_CATALOG));

  // 角色列表
  fastify.post('/roles/list', { preHandler: fastify.requirePerm('settings', 'view') }, async (request) => {
    return ok(listQuery({
      table: 'role',
      columns: ['id', 'name', 'code', 'default_home', 'is_builtin', 'is_signoff_role', 'created_at'],
      searchColumns: ['name', 'code'],
      query: request.body || {},
    }));
  });

  // 全部角色（供人员表单多选与会签角色读取）
  fastify.get('/roles/all', { preHandler: fastify.authenticate }, async () => {
    return ok(all('SELECT id, name, code, default_home, is_signoff_role FROM role ORDER BY id'));
  });

  // 新增角色
  fastify.post('/roles', { preHandler: fastify.requirePerm('settings', 'create') }, async (request) => {
    const { name, code, default_home, is_signoff_role } = request.body || {};
    if (!name || !code) throw badRequest('角色名称与标识必填');
    if (get('SELECT id FROM role WHERE code = ?', code)) throw badRequest('角色标识已存在');
    const res = run(
      'INSERT INTO role (name, code, default_home, is_builtin, is_signoff_role) VALUES (?,?,?,0,?)',
      name, code, default_home || '仪表盘', is_signoff_role ? 1 : 0,
    );
    return ok({ id: res.lastInsertRowid });
  });

  // 修改角色
  fastify.put('/roles/:id', { preHandler: fastify.requirePerm('settings', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = get('SELECT * FROM role WHERE id = ?', id);
    if (!old) throw notFound();
    const { name, default_home, is_signoff_role } = request.body || {};
    run(
      `UPDATE role SET name=?, default_home=?, is_signoff_role=?, updated_at=datetime('now','localtime') WHERE id=?`,
      name ?? old.name, default_home ?? old.default_home,
      is_signoff_role === undefined ? old.is_signoff_role : (is_signoff_role ? 1 : 0), id,
    );
    return ok({ id });
  });

  // 删除角色
  fastify.delete('/roles/:id', { preHandler: fastify.requirePerm('settings', 'delete') }, async (request) => {
    const id = request.params.id;
    const row = get('SELECT * FROM role WHERE id = ?', id);
    if (!row) throw notFound();
    if (row.is_builtin) throw badRequest('内置角色不可删除');
    const used = get('SELECT COUNT(*) AS c FROM user_role WHERE role_id = ?', id);
    if (used?.c > 0) throw badRequest('该角色已分配给用户，无法删除');
    run('DELETE FROM role WHERE id = ?', id);
    return ok(null, '删除成功');
  });

  // 读取角色权限矩阵（返回已勾选的 module:action 列表）
  fastify.get('/roles/:id/permissions', { preHandler: fastify.requirePerm('settings', 'view') }, async (request) => {
    const id = request.params.id;
    const role = get('SELECT * FROM role WHERE id = ?', id);
    if (!role) throw notFound();
    const granted = all(
      'SELECT module_key, action_key FROM permission WHERE role_id = ? AND allowed = 1',
      id,
    ).map((r) => `${r.module_key}:${r.action_key}`);
    return ok({ roleId: Number(id), isSuper: role.code === '超级管理员', granted });
  });

  // 保存角色权限矩阵（整体覆盖；需要"编辑权限矩阵"权限）
  fastify.put('/roles/:id/permissions', { preHandler: fastify.requirePerm('settings', 'settings.permission.edit') }, async (request) => {
    const id = request.params.id;
    const role = get('SELECT * FROM role WHERE id = ?', id);
    if (!role) throw notFound();
    if (role.code === '超级管理员') throw badRequest('超级管理员拥有全部权限，无需配置');
    const granted = Array.isArray(request.body?.granted) ? request.body.granted : [];
    // 仅接受目录内的合法 module:action
    const valid = new Set();
    for (const m of PERM_CATALOG) for (const a of m.actions) valid.add(`${m.key}:${a.key}`);
    tx(() => {
      run('DELETE FROM permission WHERE role_id = ?', id);
      for (const item of granted) {
        if (!valid.has(item)) continue;
        const [moduleKey, actionKey] = item.split(':');
        run(
          'INSERT INTO permission (role_id, module_key, action_key, allowed) VALUES (?,?,?,1)',
          id, moduleKey, actionKey,
        );
      }
    });
    return ok(null, '权限已保存');
  });

  // 导入/导出/模板
  registerIO(fastify, {
    prefix: '/roles', module: 'settings', name: '角色',
    columns: [
      { key: 'name', title: '角色名称' }, { key: 'code', title: '角色标识' },
      { key: 'default_home', title: '默认首页' }, { key: 'is_signoff_role', title: '会签角色' },
    ],
    list: (q) => listQuery({
      table: 'role', columns: ['id', 'name', 'code', 'default_home', 'is_signoff_role'],
      searchColumns: ['name', 'code'], query: q,
    }).list.map((r) => ({ ...r, is_signoff_role: r.is_signoff_role ? '是' : '' })),
    upsert: (r, mode) => {
      if (!r.name || !r.code) return 'skipped';
      const sign = truthy(r.is_signoff_role) ? 1 : 0;
      const exists = get('SELECT id FROM role WHERE code = ?', r.code);
      if (exists) {
        if (mode === 'skip') return 'skipped';
        if (mode === 'rollback') throw badRequest(`角色标识重复：${r.code}，已回滚`);
        run('UPDATE role SET name=?, default_home=?, is_signoff_role=?, updated_at=datetime(\'now\',\'localtime\') WHERE id=?',
          r.name, r.default_home || '仪表盘', sign, exists.id);
        return 'updated';
      }
      run('INSERT INTO role (name, code, default_home, is_builtin, is_signoff_role) VALUES (?,?,?,0,?)',
        r.name, r.code, r.default_home || '仪表盘', sign);
      return 'inserted';
    },
  });
}

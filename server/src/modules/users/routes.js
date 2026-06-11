/**
 * 文件：modules/users/routes.js
 * 用途：人员（用户）管理接口。CRUD（含一人多角色）、重置密码、Excel 导入/导出、
 *       人员模糊搜索（供需求/开发/测试等表单的负责人选择）。
 * 作者：hengguan
 * 说明：手机号为唯一登录名；导入支持"覆盖更新/重复跳过/事务回滚"三种冲突策略。
 */

import { get, all, run, tx } from '../../db/index.js';
import { listQuery } from '../../lib/query.js';
import { hashPassword } from '../../lib/password.js';
import { exportXlsx, parseXlsx } from '../../lib/excel.js';
import { ok, notFound, badRequest } from '../../lib/http.js';

// 导出列定义（不含密码）
const EXPORT_COLUMNS = [
  { key: 'phone', title: '手机号' },
  { key: 'name', title: '姓名' },
  { key: 'org', title: '所属机构' },
  { key: 'roles', title: '角色' },
  { key: 'status', title: '状态' },
];
// 导入列定义（额外含初始密码）
const IMPORT_COLUMNS = [
  { key: 'phone', title: '手机号' },
  { key: 'name', title: '姓名' },
  { key: 'org', title: '所属机构' },
  { key: 'roles', title: '角色' },
  { key: 'status', title: '状态' },
  { key: 'password', title: '初始密码' },
];

/** 查询用户的角色名数组 */
function rolesOfUser(userId) {
  return all(
    `SELECT r.id, r.code, r.name FROM role r JOIN user_role ur ON ur.role_id = r.id WHERE ur.user_id = ?`,
    userId,
  );
}

/** 设置用户角色（按角色标识数组） */
function setUserRoles(userId, roleCodes) {
  run('DELETE FROM user_role WHERE user_id = ?', userId);
  for (const code of roleCodes || []) {
    const role = get('SELECT id FROM role WHERE code = ?', code);
    if (role) run('INSERT OR IGNORE INTO user_role (user_id, role_id) VALUES (?,?)', userId, role.id);
  }
}

export default async function userRoutes(fastify) {
  // 列表（附带角色信息）
  fastify.post('/users/list', { preHandler: fastify.requirePerm('user', 'view') }, async (request) => {
    const result = listQuery({
      table: 'user',
      columns: ['id', 'phone', 'name', 'org', 'status', 'created_at'],
      searchColumns: ['phone', 'name', 'org'],
      query: request.body || {},
      select: 'id, phone, name, org, status, is_super, created_at',
    });
    result.list = result.list.map((u) => ({ ...u, roles: rolesOfUser(u.id) }));
    return ok(result);
  });

  // 人员模糊搜索（任意登录用户，供负责人/提出人选择）
  fastify.get('/users/search', { preHandler: fastify.authenticate }, async (request) => {
    const kw = String(request.query.keyword || '').trim();
    const rows = kw
      ? all('SELECT id, name, phone, org FROM user WHERE status=\'启用\' AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 30', `%${kw}%`, `%${kw}%`)
      : all('SELECT id, name, phone, org FROM user WHERE status=\'启用\' ORDER BY name LIMIT 30');
    return ok(rows);
  });

  // 详情
  fastify.get('/users/:id', { preHandler: fastify.requirePerm('user', 'view') }, async (request) => {
    const u = get('SELECT id, phone, name, org, status, is_super FROM user WHERE id = ?', request.params.id);
    if (!u) throw notFound();
    return ok({ ...u, roles: rolesOfUser(u.id) });
  });

  // 新增
  fastify.post('/users', { preHandler: fastify.requirePerm('user', 'create') }, async (request) => {
    const { phone, name, org, password, roles } = request.body || {};
    if (!phone || !name) throw badRequest('手机号与姓名必填');
    if (get('SELECT id FROM user WHERE phone = ?', phone)) throw badRequest('手机号已存在');
    const id = tx(() => {
      const res = run(
        'INSERT INTO user (phone, name, org, password_hash, status) VALUES (?,?,?,?,?)',
        phone, name, org || null, hashPassword(password || '123456'), '启用',
      );
      setUserRoles(res.lastInsertRowid, roles);
      return res.lastInsertRowid;
    });
    return ok({ id });
  });

  // 修改
  fastify.put('/users/:id', { preHandler: fastify.requirePerm('user', 'edit') }, async (request) => {
    const id = request.params.id;
    const old = get('SELECT * FROM user WHERE id = ?', id);
    if (!old) throw notFound();
    const { name, org, status, roles } = request.body || {};
    tx(() => {
      run(
        `UPDATE user SET name=?, org=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
        name ?? old.name, org ?? old.org, status ?? old.status, id,
      );
      // 角色可自由编辑（含超级管理员）；超管权限源于 is_super 标识，与角色无关，不会因改角色而丢失
      if (roles !== undefined) setUserRoles(id, roles);
    });
    return ok({ id });
  });

  // 重置密码
  fastify.post('/users/:id/reset-password', { preHandler: fastify.requirePerm('user', 'edit') }, async (request) => {
    const id = request.params.id;
    if (!get('SELECT id FROM user WHERE id = ?', id)) throw notFound();
    const pwd = request.body?.password || '123456';
    run(`UPDATE user SET password_hash=?, updated_at=datetime('now','localtime') WHERE id=?`, hashPassword(pwd), id);
    return ok(null, '密码已重置');
  });

  // 删除
  fastify.delete('/users/:id', { preHandler: fastify.requirePerm('user', 'delete') }, async (request) => {
    const id = request.params.id;
    const u = get('SELECT * FROM user WHERE id = ?', id);
    if (!u) throw notFound();
    if (u.is_super) throw badRequest('超级管理员不可删除');
    run('DELETE FROM user WHERE id = ?', id);
    return ok(null, '删除成功');
  });

  // 导出
  fastify.post('/users/export', { preHandler: fastify.requirePerm('user', 'export') }, async (request, reply) => {
    const result = listQuery({
      table: 'user',
      columns: ['id', 'phone', 'name', 'org', 'status'],
      searchColumns: ['phone', 'name', 'org'],
      query: { ...(request.body || {}), pageSize: 0 },
      select: 'id, phone, name, org, status',
    });
    const rows = result.list.map((u) => ({
      ...u,
      roles: rolesOfUser(u.id).map((r) => r.name).join('、'),
    }));
    const buf = await exportXlsx(EXPORT_COLUMNS, rows, '人员清单');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=users.xlsx');
    return reply.send(buf);
  });

  // 导入模板（含初始密码列）
  fastify.get('/users/template', { preHandler: fastify.requirePerm('user', 'import') }, async (request, reply) => {
    const buf = await exportXlsx(IMPORT_COLUMNS, [], '人员模板');
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('Content-Disposition', 'attachment; filename=users_template.xlsx');
    return reply.send(buf);
  });

  // 导入（multipart，含冲突策略 mode：overwrite/skip/rollback；支持初始密码列）
  fastify.post('/users/import', { preHandler: fastify.requirePerm('user', 'import') }, async (request) => {
    const data = await request.file();
    if (!data) throw badRequest('请上传文件');
    const mode = (data.fields?.mode?.value) || request.query.mode || 'skip';
    const buffer = await data.toBuffer();
    const rows = await parseXlsx(buffer, IMPORT_COLUMNS);
    if (!rows.length) throw badRequest('文件中无有效数据');

    let inserted = 0, updated = 0, skipped = 0;
    const apply = () => {
      for (const r of rows) {
        if (!r.phone || !r.name) { skipped++; continue; }
        const exists = get('SELECT id FROM user WHERE phone = ?', r.phone);
        const roleCodes = String(r.roles || '').split(/[、,，\s]+/).filter(Boolean);
        const initPwd = String(r.password || '').trim() || '123456';
        if (exists) {
          if (mode === 'skip') { skipped++; continue; }
          if (mode === 'rollback') throw badRequest(`手机号重复：${r.phone}，已回滚`);
          run(`UPDATE user SET name=?, org=?, status=?, updated_at=datetime('now','localtime') WHERE id=?`,
            r.name, r.org || null, r.status || '启用', exists.id);
          if (roleCodes.length) setUserRoles(exists.id, roleCodes);
          updated++;
        } else {
          const res = run('INSERT INTO user (phone, name, org, password_hash, status) VALUES (?,?,?,?,?)',
            r.phone, r.name, r.org || null, hashPassword(initPwd), r.status || '启用');
          if (roleCodes.length) setUserRoles(res.lastInsertRowid, roleCodes);
          inserted++;
        }
      }
    };
    // rollback 模式整体事务；其它模式逐条
    if (mode === 'rollback') tx(apply); else apply();
    return ok({ inserted, updated, skipped }, '导入完成');
  });
}

/**
 * 文件：modules/auth/routes.js
 * 用途：鉴权相关接口——登录、获取当前用户信息（含角色与权限集）、登出。
 * 作者：hengguan
 * 说明：登录成功签发 JWT；/auth/me 返回前端用于菜单/路由/按钮级权限控制的数据。
 */

import { get, all, run } from '../../db/index.js';
import { verifyPassword, hashPassword } from '../../lib/password.js';
import { ok, badRequest, unauthorized } from '../../lib/http.js';

export default async function authRoutes(fastify) {
  // 登录
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
        },
      },
    },
  }, async (request) => {
    const { phone, password } = request.body;
    const user = get('SELECT * FROM user WHERE phone = ?', phone);
    if (!user || !verifyPassword(password, user.password_hash)) {
      throw unauthorized('登录名或密码错误');
    }
    if (user.status !== '启用') throw badRequest('账号已停用，请联系管理员');

    const token = await fastify.jwt.sign({ id: user.id, phone: user.phone });
    return ok({ token, name: user.name });
  });

  // 当前用户信息 + 权限
  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request) => {
    const u = request.currentUser;
    const roles = all(
      `SELECT r.code, r.name, r.default_home
         FROM role r JOIN user_role ur ON ur.role_id = r.id
        WHERE ur.user_id = ?`,
      u.id,
    );
    // 超管拥有全部权限，前端用通配标记
    const permissions = u.is_super
      ? ['*']
      : [...fastify.loadUserPermissions(u.id)];
    return ok({
      id: u.id,
      phone: u.phone,
      name: u.name,
      org: u.org,
      isSuper: !!u.is_super,
      roles,
      defaultHome: roles[0]?.default_home || '仪表盘',
      permissions,
    });
  });

  // 登出（无状态 JWT，前端清除 token 即可，这里仅作语义占位）
  fastify.post('/auth/logout', { preHandler: fastify.authenticate }, async () => ok(null, '已登出'));

  // 修改密码（当前用户）
  fastify.post('/auth/change-password', { preHandler: fastify.authenticate }, async (request) => {
    const u = request.currentUser;
    const { oldPassword, newPassword } = request.body || {};
    if (!oldPassword || !newPassword) throw badRequest('明文密码不能为空');

    // 验证旧密码
    const user = get('SELECT * FROM user WHERE id = ?', u.id);
    if (!user || !verifyPassword(oldPassword, user.password_hash)) {
      throw badRequest('旧密码错误');
    }

    // 更新密码
    run(`UPDATE user SET password_hash=?, updated_at=datetime('now','localtime') WHERE id=?`, hashPassword(newPassword), u.id);
    return ok(null, '密码修改成功');
  });
}

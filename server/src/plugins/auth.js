/**
 * 文件：plugins/auth.js
 * 用途：鉴权与 RBAC 权限插件。注册 @fastify/jwt，提供 authenticate 预处理钩子，
 *       并提供 requirePerm(module, action) 工厂用于路由级权限校验。
 * 作者：hengguan
 * 说明：超级管理员（is_super=1）跳过权限校验；其余用户按角色的权限矩阵并集判定。
 */

import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config.js';
import { all, get } from '../db/index.js';
import { unauthorized, forbidden } from '../lib/http.js';

/**
 * 查询用户的全部已授予权限集合（"module:action" 字符串集）。
 */
function loadUserPermissions(userId) {
  const rows = all(
    `SELECT DISTINCT p.module_key, p.action_key
       FROM permission p
       JOIN user_role ur ON ur.role_id = p.role_id
      WHERE ur.user_id = ? AND p.allowed = 1`,
    userId,
  );
  return new Set(rows.map((r) => `${r.module_key}:${r.action_key}`));
}

async function authPlugin(fastify) {
  // 注册 JWT
  fastify.register(fastifyJwt, {
    secret: config.jwt.secret,
    sign: { expiresIn: config.jwt.expiresIn },
  });

  /**
   * authenticate：校验 JWT 并把当前用户挂到 request.currentUser。
   */
  fastify.decorate('authenticate', async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized();
    }
    const userId = request.user?.id;
    const u = get('SELECT id, phone, name, org, status, is_super FROM user WHERE id = ?', userId);
    if (!u || u.status !== '启用') throw unauthorized('账号不存在或已停用');
    request.currentUser = u;
  });

  /**
   * requirePerm：生成"先认证再校验某模块某操作权限"的 preHandler。
   * @param {string} moduleKey 模块键
   * @param {string} actionKey 操作键
   */
  fastify.decorate('requirePerm', (moduleKey, actionKey) => async (request) => {
    await fastify.authenticate(request);
    if (request.currentUser.is_super) return; // 超管放行
    const perms = loadUserPermissions(request.currentUser.id);
    if (!perms.has(`${moduleKey}:${actionKey}`)) {
      throw forbidden(`无【${moduleKey}/${actionKey}】操作权限`);
    }
  });

  // 暴露权限加载函数，供 /auth/me 返回前端用于菜单/按钮控制
  fastify.decorate('loadUserPermissions', loadUserPermissions);
}

export default fp(authPlugin, { name: 'auth' });

/**
 * 文件：modules/auth/routes.js
 * 用途：鉴权相关接口——登录、获取当前用户信息（含角色与权限集）、登出。
 * 作者：hengguan
 * 说明：登录成功签发 JWT；/auth/me 返回前端用于菜单/路由/按钮级权限控制的数据。
 */

import { get, all, run } from '../../db/index.js';
import { verifyPassword, hashPassword, validatePasswordComplexity, isPasswordExpired, getSecurityConfig } from '../../lib/password.js';
import { ok, badRequest, unauthorized } from '../../lib/http.js';
import { sanitizeText } from '../../lib/sanitize.js';

// Non-existent users lockout tracking
const failedAttempts = new Map();

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
    const configSettings = getSecurityConfig();
    const lockoutEnabled = configSettings['security.lockout.enabled'];
    const maxAttempts = configSettings['security.lockout.maxAttempts'];
    const durationMinutes = configSettings['security.lockout.durationMinutes'];

    // 1. 非存在用户的锁定检查
    if (lockoutEnabled) {
      const attempt = failedAttempts.get(phone);
      if (attempt && attempt.lockoutUntil) {
        const lockoutTime = new Date(attempt.lockoutUntil);
        const now = new Date();
        if (lockoutTime > now) {
          const minutesLeft = Math.ceil((lockoutTime - now) / 60000);
          throw badRequest(`账号已被锁定，请于 ${minutesLeft} 分钟后重试`);
        } else {
          // 锁定已过期，清空重试计数
          failedAttempts.delete(phone);
        }
      }
    }

    const user = get('SELECT * FROM user WHERE phone = ?', phone);

    // 2. 如果用户不存在，记录失败次数并抛错
    if (!user) {
      if (!lockoutEnabled) {
        throw unauthorized(AUTH_FAILED_MSG);
      }
      const attempt = failedAttempts.get(phone) || { count: 0, lockoutUntil: null };
      const newCount = attempt.count + 1;
      if (newCount >= maxAttempts) {
        const lockoutUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        failedAttempts.set(phone, { count: newCount, lockoutUntil });
        throw badRequest(`登录过于频繁，请稍后再试`);
      } else {
        failedAttempts.set(phone, { count: newCount, lockoutUntil: null });
        const attemptsLeft = maxAttempts - newCount;
        throw unauthorized(`登录名或密码错误，还可尝试 ${attemptsLeft} 次`);
      }
    }

    if (user.status !== '启用') throw badRequest('登录名或密码错误');

    // 3. 已有用户的锁定检查
    if (lockoutEnabled && user.lockout_until) {
      const lockoutTime = new Date(user.lockout_until);
      const now = new Date();
      if (lockoutTime > now) {
        const minutesLeft = Math.ceil((lockoutTime - now) / 60000);
        throw badRequest(`账号已被锁定，请于 ${minutesLeft} 分钟后重试`);
      } else {
        // 锁定已过期，清空重试计数并重置内存中的副本
        run('UPDATE user SET login_fail_count = 0, lockout_until = NULL WHERE id = ?', user.id);
        user.login_fail_count = 0;
        user.lockout_until = null;
      }
    }

    if (!verifyPassword(password, user.password_hash)) {
      if (!lockoutEnabled) {
        throw unauthorized('登录名或密码错误');
      }
      const newFailCount = (user.login_fail_count || 0) + 1;
      if (newFailCount >= maxAttempts) {
        const lockoutUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        run('UPDATE user SET login_fail_count = ?, lockout_until = ? WHERE id = ?', newFailCount, lockoutUntil, user.id);
        throw badRequest(`登录过于频繁，请稍后再试`);
      } else {
        run('UPDATE user SET login_fail_count = ? WHERE id = ?', newFailCount, user.id);
        const attemptsLeft = maxAttempts - newFailCount;
        throw unauthorized(`登录名或密码错误，还可尝试 ${attemptsLeft} 次`);
      }
    }

    // 登录成功，重置所有计数并清除临时缓存记录
    run('UPDATE user SET login_fail_count = 0, lockout_until = NULL WHERE id = ?', user.id);
    if (lockoutEnabled) {
      failedAttempts.delete(phone);
    }

    const token = await fastify.jwt.sign({ id: user.id, phone: user.phone });
    const expired = isPasswordExpired(user);
    return ok({ token, name: user.name, mustChangePassword: expired });
  });

  // 当前用户信息 + 权限
  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request) => {
    const u = request.currentUser;
    const roles = all(
      `SELECT r.code, r.name, r.default_home, r.default_theme
         FROM role r JOIN user_role ur ON ur.role_id = r.id
        WHERE ur.user_id = ?`,
      u.id,
    );
    // 超管拥有全部权限，前端用通配标记
    const permissions = u.is_super
      ? ['*']
      : [...fastify.loadUserPermissions(u.id)];

    const userDetail = get('SELECT created_at, password_changed_at FROM user WHERE id = ?', u.id);
    const expired = isPasswordExpired(userDetail);

    return ok({
      id: u.id,
      phone: u.phone,
      name: u.name,
      org: u.org,
      isSuper: !!u.is_super,
      roles,
      defaultHome: roles[0]?.default_home || '/dashboard',
      defaultTheme: roles[0]?.default_theme || 'sky',
      permissions,
      mustChangePassword: expired,
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

    // 验证新旧密码一致性
    if (oldPassword === newPassword) {
      throw badRequest('新密码不能与旧密码相同');
    }

    // 验证复杂度
    if (!validatePasswordComplexity(newPassword)) {
      const configSettings = getSecurityConfig();
      const minLength = configSettings['security.password.minLength'];
      throw badRequest(`新密码不符合复杂度要求（长度不能小于 ${minLength} 位，且必须包含大小写字母、数字和特殊字符）`);
    }

    // 更新密码，更新 password_changed_at 并重置错误计数
    run(
      `UPDATE user SET password_hash=?, updated_at=datetime('now','localtime'), password_changed_at=datetime('now','localtime'), login_fail_count=0, lockout_until=NULL WHERE id=?`,
      hashPassword(newPassword),
      u.id
    );
    return ok(null, '密码修改成功');
  });
}

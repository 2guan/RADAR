/**
 * 文件：modules/auth/routes.js
 * 用途：鉴权相关接口——登录、获取当前用户信息（含角色与权限集）、登出。
 *       改进：统一登录失败追踪（login_fail_tracker 表），防止用户枚举；
 *       输错 2 次后需要验证码；登录接口额外限流。
 * 作者：hengguan
 * 说明：登录成功签发 JWT；/auth/me 返回前端用于菜单/路由/按钮级权限控制的数据。
 *       验证码使用自绘 SVG，无外部依赖。
 */

import { get, all, run } from '../../db/index.js';
import { verifyPassword, hashPassword, validatePasswordComplexity, isPasswordExpired, getSecurityConfig } from '../../lib/password.js';
import { ok, badRequest, unauthorized } from '../../lib/http.js';
import { sanitizeText } from '../../lib/sanitize.js';
import { createCaptcha, verifyCaptcha } from '../../lib/captcha.js';

export default async function authRoutes(fastify) {
  // 获取验证码（无需登录）
  fastify.get('/auth/captcha', async () => {
    const captcha = createCaptcha();
    return ok({ captchaSvg: captcha.svg, captchaToken: captcha.token });
  });

  /**
   * 读取或创建 login_fail_tracker 记录。
   * 已存在的用户会同步数据库中已有的 login_fail_count（迁移兼容）。
   */
  async function getTracker(phone) {
    let tracker = await get('SELECT * FROM login_fail_tracker WHERE phone = ?', phone);
    if (!tracker) {
      const existingUser = await get('SELECT login_fail_count, lockout_until FROM user WHERE phone = ?', phone);
      const failCount = existingUser?.login_fail_count || 0;
      const lockoutUntil = existingUser?.lockout_until || null;
      await run('INSERT INTO login_fail_tracker (phone, fail_count, lockout_until) VALUES (?, ?, ?)', phone, failCount, lockoutUntil);
      tracker = { phone, fail_count: failCount, lockout_until: lockoutUntil };
    }
    return tracker;
  }

  // 登录
  fastify.post('/auth/login', {
    // 登录接口独立限流（10 次/分钟/每 IP），弥补全局 600/min 的不足
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        keyGenerator: (request) => request.ip,
      },
    },
    schema: {
      body: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 1 },
          captchaToken: { type: 'string' },
          captchaAnswer: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { phone, password, captchaToken, captchaAnswer } = request.body;
    const configSettings = await getSecurityConfig();
    const lockoutEnabled = configSettings['security.lockout.enabled'];
    const maxAttempts = configSettings['security.lockout.maxAttempts'];
    const durationMinutes = configSettings['security.lockout.durationMinutes'];

    // 1. 获取/创建统一失败追踪记录
    const tracker = await getTracker(phone);

    // 2. 检查是否处于锁定状态（统一从 login_fail_tracker 读取）
    if (lockoutEnabled && tracker.lockout_until) {
      const lockoutTime = new Date(tracker.lockout_until);
      const now = new Date();
      if (lockoutTime > now) {
        const minutesLeft = Math.ceil((lockoutTime - now) / 60000);
        return reply.code(400).send({ code: 400, data: null, message: `账号已被锁定，请于 ${minutesLeft} 分钟后重试` });
      }
      // 锁定已过期，清空
      await run('UPDATE login_fail_tracker SET fail_count = 0, lockout_until = NULL WHERE phone = ?', phone);
      tracker.fail_count = 0;
      tracker.lockout_until = null;
    }

    // 3. 失败 >=2 次后需要验证码
    if (tracker.fail_count >= 2) {
      if (!captchaToken || !verifyCaptcha(captchaToken, captchaAnswer)) {
        const captcha = createCaptcha();
        return reply.code(400).send({
          code: 400,
          data: { needsCaptcha: true, captchaToken: captcha.token, captchaSvg: captcha.svg },
          message: !captchaToken ? '请输入验证码' : '验证码错误',
        });
      }
    }

    // 4. 查询用户
    const user = await get('SELECT * FROM user WHERE phone = ?', phone);

    // 5. 校验密码（用户不存在或密码错误统一处理，防止用户枚举）
    if (!user || !verifyPassword(password, user?.password_hash)) {
      const newFailCount = tracker.fail_count + 1;

      if (lockoutEnabled && newFailCount >= maxAttempts) {
        const lockoutUntil = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
        // 更新 tracker
        await run("UPDATE login_fail_tracker SET fail_count = ?, lockout_until = ?, last_attempt_at = datetime('now','localtime') WHERE phone = ?",
            newFailCount, lockoutUntil, phone);
        // 若用户存在，同步更新 user 表（后台解锁功能依赖 user.login_fail_count）
        if (user) {
          await run('UPDATE user SET login_fail_count = ?, lockout_until = ? WHERE id = ?', newFailCount, lockoutUntil, user.id);
        }
        return reply.code(400).send({ code: 400, data: null, message: '登录过于频繁，请稍后再试' });
      }

      // 更新 tracker
      await run("UPDATE login_fail_tracker SET fail_count = ?, last_attempt_at = datetime('now','localtime') WHERE phone = ?",
          newFailCount, phone);
      if (user) {
        await run('UPDATE user SET login_fail_count = ? WHERE id = ?', newFailCount, user.id);
      }

      const attemptsLeft = maxAttempts - newFailCount;
      const needsCaptcha = newFailCount >= 2;
      const respData = needsCaptcha ? { needsCaptcha: true } : null;
      return reply.code(401).send({
        code: 401,
        data: respData,
        message: `登录名或密码错误，还可尝试 ${attemptsLeft} 次`,
      });
    }

    // 6. 检查用户状态（仍返回通用错误，防止状态枚举）
    if (user.status !== '启用') {
      const newFailCount = tracker.fail_count + 1;
      await run('UPDATE login_fail_tracker SET fail_count = ? WHERE phone = ?', newFailCount, phone);
      return reply.code(401).send({
        code: 401,
        data: null,
        message: `登录名或密码错误，还可尝试 ${maxAttempts - newFailCount} 次`,
      });
    }

    // 7. 登录成功——清空所有失败记录
    await run('DELETE FROM login_fail_tracker WHERE phone = ?', phone);
    await run('UPDATE user SET login_fail_count = 0, lockout_until = NULL WHERE id = ?', user.id);

    const token = await fastify.jwt.sign({ id: user.id, phone: user.phone });
    const expired = isPasswordExpired(user);
    return ok({ token, name: user.name, mustChangePassword: expired });
  });

  // 当前用户信息 + 权限
  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request) => {
    const u = request.currentUser;
    const roles = await all(
      `SELECT r.code, r.name, r.default_home, r.default_theme
         FROM role r JOIN user_role ur ON ur.role_id = r.id
        WHERE ur.user_id = ?`,
      u.id,
    );
    // 超管拥有全部权限，前端用通配标记
    const permissions = u.is_super
      ? ['*']
      : [...fastify.loadUserPermissions(u.id)];

    const userDetail = await get('SELECT created_at, password_changed_at FROM user WHERE id = ?', u.id);
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
    const user = await get('SELECT * FROM user WHERE id = ?', u.id);
    if (!user || !verifyPassword(oldPassword, user.password_hash)) {
      throw badRequest('旧密码错误');
    }

    // 验证新旧密码一致性
    if (oldPassword === newPassword) {
      throw badRequest('新密码不能与旧密码相同');
    }

    // 验证复杂度
    if (!validatePasswordComplexity(newPassword)) {
      const configSettings = await getSecurityConfig();
      const minLength = configSettings['security.password.minLength'];
      throw badRequest(`新密码不符合复杂度要求（长度不能小于 ${minLength} 位，且必须包含大小写字母、数字和特殊字符）`);
    }

    // 更新密码，更新 password_changed_at 并重置错误计数
    await run(
      "UPDATE user SET password_hash=?, updated_at=datetime('now','localtime'), password_changed_at=datetime('now','localtime'), login_fail_count=0, lockout_until=NULL WHERE id=?",
      hashPassword(newPassword),
      u.id
    );
    return ok(null, '密码修改成功');
  });
}

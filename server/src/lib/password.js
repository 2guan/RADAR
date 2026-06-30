/**
 * 文件：lib/password.js
 * 用途：密码哈希与校验工具，基于 Node 内置 crypto 的 scrypt 算法 + 随机盐，
 *       不引入第三方依赖，安全存储用户口令。
 * 作者：hengguan
 * 说明：哈希格式为 "scrypt$<saltHex>$<hashHex>"，校验使用时间安全比较。
 */

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { get } from '../db/index.js';

const KEYLEN = 64;
const DEFAULT_SECURITY_CONFIG = {
  'security.password.complexity': true,
  'security.password.minLength': 8,
  'security.password.expireDays': 90,
  'security.lockout.enabled': true,
  'security.lockout.maxAttempts': 5,
  'security.lockout.durationMinutes': 15,
};

/**
 * 从数据库读取最新的安全参数配置
 */
export async function getSecurityConfig() {
  const defaults = DEFAULT_SECURITY_CONFIG;

  try {
    const keys = Object.keys(defaults);
    const config = {};
    for (const key of keys) {
      const row = await get('SELECT value FROM app_config WHERE key = ?', key);
      if (row && row.value !== null && row.value !== undefined) {
        if (typeof defaults[key] === 'boolean') {
          config[key] = row.value === 'true' || row.value === '1';
        } else if (typeof defaults[key] === 'number') {
          config[key] = parseInt(row.value, 10) || defaults[key];
        } else {
          config[key] = row.value;
        }
      } else {
        config[key] = defaults[key];
      }
    }
    return config;
  } catch (err) {
    return defaults;
  }
}

/**
 * 验证密码复杂度是否符合系统配置规则
 * @param {string} password 明文密码
 * @returns {boolean}
 */
export function validatePasswordComplexity(password, config = DEFAULT_SECURITY_CONFIG) {
  const minLength = config['security.password.minLength'];
  const enableComplexity = config['security.password.complexity'];

  if (typeof password !== 'string') return false;
  if (password.length < minLength) return false;

  if (enableComplexity) {
    if (!/[A-Z]/.test(password)) return false;
    if (!/[a-z]/.test(password)) return false;
    if (!/[0-9]/.test(password)) return false;
    if (!/[!@#$%^&*()_+\-=\[\]{};':",./<>?\\|~`]/.test(password)) return false;
  }
  return true;
}

/**
 * 检查用户密码是否已过期
 * @param {object} user 包含 password_changed_at 与 created_at 的用户对象
 * @returns {boolean}
 */
export function isPasswordExpired(user, config = DEFAULT_SECURITY_CONFIG) {
  if (!user) return false;
  const expireDays = config['security.password.expireDays'];

  if (!expireDays || expireDays <= 0) return false;

  const changedAtValue = user.password_changed_at || user.created_at;
  if (!changedAtValue) return false;

  const changedAt = changedAtValue instanceof Date
    ? changedAtValue
    : new Date(String(changedAtValue).replace(' ', 'T'));
  if (Number.isNaN(changedAt.getTime())) return false;
  const now = new Date();
  const diffTime = now - changedAt;
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays > expireDays;
}

/**
 * 生成密码哈希。
 * @param {string} password 明文密码
 * @returns {string} 形如 scrypt$salt$hash 的存储串
 */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/**
 * 校验密码是否匹配。
 * @param {string} password 明文密码
 * @param {string} stored 存储的哈希串
 * @returns {boolean}
 */
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, KEYLEN);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

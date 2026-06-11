/**
 * 文件：lib/password.js
 * 用途：密码哈希与校验工具，基于 Node 内置 crypto 的 scrypt 算法 + 随机盐，
 *       不引入第三方依赖，安全存储用户口令。
 * 作者：hengguan
 * 说明：哈希格式为 "scrypt$<saltHex>$<hashHex>"，校验使用时间安全比较。
 */

import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const KEYLEN = 64;

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

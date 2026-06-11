/**
 * 文件：test/lib.test.js
 * 用途：核心纯函数库单元测试（密码哈希、排期偏差率）。不依赖数据库与网络，快速回归。
 * 作者：hengguan
 * 运行：cd server && npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../src/lib/password.js';
import { calcDeviation } from '../src/lib/deviation.js';

test('密码哈希：正确密码校验通过、错误密码失败', () => {
  const h = hashPassword('admin2026');
  assert.ok(h.startsWith('scrypt$'));
  assert.equal(verifyPassword('admin2026', h), true);
  assert.equal(verifyPassword('wrong', h), false);
  assert.equal(verifyPassword('admin2026', 'badformat'), false);
});

test('排期偏差率：延期为正、提前为负、信息不全为 null', () => {
  // 计划 10 天，实际结束晚 5 天 -> 50%
  assert.equal(calcDeviation('2026-07-01', '2026-07-10', '2026-07-15'), 56);
  // 提前结束 -> 负值
  assert.ok(calcDeviation('2026-07-01', '2026-07-10', '2026-07-05') < 0);
  // 缺少实际结束 -> null
  assert.equal(calcDeviation('2026-07-01', '2026-07-10', null), null);
});

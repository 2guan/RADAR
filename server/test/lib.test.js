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

import { reqOrg } from '../src/modules/overview/routes.js';

test('reqOrg 实施机构分组逻辑：第一优先级（主责系统第一个开发任务的开发实施方）', () => {
  const req = {
    req_code: 'RC_001',
    main_systems: JSON.stringify(['SYS001', 'SYS002']),
    propose_dept: '提出部门A'
  };
  const sysMap = {
    SYS001: { name: '系统1', org: '系统机构1' },
    SYS002: { name: '系统2', org: '系统机构2' }
  };
  const devMap = {
    RC_001: [
      { id: 1, impl_system: 'SYS002', impl_org: '开发实施方2' },
      { id: 2, impl_system: 'SYS001', impl_org: '开发实施方1' }
    ]
  };
  // 匹配第一个主责系统相关的开发任务（SYS002的id较小，所以应该匹配到SYS002）
  assert.equal(reqOrg(req, sysMap, devMap), '开发实施方2');
});

test('reqOrg 实施机构分组逻辑：第一优先级（但开发任务开发实施方为空，回退到第二优先级）', () => {
  const req = {
    req_code: 'RC_001',
    main_systems: JSON.stringify(['SYS001', 'SYS002']),
    propose_dept: '提出部门A'
  };
  const sysMap = {
    SYS001: { name: '系统1', org: '系统机构1' },
    SYS002: { name: '系统2', org: '系统机构2' }
  };
  const devMap = {
    RC_001: [
      { id: 1, impl_system: 'SYS002', impl_org: null }
    ]
  };
  assert.equal(reqOrg(req, sysMap, devMap), '系统机构1');
});

test('reqOrg 实施机构分组逻辑：第二优先级（第一个主责系统对应的所属机构）', () => {
  const req = {
    req_code: 'RC_001',
    main_systems: JSON.stringify(['SYS001', 'SYS002']),
    propose_dept: '提出部门A'
  };
  const sysMap = {
    SYS001: { name: '系统1', org: '系统机构1' },
    SYS002: { name: '系统2', org: '系统机构2' }
  };
  // 没有匹配的主责系统开发任务（或者开发任务没有impl_org）
  const devMap = {
    RC_001: [
      { id: 1, impl_system: 'SYS003', impl_org: '其他开发实施方' }
    ]
  };
  // 应该回退到系统的第一个主责系统（SYS001）对应的机构
  assert.equal(reqOrg(req, sysMap, devMap), '系统机构1');
});

test('reqOrg 实施机构分组逻辑：第三优先级（需求提出部门）', () => {
  const req = {
    req_code: 'RC_001',
    main_systems: JSON.stringify([]),
    propose_dept: '提出部门A'
  };
  const sysMap = {};
  const devMap = {};
  assert.equal(reqOrg(req, sysMap, devMap), '提出部门A');
});

test('reqOrg 实施机构分组逻辑：第四优先级（未分配机构兜底）', () => {
  const req = {
    req_code: 'RC_001',
    main_systems: null,
    propose_dept: null
  };
  const sysMap = {};
  const devMap = {};
  assert.equal(reqOrg(req, sysMap, devMap), '未分配机构');
});


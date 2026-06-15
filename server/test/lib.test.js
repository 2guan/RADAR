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

import { validatePasswordComplexity } from '../src/lib/password.js';

test('密码复杂度校验：满足各项复杂度要求时通过，不满足时拒绝', () => {
  // 满足：大写、小写、数字、特殊字符，长度>=8
  assert.equal(validatePasswordComplexity('Radar@2026!'), true);
  // 长度不够
  assert.equal(validatePasswordComplexity('Rad@12'), false);
  // 无大写
  assert.equal(validatePasswordComplexity('radar@2026!'), false);
  // 无小写
  assert.equal(validatePasswordComplexity('RADAR@2026!'), false);
  // 无数字
  assert.equal(validatePasswordComplexity('Radar@xxxx!'), false);
  // 无特殊字符
  assert.equal(validatePasswordComplexity('Radar2026x'), false);
});

import { extract, matchFilters } from '../src/lib/chart-dims.js';

test('chart-dims 维度提取与过滤：阶段与任务状态，以及全部（all）数据源', () => {
  const req = {
    req_code: 'RC_001',
    status: '需求登记',
    propose_dept: '部门A',
    main_systems: JSON.stringify(['SYS001'])
  };
  const ctx = {
    sysMap: {
      SYS001: { name: '系统1', org: '机构1', sector: '板块1' }
    },
    devMap: {
      RC_001: [
        { status: '开发承接' }
      ]
    },
    testMap: {
      RC_001: {
        SIT: [{ status: '测试实施' }]
      }
    },
    rtMap: {
      RC_001: '待评审'
    }
  };

  // 1. 验证 stage 提取：链条中需求登记(doing), 开发承接(doing), SIT测试实施(doing), RT待评审(doing)
  // nodeState中，开发承接是非终态 -> state='doing'
  // buildChain中：需求(doing), 开发(doing), SIT(doing), UAT(pending), 投产(doing)
  // current = nodes.find(state === 'doing')，应该找到第一个 'doing'，即“需求”
  const stages = extract('requirement', 'stage', req, ctx);
  assert.deepEqual(stages, ['需求']);

  // 2. 验证 task_status 提取
  const taskStatus = extract('requirement', 'task_status', req, ctx);
  assert.deepEqual(taskStatus, ['需求-需求登记']);

  // 3. 验证 all 数据源支持
  const rowWithSource = {
    ...req,
    _source: 'requirement'
  };
  const org = extract('all', 'org', rowWithSource, ctx);
  assert.deepEqual(org, ['机构1']);

  // 4. 验证 matchFilters 与 all 数据源结合
  const filters = {
    org: ['机构1'],
    stage: ['需求']
  };
  assert.equal(matchFilters('all', rowWithSource, filters, ctx), true);
});


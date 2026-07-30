/**
 * 文件：server/test/governance-utils.test.js
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：自动化回归测试。
 * 作者：hengguan
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globToRegExp, matches } from '../../scripts/governance-utils.mjs';

test('治理路径匹配：双星号匹配任意深度目录', () => {
  assert.equal(globToRegExp('server/src/**').test('server/src/modules/requirements/routes.js'), true);
  assert.equal(matches('.github/workflows/ci.yml', ['.github/**']), true);
  assert.equal(matches('docs/requirements/hengguan/REQ-1/requirement.md', ['docs/**']), true);
});

test('治理路径匹配：单星号不跨目录', () => {
  assert.equal(matches('server/src/app.js', ['server/src/*.js']), true);
  assert.equal(matches('server/src/modules/tickets/routes.js', ['server/src/*.js']), false);
});

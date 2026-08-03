/**
 * 文件：web/test/test-intake-modal.test.mjs
 * 说明：保护承接候选来源、角色只读展示及手机端候选分页语义。
 * 用途：避免重新接入受机构范围限制的需求/工单列表、将角色误做成可编辑控件或遗漏移动分页。
 * 作者：hengguan
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/modules/testing/components/TestIntakeModal.jsx');
const source = fs.readFileSync(filePath, 'utf8');
const devFilePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/modules/development/components/DevIntakeModal.jsx');
const devSource = fs.readFileSync(devFilePath, 'utf8');

test('测试承接使用专用跨机构候选接口，不复用受范围限制的需求和工单列表', () => {
  assert.match(source, /apiPost\('\/test-tasks\/intake-candidates', \{ releasePointIds, testType \}\)/);
  assert.doesNotMatch(source, /apiPost\('\/requirements\/list'/);
  assert.doesNotMatch(source, /apiPost\('\/tickets\/list'/);
});

test('测试承接角色列只读显示，不渲染角色选择器', () => {
  const previewColumns = source.slice(source.indexOf('const previewColumns'), source.indexOf('const selectedCard'));
  assert.match(previewColumns, /title: '角色'.*<Tag/s);
  assert.doesNotMatch(previewColumns, /<Select[^>]*role/);
});

test('开发和测试承接的手机端候选列表每页显示五条，并在搜索时回到第一页', () => {
  for (const intakeSource of [devSource, source]) {
    assert.match(intakeSource, /const \[candidatePage, setCandidatePage\] = useState\(1\)/);
    assert.match(intakeSource, /pagination=\{filteredCandidates\.length > 5 \? \{ current: candidatePage, pageSize: 5,/);
    assert.match(intakeSource, /setSearchText\(event\.target\.value\); setCandidatePage\(1\)/);
    assert.match(intakeSource, /setCandidates\(items\); setCandidatePage\(1\)/);
  }
});

/**
 * 文件：web/test/release-point-format.test.mjs
 * 说明：覆盖投产点展示与普通业务日期的格式边界，防止再次错误复用日期展示工具。
 * 用途：验证投产点八位业务标识和待定文本的稳定展示。
 * 作者：hengguan
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReleasePointDate, isNumericReleasePoint } from '../src/modules/settings/reference-data/components/release-point-format.js';

test('投产点数值日期保持 YYYYMMDD，不转换为通用日期展示格式', () => {
  assert.equal(formatReleasePointDate('20260525'), '20260525');
  assert.equal(formatReleasePointDate(20260525), '20260525');
  assert.equal(isNumericReleasePoint('20260525'), true);
});

test('投产点待定、空值和普通日期文本保持原始语义', () => {
  assert.equal(formatReleasePointDate('投产点待定'), '投产点待定');
  assert.equal(formatReleasePointDate(''), '');
  assert.equal(formatReleasePointDate('2026-5-25'), '2026-5-25');
  assert.equal(isNumericReleasePoint('投产点待定'), false);
});

/**
 * 文件：scripts/check-dependency-audit.mjs
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：项目治理与自动化检查。
 * 作者：hengguan
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'governance/security-audit-baseline.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
if (today > baseline.review_by) throw new Error('Security audit baseline expired on ' + baseline.review_by);

const levels = ['info', 'low', 'moderate', 'high', 'critical'];
const violations = [];
for (const packageName of ['server', 'web']) {
  const result = spawnSync('npm', ['audit', '--omit=dev', '--prefix', packageName, '--json'], {
    cwd: root, encoding: 'utf8',
  });
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error('npm audit did not return JSON for ' + packageName + ': ' + result.stderr);
  }
  if (!report.metadata?.vulnerabilities) {
    throw new Error('npm audit returned no vulnerability metadata for ' + packageName + ': ' + (report.message || result.stderr));
  }
  const actual = report.metadata?.vulnerabilities || {};
  const allowed = baseline.packages[packageName];
  for (const level of levels) {
    const count = Number(actual[level] || 0);
    if (level === 'critical' && count > 0) violations.push(packageName + ': critical vulnerability count is ' + count);
    else if (count > Number(allowed[level] || 0)) {
      violations.push(packageName + ': ' + level + ' vulnerabilities increased from ' + (allowed[level] || 0) + ' to ' + count);
    }
  }
  console.log(packageName + ' dependency audit: ' + JSON.stringify(actual));
}
if (violations.length) {
  console.error('Dependency audit baseline check failed:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('Dependency audit baseline check passed; review by ' + baseline.review_by + '.');

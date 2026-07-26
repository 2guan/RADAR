/**
 * 文件：scripts/check-dependency-audit.mjs
 * 说明：npm registry 的 advisory 批量接口偶尔返回未标注 gzip 的响应，不能依赖 npm CLI 的兼容分支。
 * 用途：按 package-lock 的生产依赖直接查询 npm 官方漏洞公告，并与已审批的安全基线比较。
 * 作者：hengguan
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const root = process.cwd();
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'governance/security-audit-baseline.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
if (today > baseline.review_by) throw new Error('Security audit baseline expired on ' + baseline.review_by);

const levels = ['info', 'low', 'moderate', 'high', 'critical'];
const severityIndex = new Map(levels.map((level, index) => [level, index]));

// package-lock 的嵌套路径还原为 npm 包名，作用域包需要保留两段路径。
function packageNameFromLocation(location) {
  const tail = location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length).split('/');
  return tail[0].startsWith('@') ? tail.slice(0, 2).join('/') : tail[0];
}

// 仅收集生产依赖；同一包的多个嵌套版本合并为一次公告查询。
function productionPackages(lock) {
  const packages = {};
  for (const [location, item] of Object.entries(lock.packages || {})) {
    if (!location || !location.includes('node_modules/') || item.dev || item.link || !item.version) continue;
    const name = packageNameFromLocation(location);
    if (!name) continue;
    (packages[name] ||= new Set()).add(item.version);
  }
  return Object.fromEntries(Object.entries(packages).map(([name, versions]) => [name, [...versions]]));
}

// registry 当前会在部分网络环境返回未声明的 gzip 内容，按魔数解压以兼容两种响应。
function parseAdvisoryResponse(body) {
  const decoded = body[0] === 0x1f && body[1] === 0x8b ? gunzipSync(body) : body;
  return JSON.parse(decoded.toString('utf8'));
}

// 直接使用 npm 官方 bulk advisory 接口，避免 npm CLI 旧的 audit 请求回退路径。
async function advisoryReport(packages) {
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(packages),
  });
  const body = Buffer.from(await response.arrayBuffer());
  const report = parseAdvisoryResponse(body);
  if (!response.ok) throw new Error('npm advisory request failed: ' + (report.message || response.status));
  return report;
}

// 一个包命中多条公告时按最高严重性计数，与既有安全基线的统计口径保持一致。
async function vulnerabilityCounts(packageName) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, packageName, 'package-lock.json'), 'utf8'));
  const packages = productionPackages(lock);
  const report = await advisoryReport(packages);
  const require = createRequire(path.join(root, packageName, 'package.json'));
  const semver = require('semver');
  const counts = Object.fromEntries(levels.map((level) => [level, 0]));

  for (const [name, advisories] of Object.entries(report)) {
    const matched = advisories.filter((advisory) => packages[name]?.some((version) =>
      semver.satisfies(version, advisory.vulnerable_versions, { loose: true }),
    ));
    if (!matched.length) continue;
    const severity = matched.reduce((highest, advisory) =>
      (severityIndex.get(advisory.severity) > severityIndex.get(highest) ? advisory.severity : highest), 'info');
    counts[severity] += 1;
  }
  return counts;
}

const violations = [];
for (const packageName of ['server', 'web']) {
  const actual = await vulnerabilityCounts(packageName);
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

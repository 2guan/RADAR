/**
 * 文件：scripts/check-licenses.mjs
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：项目治理与自动化检查。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';
import { readJsonYaml, root } from './governance-utils.mjs';

const policy = readJsonYaml('governance/license-policy.json');
if (new Date(policy.review_by + 'T23:59:59Z') < new Date()) throw new Error('License policy review expired on ' + policy.review_by);
const violations = [];
for (const packageName of ['server', 'web']) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, packageName, 'package-lock.json'), 'utf8'));
  for (const [entry, metadata] of Object.entries(lock.packages || {})) {
    if (!entry || !metadata.version) continue;
    const license = metadata.license;
    if (!license) {
      const allowlistKey = packageName + ':' + entry;
      if (!policy.missing_license_allowlist?.[allowlistKey]) {
        violations.push(packageName + ': ' + entry + ' is missing license metadata');
      }
      continue;
    }
    if (policy.forbidden_license_tokens.some((token) => license.includes(token))) {
      violations.push(packageName + ': ' + entry + ' uses forbidden license ' + license);
    }
  }
}
if (violations.length) {
  console.error('License check failed:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('License check passed; policy review by ' + policy.review_by + '.');

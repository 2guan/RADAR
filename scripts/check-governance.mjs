/**
 * 文件：scripts/check-governance.mjs
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：项目治理与自动化检查。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';
import { readJsonYaml, root } from './governance-utils.mjs';

const manifest = readJsonYaml('governance/modules.yaml');
const codeownersFile = path.join(root, '.github/CODEOWNERS');
const codeowners = fs.existsSync(codeownersFile) ? fs.readFileSync(codeownersFile, 'utf8') : '';
const activeCodeowners = codeowners.split('\n').filter((line) => line.trim() && !line.trim().startsWith('#'));
const violations = [];

if (!activeCodeowners.length) violations.push('.github/CODEOWNERS has no active ownership rules');
for (const [name, definition] of Object.entries(manifest.modules || {})) {
  const owners = definition.owners || {};
  if (!owners.primary || owners.primary === 'UNASSIGNED') violations.push(name + ': primary owner is missing');
  if (!owners.backup || owners.backup === 'UNASSIGNED') violations.push(name + ': backup owner is missing');
  if (!Array.isArray(owners.approvers) || !owners.approvers.includes(owners.primary)) {
    violations.push(name + ': primary owner must be an approver');
  }
  for (const contract of definition.public_contracts || []) {
    const directory = contract.endsWith('/**') ? contract.slice(0, -3) : contract;
    if (!fs.existsSync(path.join(root, directory))) violations.push(name + ': declared public contract is missing: ' + contract);
  }
}
if (codeowners.includes('UNASSIGNED')) violations.push('.github/CODEOWNERS must not contain UNASSIGNED');
if (!activeCodeowners.some((line) => /^\*\s+@/.test(line))) {
  violations.push('.github/CODEOWNERS must provide an active repository-wide owner while a single maintainer owns all modules');
}

if (violations.length) {
  console.error('Governance check failed:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('Governance check passed for ' + Object.keys(manifest.modules || {}).length + ' module(s).');

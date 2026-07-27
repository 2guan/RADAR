/**
 * 文件：scripts/check-ai-scope.mjs
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：项目治理与自动化检查。
 * 作者：hengguan
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { readJsonYaml, matches, moduleForFile, normalize, root } from './governance-utils.mjs';

const args = process.argv.slice(2);
// 未传入的可选参数应返回 undefined，不能回退读取命令行第一个参数。
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const scopeFile = option('--scope');
const base = option('--base') || 'HEAD~1';
const head = option('--head') || 'HEAD';
const includeWorkingTree = args.includes('--working-tree');

// 先校验任务描述完整性，避免对未准入需求执行后续文件范围判断。
if (!scopeFile) throw new Error('Usage: node scripts/check-ai-scope.mjs --scope docs/requirements/REQ-.../ai-task-scope.yaml [--base ref] [--head ref]');
const scope = readJsonYaml(scopeFile);
for (const key of ['requirement', 'assignment', 'ai', 'scope', 'database', 'external_access', 'required_tests', 'risk', 'completion']) {
  if (!(key in scope)) throw new Error(scopeFile + ' is missing ' + key);
}
for (const key of ['writable_paths', 'read_only_paths', 'forbidden_paths']) {
  if (!Array.isArray(scope.scope[key])) throw new Error(scopeFile + '.scope.' + key + ' must be an array');
}
if (scope.ai.production_access) throw new Error('AI task scope must not permit production access');
if (scope.ai.contains_confidential_information && scope.requirement.internet_ai_coding_allowed !== false) {
  throw new Error('Confidential AI task must disable internet AI coding');
}
if (scope.requirement.status !== 'ready') throw new Error('AI task scope must reference a ready requirement');
const manifest = readJsonYaml('governance/modules.yaml');
const assignment = scope.assignment || {};
const moduleDefinition = manifest.modules?.[assignment.module];
if (!moduleDefinition) throw new Error('AI task scope references an unknown module: ' + assignment.module);
if (!assignment.developer || assignment.developer === 'UNASSIGNED') throw new Error('AI task scope must assign a developer');
if (!assignment.module_owner || assignment.module_owner === 'UNASSIGNED') throw new Error('AI task scope must assign a module owner');
if (assignment.module_owner !== moduleDefinition.owners?.primary) {
  throw new Error('AI task scope module_owner must match the module primary owner');
}
const requirementDocument = path.join(root, scope.requirement.document || '');
if (!fs.existsSync(requirementDocument)) throw new Error('AI task scope requirement document is missing');
const documentStatus = fs.readFileSync(requirementDocument, 'utf8').match(/^status:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1];
if (documentStatus !== 'ready') throw new Error('Requirement document must have status: ready');

const branchException = scope.branch_policy_exception || {};
const usesMainBranch = assignment.branch === 'main' || assignment.worktree === 'repository-root';
if (usesMainBranch) {
  if (!branchException.allowed || !branchException.authorized_by || !branchException.review_by) {
    throw new Error('main branch or repository-root worktree requires an explicit branch_policy_exception');
  }
  if (new Date(branchException.review_by + 'T23:59:59Z') < new Date()) {
    throw new Error('branch_policy_exception expired on ' + branchException.review_by);
  }
} else if (!/^(feat|fix|hotfix|docs|chore)\/REQ-\d{8}-\d{3}-[a-z0-9-]+$/.test(assignment.branch || '')) {
  throw new Error('AI task branch must follow <type>/REQ-YYYYMMDD-NNN-short-name');
}
// 高风险任务至少声明 API 与权限测试，不能仅依赖构建成功。
if (!Array.isArray(scope.required_tests) || !scope.required_tests.some((item) => item.name === 'api') || !scope.required_tests.some((item) => item.name === 'permission')) {
  throw new Error('AI task scope must declare API and permission tests');
}

const committedChanged = execFileSync('git', ['diff', '--name-only', base + '...' + head], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean).map(normalize);
const workingTreeChanged = includeWorkingTree
  ? [
    ...execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: root, encoding: 'utf8' }).split('\n'),
    ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\n'),
  ].filter(Boolean).map(normalize)
  : [];
const changed = [...new Set([...committedChanged, ...workingTreeChanged])];
const violations = [];
// 逐文件应用禁止、只读、可写三层规则；禁止路径优先级最高。
for (const file of changed) {
  if (matches(file, scope.scope.forbidden_paths)) violations.push(file + ': forbidden path');
  else if (matches(file, scope.scope.read_only_paths)) violations.push(file + ': read-only path');
  else if (!matches(file, scope.scope.writable_paths)) violations.push(file + ': outside writable_paths');
}
// platform 是由业务模块只读使用的底层能力；非平台治理任务不得直接修改。
// shared 允许跨模块读写，但仍须通过公共能力变更流程，避免破坏公共复用能力。
for (const file of changed) {
  const targetModule = moduleForFile(manifest, file);
  const targetDefinition = targetModule ? manifest.modules[targetModule] : null;
  if (targetDefinition?.type === 'platform' && assignment.module !== targetModule && assignment.module !== 'governance') {
    violations.push(file + ': platform module is read-only outside its owner or governance task');
  }
}
// 平台、共享能力和模块公开入口变更都必须有公共能力审批记录。
const publicChange = changed.some((file) => {
  const targetModule = moduleForFile(manifest, file);
  const targetDefinition = targetModule ? manifest.modules[targetModule] : null;
  return targetDefinition?.type === 'platform'
    || targetDefinition?.type === 'shared'
    || targetDefinition?.type === 'business' && /\/index\.js$/.test(file);
});
if (publicChange) {
  const change = scope.public_capability_change || {};
  if (!change.required || !change.shared_change_issue || !change.old_behavior_preserved || !change.owner_approved) {
    violations.push('public capability change requires declaration, Shared Change Issue, owner approval and old behavior preservation');
  }
}
if (violations.length) {
  console.error('AI scope check failed for ' + scope.requirement.id + ':\n' + violations.join('\n'));
  process.exit(1);
}
console.log('AI scope check passed for ' + scope.requirement.id + '; ' + changed.length + ' changed file(s)' + (includeWorkingTree ? ' including working tree.' : '.'));

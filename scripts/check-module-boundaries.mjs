/**
 * 文件：scripts/check-module-boundaries.mjs
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：项目治理与自动化检查。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';
import { readJsonYaml, moduleForFile, isPublicContract, normalize, root } from './governance-utils.mjs';

const manifest = readJsonYaml('governance/modules.yaml');
const legacyBaseline = readJsonYaml('governance/legacy-boundary-baseline.json');
const violations = [];
const sourceFiles = [];
let grandfatheredLegacyEdges = 0;

function collect(directory) {
  const full = path.join(root, directory);
  if (!fs.existsSync(full)) return;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(relative);
    else if (/\.(js|jsx)$/.test(entry.name)) sourceFiles.push(normalize(relative));
  }
}

function resolveImport(file, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(root, path.dirname(file), specifier);
  const candidates = [base, base + '.js', base + '.jsx', path.join(base, 'index.js'), path.join(base, 'index.jsx')];
  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  return existing ? normalize(path.relative(root, existing)) : null;
}

collect('server/src');
collect('web/src');
for (const file of sourceFiles) {
  const strictSource = /^server\/src\/modules\/[^/]+\//.test(file)
    || /^server\/src\/platform\//.test(file)
    || /^web\/src\/modules\//.test(file);
  if (!strictSource) continue;
  // 组合根负责装配业务路由，不属于业务模块依赖。
  if (file === 'server/src/platform/register-modules.js') continue;
  const fromModule = moduleForFile(manifest, file);
  if (!fromModule) continue;
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const specs = [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)].map((match) => match[1]);
  for (const specifier of specs) {
    const target = resolveImport(file, specifier);
    if (!target) continue;
    const toModule = moduleForFile(manifest, target);
    if (!toModule || toModule === fromModule) continue;
    const fromDef = manifest.modules[fromModule];
    const toDef = manifest.modules[toModule];
    const legacyRouteBridge = /\/routes\.js$/.test(file)
      && (target.startsWith('server/src/lib/') || target.startsWith('server/src/db/') || target.startsWith('server/src/shared/') || target === 'server/src/config.js');
    if (legacyRouteBridge) {
      grandfatheredLegacyEdges++;
      continue;
    }
    const platformHttpAdapter = fromDef.type === 'platform'
      && /^server\/src\/platform\/[^/]+\/api\//.test(file)
      && (fromDef.allowed_dependencies || []).includes(toModule);
    if ((fromDef.type === 'platform' || fromDef.type === 'shared') && toDef.type === 'business' && !platformHttpAdapter) {
      violations.push(file + ' (' + fromModule + ') must not depend on business module ' + toModule);
      continue;
    }
    if (!(fromDef.allowed_dependencies || []).includes(toModule)) {
      violations.push(file + ' (' + fromModule + ') depends on undeclared module ' + toModule);
      continue;
    }
    if (!isPublicContract(toDef, target)) {
      violations.push(file + ' imports private implementation ' + target + ' of ' + toModule);
    }
  }
}
if (violations.length) {
  console.error('Module boundary violations:\n' + violations.join('\n'));
  process.exit(1);
}
if (new Date(legacyBaseline.review_by + 'T23:59:59Z') < new Date()) {
  console.error('Legacy boundary baseline expired on ' + legacyBaseline.review_by);
  process.exit(1);
}
if (grandfatheredLegacyEdges > legacyBaseline.grandfathered_route_to_legacy_edges) {
  console.error('Legacy boundary baseline exceeded: ' + grandfatheredLegacyEdges + ' > ' + legacyBaseline.grandfathered_route_to_legacy_edges);
  process.exit(1);
}
console.log('Module boundary check passed for ' + sourceFiles.length + ' source file(s); grandfathered route-to-legacy edges: ' + grandfatheredLegacyEdges + '.');

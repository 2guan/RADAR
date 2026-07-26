/**
 * 文件：scripts/governance-utils.mjs
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：项目治理与自动化检查。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';

export const root = process.cwd();

export function readJsonYaml(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  } catch (error) {
    throw new Error(file + ' must be JSON-compatible YAML: ' + error.message);
  }
}

export function normalize(file) {
  return file.split(path.sep).join('/').replace(/^\.\//, '');
}

export function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*\*\//g, '::GLOBSTAR_SLASH::')
    .replace(/\*\*/g, '::GLOBSTAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::GLOBSTAR_SLASH::/g, '(?:.*/)?')
    .replace(/::GLOBSTAR::/g, '.*');
  return new RegExp('^' + escaped + '$');
}

export function matches(file, patterns = []) {
  return patterns.some((pattern) => globToRegExp(pattern).test(normalize(file)));
}

export function modulePaths(definition) {
  return Object.values(definition.paths || {}).flat();
}

export function moduleForFile(manifest, file) {
  const matchesForFile = Object.entries(manifest.modules || {}).filter(([, definition]) => matches(file, modulePaths(definition)));
  return matchesForFile[0]?.[0] || null;
}

export function isPublicContract(definition, file) {
  return matches(file, definition?.public_contracts || []);
}

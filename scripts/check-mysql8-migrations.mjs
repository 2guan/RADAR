/**
 * 文件：scripts/check-mysql8-migrations.mjs
 * 说明：本文件遵循模块边界；跨模块能力必须经公开契约访问。
 * 用途：项目治理与自动化检查。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';

const directory = path.join(process.cwd(), 'server/src/platform/persistence/migrations/tdsql');
const forbidden = [
  { pattern: /\bPRAGMA\b/i, name: 'SQLite PRAGMA' },
  { pattern: /\bAUTOINCREMENT\b/i, name: 'SQLite AUTOINCREMENT' },
  { pattern: /\bdatetime\s*\(/i, name: 'SQLite datetime()' },
  { pattern: /\bstrftime\s*\(/i, name: 'SQLite strftime()' }
];
const violations = [];
for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.sql'))) {
  const source = fs.readFileSync(path.join(directory, file), 'utf8');
  for (const item of forbidden) if (item.pattern.test(source)) violations.push(file + ': contains ' + item.name);
}
if (violations.length) {
  console.error('MySQL 8 migration compatibility failed:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('MySQL 8 migration static compatibility check passed.');

/**
 * 文件：scripts/check-code-comments.mjs
 * 说明：将注释规范前置到持续集成，避免多人协作时注释随功能迭代缺失或字段顺序不一致。
 * 用途：校验可执行源码、样式、容器脚本和数据库迁移的中文文件头、作者信息和关键逻辑注释。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';
import { root, normalize } from './governance-utils.mjs';

const sourceFiles = [];
const violations = [];
const sourceRoots = ['scripts', 'server/scripts', 'server/src', 'server/test', 'web/src'];

function collect(directory) {
  const fullDirectory = path.join(root, directory);
  if (!fs.existsSync(fullDirectory)) return;
  for (const entry of fs.readdirSync(fullDirectory, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(relative);
    else if (/\.(?:js|jsx|mjs|css|sql|sh)$/.test(entry.name)) sourceFiles.push(normalize(relative));
  }
}

function inspectHeader(file, source) {
  const lines = source.split(/\r?\n/);
  // 可执行脚本的 shebang 必须位于文件首行，文件头从其后的首个块注释开始。
  const start = lines[0]?.startsWith('#!') ? 1 : 0;
  const isBlockComment = ['.js', '.jsx', '.mjs', '.css'].some((extension) => file.endsWith(extension));
  const isSql = file.endsWith('.sql');
  const isHashComment = file.endsWith('.sh') || file === 'Dockerfile';
  if (isBlockComment && lines[start]?.trim() !== '/**') return { error: '缺少文件头注释', bodyStart: start };
  if (isSql && !lines.slice(start, start + 8).some((line) => line.includes('文件：'))) return { error: '缺少文件头注释', bodyStart: start };
  if (isHashComment && !lines.slice(start, start + 10).some((line) => line.includes('文件：'))) return { error: '缺少文件头注释', bodyStart: start };
  const end = isBlockComment
    ? lines.findIndex((line, index) => index >= start && line.trim() === '*/')
    : lines.findIndex((line, index) => index >= start && /^\s*$/.test(line));
  if (end < 0) return { error: '文件头注释未闭合', bodyStart: start };
  const header = lines.slice(start, end + 1).join('\n');
  const markers = ['文件：', '说明：', '用途：', '作者：hengguan'];
  const positions = markers.map((marker) => header.indexOf(marker));
  for (let index = 0; index < markers.length; index++) {
    if (positions[index] < 0) return { error: '文件头缺少“' + markers[index] + '”', bodyStart: end + 1 };
    if (index > 0 && positions[index] < positions[index - 1]) {
      return { error: '文件头字段必须按“文件、说明、用途、作者”顺序书写', bodyStart: end + 1 };
    }
  }
  const declaredFile = header.match(/文件：\s*([^\r\n*#]+)/)?.[1]?.trim();
  if (declaredFile !== file) return { error: '文件头“文件”必须填写仓库相对路径，当前为“' + (declaredFile || '空') + '”', bodyStart: end + 1 };
  if (!/[\u4e00-\u9fff]/.test(header)) return { error: '文件头必须使用中文说明', bodyStart: end + 1 };
  return { bodyStart: end + 1 };
}

for (const directory of sourceRoots) collect(directory);
// Vite 配置是前端构建入口，不位于 web/src，也纳入同一注释规则。
if (fs.existsSync(path.join(root, 'web/vite.config.js'))) sourceFiles.push('web/vite.config.js');
if (fs.existsSync(path.join(root, 'Dockerfile'))) sourceFiles.push('Dockerfile');

for (const file of sourceFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const header = inspectHeader(file, source);
  if (header.error) {
    violations.push(file + '：' + header.error);
    continue;
  }
  const lines = source.split(/\r?\n/);
  // 较长文件必须在实现区保留至少两处逻辑说明；仅有文件头不足以解释分支和聚合规则。
  if (lines.length >= 80) {
    const body = lines.slice(header.bodyStart).join('\n');
    const commentPattern = file.endsWith('.sql') ? /--/g : file.endsWith('.sh') || file === 'Dockerfile' ? /#/g : /\/\/|\/\*/g;
    const logicCommentCount = (body.match(commentPattern) || []).length;
    if (logicCommentCount < 2) violations.push(file + '：长度不少于 80 行的文件缺少中部逻辑注释');
  }
}

if (violations.length) {
  console.error('代码注释检查失败：\n' + violations.join('\n'));
  process.exit(1);
}

console.log('代码注释检查通过：' + sourceFiles.length + ' 个源码文件均包含中文文件头、作者信息和必要的逻辑注释。');

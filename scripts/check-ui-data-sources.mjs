/**
 * 文件：scripts/check-ui-data-sources.mjs
 * 说明：以低误报规则阻止业务界面绕过平台选择组件，并对可维护数据的显式硬编码提供 CI 反馈。
 * 用途：检查原生选择控件、Ant Design 显式 Option 节点、受控字段误用文本框及常见可维护选项数组。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';
import { normalize, root } from './governance-utils.mjs';

const scanRoots = ['web/src/modules', 'web/src/shared'];
const sourceFiles = [];
const violations = [];
const controlledLabels = new Set([
  '状态', '实施机构', '所属机构', '组织机构', '实施系统', '主责系统', '协同系统',
  '负责人', '提出人', '投产负责人', '投产点', '计划投产点', '需求类型', '工单类型',
]);

function collect(directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = normalize(path.join(directory, entry.name));
    if (entry.isDirectory()) collect(relative);
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) sourceFiles.push(relative);
  }
}

function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function allowlisted(source, index) {
  const preceding = source.slice(Math.max(0, index - 240), index);
  return /radar-ui-governance-allow:\s*\S+/i.test(preceding);
}

function add(file, source, index, message) {
  if (!allowlisted(source, index)) violations.push(`${file}:${lineNumber(source, index)} ${message}`);
}

for (const directory of scanRoots) collect(directory);

for (const file of sourceFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');

  // 原生 select/option 与显式 Select.Option 会把选项所有权留在页面；统一要求数据驱动 options 或公共组件。
  for (const match of source.matchAll(/<(?:select|option|Select\.Option)\b/g)) {
    add(file, source, match.index, '禁止在业务/共享界面新增原生或显式选项节点；请使用平台公共选择组件或数据驱动 options。');
  }

  // 对人员、机构、系统、投产点、状态等高频可维护概念，只在数组中出现两个以上字符串时判定为硬编码。
  const optionArray = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*(?:status|system|org|user|person|department|releasePoint)[\w$]*(?:Options?|List|Items))\s*=\s*\[([\s\S]*?)\]/gi;
  for (const match of source.matchAll(optionArray)) {
    const stringCount = (match[2].match(/(?:'[^'\n]*'|"[^"\n]*"|`[^`\n]*`)/g) || []).length;
    if (stringCount >= 2) add(file, source, match.index, `疑似硬编码可维护数据“${match[1]}”；请改用 settings 数据源或公共组件。`);
  }

  // 精确受控字段不应落到普通 Input；Textarea 不参与此检查，避免把说明性自由文本误判为枚举。
  const formItem = /<Form\.Item\b([^>]*)>([\s\S]*?)<\/Form\.Item>/g;
  for (const match of source.matchAll(formItem)) {
    const label = match[1].match(/\blabel=(?:"([^"]+)"|'([^']+)'|\{["']([^"']+)["']\})/)?.slice(1).find(Boolean);
    if (label && controlledLabels.has(label) && /<Input\b(?!\.TextArea)/.test(match[2])) {
      add(file, source, match.index, `受控字段“${label}”使用了普通输入框；请使用字典、人员、系统、机构或投产点选择组件。`);
    }
  }
}

if (violations.length) {
  console.error('UI 数据源检查失败：\n' + violations.join('\n'));
  console.error('确属不可配置的技术常量时，在声明前添加“radar-ui-governance-allow: 原因”注释。');
  process.exit(1);
}

console.log(`UI 数据源检查通过：已检查 ${sourceFiles.length} 个业务/共享前端源码文件。`);

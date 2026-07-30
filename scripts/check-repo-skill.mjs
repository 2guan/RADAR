/**
 * 文件：scripts/check-repo-skill.mjs
 * 说明：使用 Node 标准库校验仓库级 Skill 的必需结构和引用，避免 CI 依赖本地 Codex 安装或 Python YAML 包。
 * 用途：持续检查 RADAR 交付 Skill 的元数据、界面提示、参考资料和未完成占位符。
 * 作者：hengguan
 */

import fs from 'node:fs';
import path from 'node:path';
import { root } from './governance-utils.mjs';

const skillName = 'radar-delivery-engineer';
const skillRoot = path.join(root, '.agents', 'skills', skillName);
const skillFile = path.join(skillRoot, 'SKILL.md');
const agentFile = path.join(skillRoot, 'agents', 'openai.yaml');
const violations = [];

function requiredFile(file, label) {
  if (!fs.existsSync(file)) {
    violations.push(`缺少${label}：${path.relative(root, file)}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

const skill = requiredFile(skillFile, ' Skill 主文件');
const agent = requiredFile(agentFile, ' Skill 界面元数据');

if (skill) {
  const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/i)?.[1] || '';
  const keys = [...frontmatter.matchAll(/^([a-z_][a-z0-9_-]*):/gmi)].map((match) => match[1]);
  if (!frontmatter) violations.push('SKILL.md 缺少 YAML frontmatter');
  if (!/^name:\s*radar-delivery-engineer\s*$/m.test(frontmatter)) violations.push('SKILL.md name 必须为 radar-delivery-engineer');
  if (!/^description:\s*\S.+$/m.test(frontmatter)) violations.push('SKILL.md description 不能为空');
  if (keys.some((key) => !['name', 'description'].includes(key))) violations.push('SKILL.md frontmatter 只能包含 name 和 description');
  if (/\bTODO\b|\[TODO/i.test(skill)) violations.push('SKILL.md 仍包含 TODO 占位符');

  // 引用必须保持一层可达，避免 Skill 触发后才发现项目知识文件丢失。
  for (const match of skill.matchAll(/\]\((references\/[^)]+)\)/g)) {
    const reference = path.join(skillRoot, match[1]);
    if (!fs.existsSync(reference)) violations.push(`SKILL.md 引用不存在：${match[1]}`);
  }
}

if (agent) {
  if (!/display_name:\s*"[^"]+"/.test(agent)) violations.push('agents/openai.yaml 缺少 display_name');
  if (!/short_description:\s*"[^"]{10,}"/.test(agent)) violations.push('agents/openai.yaml 缺少有效 short_description');
  if (!new RegExp(`default_prompt:\\s*"[^"]*\\$${skillName}[^\"]*"`).test(agent)) {
    violations.push(`agents/openai.yaml 的 default_prompt 必须显式包含 $${skillName}`);
  }
}

if (violations.length) {
  console.error('仓库级 Skill 检查失败：\n' + violations.join('\n'));
  process.exit(1);
}

console.log('仓库级 Skill 检查通过：元数据、界面提示和参考资料完整。');

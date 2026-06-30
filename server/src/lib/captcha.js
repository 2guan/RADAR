/**
 * 文件：lib/captcha.js
 * 用途：验证码生成与校验工具。使用 Node 内置 crypto 生成随机码，
 *       以 SVG 图形呈现（无外部依赖），校验码经 SHA256 哈希存储。
 * 作者：hengguan
 * 说明：验证码有效期为 5 分钟，单个 token 最多可尝试 3 次，
 *       定时清理过期条目防止内存泄漏。
 */

import { randomBytes, createHash } from 'node:crypto';
import { config } from '../config.js';

// 验证码存储（生产环境建议替换为 Redis）
const store = new Map();

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// 每分钟清理过期验证码
const CLEANUP_INTERVAL = setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store) {
    if (now > val.expiresAt) store.delete(key);
  }
}, config.captcha.cleanupIntervalMs);
if (CLEANUP_INTERVAL.unref) CLEANUP_INTERVAL.unref();

function generateCode(length) {
  const len = length || config.captcha.codeLength;
  let code = '';
  const bytes = randomBytes(len);
  for (let i = 0; i < len; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

function generateCaptchaSvg(code) {
  const chars = code.split('');
  const w = 160;
  const h = 56;
  let texts = '';
  chars.forEach((char, i) => {
    const x = 18 + i * 34;
    const y = 38;
    const rotate = Math.floor(Math.random() * 28) - 14;
    const hue = Math.floor(Math.random() * 40) + 200;
    texts += `<text x="${x}" y="${y}" transform="rotate(${rotate},${x},${y})" font-size="30" font-family="Arial,sans-serif" font-weight="bold" fill="hsl(${hue},55%,${42+Math.floor(Math.random()*16)}%)" opacity="0.88">${char}</text>`;
  });
  let lines = '';
  for (let i = 0; i < 4; i++) {
    lines += `<line x1="${Math.floor(Math.random()*w)}" y1="${Math.floor(Math.random()*h)}" x2="${Math.floor(Math.random()*w)}" y2="${Math.floor(Math.random()*h)}" stroke="#bbb" stroke-width="1.5" opacity="0.35"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#f8f9fa" rx="4"/>${lines}${texts}</svg>`;
}

export function createCaptcha() {
  const code = generateCode(config.captcha.codeLength);
  const token = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(code.toUpperCase()).digest('hex');
  store.set(token, { hash, expiresAt: Date.now() + config.captcha.expiresMs, attempts: 0 });
  return { token, svg: generateCaptchaSvg(code) };
}

export function verifyCaptcha(token, answer) {
  if (!token || !answer) return false;
  const record = store.get(token);
  if (!record) return false;
  if (Date.now() > record.expiresAt) { store.delete(token); return false; }
  if (record.attempts >= config.captcha.maxAttempts) { store.delete(token); return false; }
  record.attempts++;
  const normalizedAnswer = String(answer).toUpperCase().trim();
  const answerHash = createHash('sha256').update(normalizedAnswer).digest('hex');
  if (answerHash === record.hash) { store.delete(token); return true; }
  return false;
}

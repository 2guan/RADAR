/**
 * 文件：scripts/verify-app-runtime.mjs
 * 说明：使用临时 SQLite 数据和随机本地端口启动生产构建，避免污染开发数据并验证静态资源确实可由后端提供。
 * 用途：验证健康接口、SPA 首页、脚本和样式资源均可访问，作为浏览器验收前的运行门禁。
 * 作者：hengguan
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { root } from './governance-utils.mjs';

const distDirectory = path.join(root, 'web', 'dist');
const indexFile = path.join(distDirectory, 'index.html');
if (!fs.existsSync(indexFile)) {
  throw new Error('缺少 web/dist/index.html；请先运行 npm run build --prefix web');
}

const runtimeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'radar-runtime-check-'));
const output = [];
let child;

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) {
      throw new Error(`服务提前退出，退出码 ${child.exitCode}\n${output.join('')}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // 启动阶段可能尚未监听端口；短间隔重试直到明确超时。
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`等待健康检查超时\n${output.join('')}`);
}

async function assertResource(baseUrl, resourcePath, expectedType) {
  const response = await fetch(new URL(resourcePath, baseUrl));
  if (!response.ok) throw new Error(`${resourcePath} 返回 HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (expectedType && !contentType.includes(expectedType)) {
    throw new Error(`${resourcePath} Content-Type 异常：${contentType || '空'}`);
  }
}

try {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server/src/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_CLIENT: 'sqlite',
      DB_FILE: path.join(runtimeDirectory, 'radar.db'),
      ATTACHMENT_DIR: path.join(runtimeDirectory, 'attachments'),
      WEB_DIST: distDirectory,
      JWT_SECRET: 'runtime-verification-only-secret-32-bytes',
      ADMIN_PASSWORD: 'RuntimeVerificationOnly@2026',
      LOG_LEVEL: 'error',
      REQUEST_LOGGING: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => output.push(chunk.toString()));
  child.stderr.on('data', (chunk) => output.push(chunk.toString()));

  const health = await waitForHealth(`${baseUrl}/api/health`);
  if (health?.code !== 0 || health?.data?.status !== 'ok') throw new Error('健康检查响应结构异常');

  const entryResponse = await fetch(`${baseUrl}/`);
  if (!entryResponse.ok) throw new Error(`SPA 首页返回 HTTP ${entryResponse.status}`);
  const html = await entryResponse.text();
  if (!/<div\s+id=["']root["']/.test(html)) throw new Error('SPA 首页缺少 root 挂载节点');

  const resources = [...html.matchAll(/<(script|link)\b[^>]+(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => ({ tag: match[1], path: match[2] }))
    .filter((item) => item.path.startsWith('/assets/'));
  if (!resources.some((item) => item.tag === 'script')) throw new Error('SPA 首页未引用构建脚本');

  // 逐一请求入口声明的资源，防止 index.html 指向缺失 hash 文件而出现部署白屏。
  for (const resource of resources) {
    const expectedType = resource.path.endsWith('.js') ? 'javascript'
      : resource.path.endsWith('.css') ? 'text/css'
        : undefined;
    await assertResource(baseUrl, resource.path, expectedType);
  }

  await assertResource(baseUrl, '/non-existent-client-route', 'text/html');
  console.log(`应用运行验证通过：健康检查、SPA 入口、${resources.length} 个入口资源及客户端路由回退均正常。`);
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 3000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
  fs.rmSync(runtimeDirectory, { recursive: true, force: true });
}

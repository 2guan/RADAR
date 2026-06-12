/**
 * 文件：app.js
 * 用途：装配 Fastify 应用实例——注册安全插件（helmet/cors/rate-limit/multipart）、
 *       鉴权插件、全局错误处理、业务路由（/api 前缀）与前端静态资源（生产模式）。
 * 作者：hengguan
 * 说明：所有业务路由集中在 registerRoutes 中注册，便于维护与按阶段扩展。
 */

import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import compress from '@fastify/compress';
import fs from 'node:fs';

import { config } from './config.js';
import authPlugin from './plugins/auth.js';
import { HttpError, ok } from './lib/http.js';

// 业务路由模块
import authRoutes from './modules/auth/routes.js';
import dictRoutes from './modules/dict/routes.js';
import systemRoutes from './modules/systems/routes.js';
import releasePointRoutes from './modules/release-points/routes.js';
import roleRoutes from './modules/roles/routes.js';
import userRoutes from './modules/users/routes.js';
import settingsRoutes from './modules/settings/routes.js';
import requirementRoutes from './modules/requirements/routes.js';
import devTaskRoutes from './modules/dev-tasks/routes.js';
import testTaskRoutes from './modules/test-tasks/routes.js';
import releaseRoutes from './modules/release/routes.js';
import attachmentRoutes from './modules/attachments/routes.js';
import auditRoutes from './modules/audit/routes.js';
import overviewRoutes from './modules/overview/routes.js';
import dashboardRoutes from './modules/dashboard/routes.js';

/**
 * 创建并返回已装配的 Fastify 实例。
 */
export async function buildApp() {
  const app = Fastify({
    logger: { level: config.isProd ? 'info' : 'warn' },
    bodyLimit: config.upload.maxFileSize + 1024 * 1024,
  });

  // ---- 响应压缩：公网/VPN 访问下显著降低 JS 包与 JSON 传输量（gzip 为主，CPU 开销可控）----
  await app.register(compress, {
    global: true,
    encodings: ['gzip', 'deflate'],
    threshold: 1024, // 小于 1KB 不压缩，避免负收益
  });

  // ---- 安全与基础插件 ----
  await app.register(helmet, {
    contentSecurityPolicy: false, // 前端 SPA 由 Vite 构建，单独配置 CSP，避免内联脚本被拦
  });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, {
    max: 600,            // 单 IP 每窗口最多请求数
    timeWindow: '1 minute',
  });
  await app.register(multipart, {
    limits: { fileSize: config.upload.maxFileSize },
  });

  // ---- 鉴权插件 ----
  await app.register(authPlugin);

  // ---- 全局错误处理：统一结构、不泄露堆栈 ----
  app.setErrorHandler((err, request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ code: err.statusCode, data: null, message: err.message });
    }
    if (err.validation) {
      return reply.code(400).send({ code: 400, data: null, message: '请求参数校验失败' });
    }
    if (err.statusCode === 429) {
      return reply.code(429).send({ code: 429, data: null, message: '请求过于频繁，请稍后再试' });
    }
    request.log.error(err);
    return reply.code(500).send({ code: 500, data: null, message: '服务器内部错误' });
  });

  // ---- 业务路由（统一 /api 前缀）----
  app.register(async (api) => {
    api.get('/health', async () => ok({ status: 'ok', time: new Date().toISOString() }));
    await api.register(authRoutes);
    await api.register(dictRoutes);
    await api.register(systemRoutes);
    await api.register(releasePointRoutes);
    await api.register(roleRoutes);
    await api.register(userRoutes);
    await api.register(settingsRoutes);
    await api.register(requirementRoutes);
    await api.register(devTaskRoutes);
    await api.register(testTaskRoutes);
    await api.register(releaseRoutes);
    await api.register(attachmentRoutes);
    await api.register(auditRoutes);
    await api.register(overviewRoutes);
    await api.register(dashboardRoutes);
  }, { prefix: '/api' });

  // ---- 前端静态资源（生产模式，SPA 回退到 index.html）----
  if (fs.existsSync(config.webDist)) {
    await app.register(fastifyStatic, {
      root: config.webDist,
      prefix: '/',
      // 自行管理 Cache-Control，避免与内置 maxAge/immutable 的优先级冲突：
      // Vite 产物（/assets/*.[hash].*）带内容 hash 可永久强缓存；
      // index.html 必须每次回源校验，否则新部署的资源引用无法生效。
      cacheControl: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.raw.url.startsWith('/api')) {
        return reply.code(404).send({ code: 404, data: null, message: '接口不存在' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

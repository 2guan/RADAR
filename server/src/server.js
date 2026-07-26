/**
 * 文件：server.js
 * 说明：开发模式 `npm run dev`（--watch）；生产模式 `npm start`。
 * 用途：后端启动入口。执行数据库迁移与种子数据初始化，构建并启动 Fastify 实例，
 *       注册优雅退出处理。
 * 作者：hengguan
 */

import { config } from './config.js';
import { performance } from 'node:perf_hooks';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { buildApp } from './app.js';
import { logger } from './lib/logger.js';

/** 为启动阶段记录分段耗时，便于线上区分卷权限、迁移、初始化和应用装配瓶颈。 */
async function measureStartupStage(name, fn) {
  const startedAt = performance.now();
  const result = await fn();
  logger.info(`[性能] 启动阶段 ${name}：${Math.round(performance.now() - startedAt)}ms`);
  return result;
}

async function main() {
  // 1) 数据库迁移与初始化
  await measureStartupStage('数据库迁移', runMigrations);
  await measureStartupStage('种子初始化', runSeed);

  // 2) 构建并启动应用
  const app = await measureStartupStage('应用装配', buildApp);
  await measureStartupStage('HTTP 监听', () => app.listen({ port: config.port, host: config.host }));
  logger.info(`[RADAR] 服务已启动：http://${config.host}:${config.port}`);

  // 3) 优雅退出
  const shutdown = async (signal) => {
    logger.info(`[RADAR] 收到 ${signal}，正在关闭...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('[RADAR] 启动失败：', err);
  process.exit(1);
});

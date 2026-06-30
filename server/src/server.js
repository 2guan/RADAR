/**
 * 文件：server.js
 * 用途：后端启动入口。执行数据库迁移与种子数据初始化，构建并启动 Fastify 实例，
 *       注册优雅退出处理。
 * 作者：hengguan
 * 说明：开发模式 `npm run dev`（--watch）；生产模式 `npm start`。
 */

import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { runSeed } from './db/seed.js';
import { buildApp } from './app.js';

async function main() {
  // 1) 数据库迁移与初始化
  await runMigrations();
  await runSeed();

  // 2) 构建并启动应用
  const app = await buildApp();
  await app.listen({ port: config.port, host: config.host });
  console.log(`[RADAR] 服务已启动：http://${config.host}:${config.port}`);

  // 3) 优雅退出
  const shutdown = async (signal) => {
    console.log(`[RADAR] 收到 ${signal}，正在关闭...`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[RADAR] 启动失败：', err);
  process.exit(1);
});

/**
 * 文件：config.js
 * 用途：集中管理后端运行时配置（端口、JWT 密钥、数据库与附件路径等），
 *       全部从环境变量读取并提供合理默认值，便于本地开发与 Docker 部署切换。
 * 作者：hengguan
 * 说明：所有路径默认指向仓库根目录下的 data/ 与 attachments/（与 docker-compose 挂载一致）。
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 计算仓库根目录（server/src/config.js -> 上溯三层到仓库根）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

/**
 * 读取整数型环境变量，非法时回退默认值。
 */
function intEnv(name, fallback) {
  const v = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}

export const config = {
  // 服务监听端口与地址
  port: intEnv('PORT', 3000),
  host: process.env.HOST || '0.0.0.0',

  // 运行环境
  isProd: process.env.NODE_ENV === 'production',

  // JWT 配置（生产环境务必通过环境变量覆盖密钥）
  jwt: {
    secret: process.env.JWT_SECRET || 'radar-dev-secret-change-me-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
  },

  // 数据库文件路径（挂载目录）
  dbFile: process.env.DB_FILE || path.join(REPO_ROOT, 'data', 'radar.db'),

  // 附件存储根目录（挂载目录）
  attachmentDir: process.env.ATTACHMENT_DIR || path.join(REPO_ROOT, 'attachments'),

  // 前端静态资源目录（生产模式下由 Fastify 提供）
  webDist: process.env.WEB_DIST || path.join(REPO_ROOT, 'web', 'dist'),

  // 附件上传限制
  upload: {
    maxFileSize: intEnv('MAX_FILE_SIZE', 50 * 1024 * 1024), // 默认 50MB
    // 允许的扩展名白名单（小写，含点）
    allowedExt: [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md',
      '.csv', '.zip', '.rar', '.7z', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg',
    ],
  },

  // 初始超级管理员账号
  superAdmin: {
    phone: process.env.ADMIN_PHONE || 'admin',
    name: '超级管理员',
    password: process.env.ADMIN_PASSWORD || 'admin2026',
  },

  REPO_ROOT,
};

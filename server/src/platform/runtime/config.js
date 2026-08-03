/**
 * 文件：server/src/platform/runtime/config.js
 * 说明：遵循项目研发规约；跨模块能力仅可经公开契约访问。
 * 用途：集中管理后端运行时配置（端口、JWT 密钥、数据库与附件路径等），
 *       从环境变量/.env 读取，便于本地开发与 Docker 部署切换。
 * 作者：hengguan
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { loadEnvFile, normalizeLogLevel } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 当前文件位于 server/src/platform/runtime；配置中的相对路径必须回到仓库根目录，
// 才能与 Docker 镜像内的 /app/web、/app/data 和根目录 .env 保持一致。
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
loadEnvFile(path.join(REPO_ROOT, '.env'));
// 所有 SQLite `localtime` 默认值及未显式时区的运行时计算均以北京时间为准；
// TDSQL 连接仍通过下方既有 `TDSQL_TIMEZONE=+08:00` 固定会话时区。
process.env.TZ = 'Asia/Shanghai';

const isProd = process.env.NODE_ENV === 'production';

function intEnv(name, fallback) {
  const v = parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}

function strEnv(name, fallback = '') {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function requiredProdEnv(name) {
  const value = process.env[name];
  if (isProd && !value) {
    throw new Error(`生产环境必须配置 ${name}`);
  }
  return value || '';
}

function pathEnv(name, fallback) {
  const value = strEnv(name, fallback);
  return path.isAbsolute(value) ? value : path.resolve(REPO_ROOT, value);
}

function listEnv(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function cspListEnv(name, fallback) {
  return listEnv(name, fallback).map((item) => item === 'self' ? "'self'" : item);
}

function originOf(url) {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

/** 将部署声明的 iframe Origin 规范化；非法值不进入允许集，避免宽松回退。 */
function originListEnv(name) {
  return listEnv(name, []).flatMap((item) => {
    try {
      const url = new URL(item);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return [];
      return [url.origin];
    } catch {
      return [];
    }
  });
}

const pamsBaseUrl = strEnv('PAMS_BASE_URL');
const pamsOrigin = originOf(pamsBaseUrl);
const kkFileViewAllowedOrigins = originListEnv('KKFILEVIEW_ALLOWED_ORIGINS');

// 交付件可上传且由 kkFileView 4.1.0 预览的默认白名单；部署可通过环境变量按需覆盖。
export const DEFAULT_DELIVERABLE_UPLOAD_EXTENSIONS = Object.freeze([
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.jpg', '.jpeg', '.png', '.gif', '.tif', '.tiff',
  '.pdf', '.ofd', '.txt', '.html', '.htm', '.xml', '.json', '.properties', '.md', '.log', '.py', '.sql', '.zip', '.rar',
]);

export const config = {
  port: intEnv('PORT', 3000),
  host: strEnv('HOST', '0.0.0.0'),
  isProd,

  jwt: {
    secret: requiredProdEnv('JWT_SECRET') || randomBytes(32).toString('hex'),
    expiresIn: strEnv('JWT_EXPIRES_IN', '12h'),
  },

  db: {
    client: strEnv('DB_CLIENT', 'sqlite').toLowerCase(),
    file: pathEnv('DB_FILE', path.join('data', 'radar.db')),
    tdsql: {
      host: strEnv('TDSQL_HOST', '127.0.0.1'),
      port: intEnv('TDSQL_PORT', 3306),
      user: strEnv('TDSQL_USER', 'radar'),
      password: strEnv('TDSQL_PASSWORD'),
      database: strEnv('TDSQL_DATABASE', 'radar'),
      ssl: boolEnv('TDSQL_SSL', false),
      connectionLimit: intEnv('TDSQL_CONNECTION_LIMIT', 10),
      timezone: strEnv('TDSQL_TIMEZONE', '+08:00'),
    },
  },
  dbFile: pathEnv('DB_FILE', path.join('data', 'radar.db')),
  attachmentDir: pathEnv('ATTACHMENT_DIR', 'attachments'),
  webDist: pathEnv('WEB_DIST', path.join('web', 'dist')),

  upload: {
    maxFileSize: intEnv('MAX_FILE_SIZE', 50 * 1024 * 1024),
    allowedExt: [...new Set(listEnv('UPLOAD_ALLOWED_EXTENSIONS', DEFAULT_DELIVERABLE_UPLOAD_EXTENSIONS)
      .map((ext) => ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`))],
  },

  pams: {
    baseUrl: pamsBaseUrl,
    apiKey: strEnv('PAMS_API_KEY'),
    timeout: intEnv('PAMS_TIMEOUT', 20000),
  },

  preview: {
    enabledFallback: boolEnv('DELIVERABLE_PREVIEW_ENABLED', false),
    kkFileViewBaseUrlFallback: strEnv('KKFILEVIEW_BASE_URL'),
    kkFileViewAllowedOrigins,
    attachmentSourceBaseUrl: strEnv('ATTACHMENT_PREVIEW_SOURCE_BASE_URL'),
    sessionTtlSeconds: intEnv('ATTACHMENT_PREVIEW_SESSION_TTL_SECONDS', 300),
  },

  superAdmin: {
    phone: strEnv('ADMIN_PHONE', 'admin'),
    name: strEnv('ADMIN_NAME', '超级管理员'),
    password: strEnv('ADMIN_PASSWORD'),
  },

  corsOrigins: listEnv('CORS_ORIGINS', isProd ? [] : [
    'http://127.0.0.1:3000',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ]),

  security: {
    csrfHeaderValue: strEnv('CSRF_HEADER_VALUE', 'RADAR'),
    // HTTP 部署时不能自动把静态资源升级为 HTTPS；证书终止在反向代理后时再显式开启。
    cspUpgradeInsecureRequests: boolEnv('CSP_UPGRADE_INSECURE_REQUESTS', false),
    // HSTS 仅应在全站 HTTPS 已验证可用时发送，避免浏览器记住错误的 HTTPS 策略。
    hstsEnabled: boolEnv('HSTS_ENABLED', false),
    apiBodyLimit: intEnv('API_BODY_LIMIT', 1024 * 1024),
    rateLimitMax: intEnv('RATE_LIMIT_MAX', 600),
    rateLimitWindow: strEnv('RATE_LIMIT_WINDOW', '1 minute'),
    compressionThreshold: intEnv('COMPRESSION_THRESHOLD', 1024),
    cspConnectSrc: cspListEnv('CSP_CONNECT_SRC', pamsOrigin ? ["'self'", pamsOrigin] : ["'self'"]),
    cspFrameSrc: ["'self'", ...kkFileViewAllowedOrigins],
  },

  logging: {
    level: normalizeLogLevel(strEnv('LOG_LEVEL'), isProd ? 'info' : 'warn'),
    requestLogging: boolEnv('REQUEST_LOGGING', false),
    // 慢请求/慢查询仅记录方法、路径和耗时，不写入参数、Token 或业务内容。
    slowRequestMs: intEnv('SLOW_REQUEST_MS', 1000),
    slowQueryMs: intEnv('SLOW_QUERY_MS', 500),
  },

  captcha: {
    expiresMs: intEnv('CAPTCHA_EXPIRES_MS', 5 * 60 * 1000),
    maxAttempts: intEnv('CAPTCHA_MAX_ATTEMPTS', 3),
    codeLength: intEnv('CAPTCHA_CODE_LENGTH', 4),
    cleanupIntervalMs: intEnv('CAPTCHA_CLEANUP_INTERVAL_MS', 60 * 1000),
  },

  signature: {
    maxBytes: intEnv('SIGNATURE_MAX_BYTES', 2 * 1024 * 1024),
  },

  REPO_ROOT,
};

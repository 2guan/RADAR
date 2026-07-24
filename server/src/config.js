/**
 * 文件：config.js
 * 用途：集中管理后端运行时配置（端口、JWT 密钥、数据库与附件路径等），
 *       从环境变量/.env 读取，便于本地开发与 Docker 部署切换。
 * 作者：hengguan
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { loadEnvFile } from './lib/env.js';
import { normalizeLogLevel } from './lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
loadEnvFile(path.join(REPO_ROOT, '.env'));

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

const pamsBaseUrl = strEnv('PAMS_BASE_URL');
const pamsOrigin = originOf(pamsBaseUrl);

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
    allowedExt: listEnv('UPLOAD_ALLOWED_EXTENSIONS', [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md',
      '.csv', '.zip', '.rar', '.7z', '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg',
    ]).map((ext) => ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`),
  },

  pams: {
    baseUrl: pamsBaseUrl,
    apiKey: strEnv('PAMS_API_KEY'),
    timeout: intEnv('PAMS_TIMEOUT', 20000),
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
  },

  logging: {
    level: normalizeLogLevel(strEnv('LOG_LEVEL'), isProd ? 'info' : 'warn'),
    requestLogging: boolEnv('REQUEST_LOGGING', false),
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

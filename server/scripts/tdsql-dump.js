#!/usr/bin/env node
/**
 * 文件：scripts/tdsql-dump.js
 * 用途：TDSQL MySQL 兼容版原生卸数脚本。调用系统 mysqldump，
 *       将指定数据库导出为 .sql 或 .sql.gz 文件，不经过 SQLite 转换。
 * 作者：hengguan
 * 说明：适用于 TDSQL 到 TDSQL 的离线迁移、物理隔离交付和数据库原生逻辑备份。
 *       密码通过 MYSQL_PWD 环境变量传给子进程，避免出现在命令参数列表中。
 *
 * 示例：
 *   node scripts/tdsql-dump.js --output ./radar-tdsql-dump.sql.gz
 *   node scripts/tdsql-dump.js --source-host 127.0.0.1 --source-port 3306 --source-database radar --source-user radar --source-password secret --output ./dump.sql
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../src/lib/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
loadEnvFile(path.join(REPO_ROOT, '.env'));

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') { out.force = true; continue; }
    if (arg === '--gzip') { out.gzip = true; continue; }
    if (arg === '--no-gzip') { out.gzip = false; continue; }
    if (arg === '--no-gtid-purged') { out.noGtidPurged = true; continue; }
    if (arg.startsWith('--')) {
      const [rawKey, inline] = arg.slice(2).split('=');
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = inline ?? argv[++i];
    }
  }
  return out;
}

/** 必填参数校验，输出中文错误便于部署人员处理。 */
function required(value, name) {
  if (value === undefined || value === '') throw new Error(`缺少参数：${name}`);
  return value;
}

/** 将端口字符串转换为整数，空值回落到默认端口。 */
function intValue(value, fallback) {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

/** 解析命令行或环境变量中的布尔开关。 */
function boolValue(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

/** 读取带 source 前缀的命令行参数，同时兼容无前缀参数。 */
function argValue(args, prefix, name) {
  return args[`${prefix}${name[0].toUpperCase()}${name.slice(1)}`] ?? args[name];
}

/** 读取 SOURCE_TDSQL_*，不存在时兼容 TDSQL_*。 */
function envValue(prefix, name) {
  return process.env[`${prefix.toUpperCase()}_TDSQL_${name}`] ?? process.env[`TDSQL_${name}`];
}

/** 组装源 TDSQL 连接配置；只用于 mysqldump 参数和 MYSQL_PWD。 */
function tdsqlConfig(args, prefix = 'source') {
  return {
    host: argValue(args, prefix, 'host') || envValue(prefix, 'HOST') || '127.0.0.1',
    port: intValue(argValue(args, prefix, 'port') || envValue(prefix, 'PORT'), 3306),
    user: argValue(args, prefix, 'user') || envValue(prefix, 'USER') || 'radar',
    password: required(argValue(args, prefix, 'password') ?? envValue(prefix, 'PASSWORD'), `${prefix.toUpperCase()}_TDSQL_PASSWORD 或 --${prefix}-password`),
    database: required(argValue(args, prefix, 'database') || envValue(prefix, 'DATABASE'), `${prefix.toUpperCase()}_TDSQL_DATABASE 或 --${prefix}-database`),
    ssl: boolValue(argValue(args, prefix, 'ssl') ?? envValue(prefix, 'SSL')),
  };
}

/** 生成默认备份文件名中的时间戳。 */
function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 等待 mysqldump 子进程结束，并将非 0 退出码转成异常。 */
function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`mysqldump 退出码：${code}`));
    });
  });
}

/** 命令入口：解析参数、启动 mysqldump、按需 gzip 压缩输出流。 */
async function main() {
  const args = parseArgs(process.argv);
  const config = tdsqlConfig(args, 'source');
  const output = path.resolve(REPO_ROOT, args.output || `./radar-tdsql-dump-${timestamp()}.sql.gz`);
  const gzip = args.gzip ?? output.endsWith('.gz');
  const mysqldumpBin = args.mysqldumpBin || process.env.MYSQLDUMP_BIN || 'mysqldump';

  if (fs.existsSync(output) && !args.force) {
    throw new Error(`输出文件已存在：${output}。如需覆盖请加 --force`);
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });

  const dumpArgs = [
    '-h', config.host,
    '-P', String(config.port),
    '-u', config.user,
    '--default-character-set=utf8mb4',
    '--single-transaction',
    '--routines',
    '--triggers',
    '--events',
  ];
  if (config.ssl) dumpArgs.push('--ssl');
  if (!args.noGtidPurged) dumpArgs.push('--set-gtid-purged=OFF');
  dumpArgs.push(config.database);

  console.log(`[卸数] 源 TDSQL：${config.host}:${config.port}/${config.database}`);
  console.log(`[卸数] 输出文件：${output}`);
  console.log(`[卸数] 压缩：${gzip ? '是' : '否'}`);

  const child = spawn(mysqldumpBin, dumpArgs, {
    env: { ...process.env, MYSQL_PWD: config.password },
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  const outputStream = fs.createWriteStream(output);
  const pipePromise = gzip
    ? pipeline(child.stdout, createGzip({ level: 9 }), outputStream)
    : pipeline(child.stdout, outputStream);

  await Promise.all([waitForExit(child), pipePromise]);
  const stat = fs.statSync(output);
  console.log(`[卸数] 完成：${output} (${stat.size} bytes)`);
}

main().catch((err) => {
  console.error('[卸数] 失败：', err.message);
  process.exit(1);
});

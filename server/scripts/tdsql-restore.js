#!/usr/bin/env node
/**
 * 文件：scripts/tdsql-restore.js
 * 用途：TDSQL MySQL 兼容版原生装数脚本。调用系统 mysql，
 *       将 .sql 或 .sql.gz 文件恢复到目标 TDSQL 数据库。
 * 作者：hengguan
 * 说明：适用于 TDSQL 原生 SQL 离线备份恢复；默认会创建不存在的目标库，
 *       支持 --drop-database --force 重建目标库。密码通过 MYSQL_PWD 传给子进程。
 * 示例：
 *   node scripts/tdsql-restore.js --input ./radar-tdsql-dump.sql.gz
 *   node scripts/tdsql-restore.js --target-host 127.0.0.1 --target-port 3306 --target-database radar --target-user radar --target-password secret --input ./dump.sql
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from '../src/lib/env.js';
import { logger } from '../src/lib/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
loadEnvFile(path.join(REPO_ROOT, '.env'));

function parseArgs(argv) {
  // 解析命令行参数，支持 --target-host 与 --target-host= 两种写法。
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--create-database') { out.createDatabase = true; continue; }
    if (arg === '--no-create-database') { out.createDatabase = false; continue; }
    if (arg === '--drop-database') { out.dropDatabase = true; continue; }
    if (arg === '--force') { out.force = true; continue; }
    if (arg.startsWith('--')) {
      const [rawKey, inline] = arg.slice(2).split('=');
      const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      out[key] = inline ?? argv[++i];
    }
  }
  return out;
}

function required(value, name) {
  // 对恢复目标库、密码、输入文件等必填项做统一校验，错误信息直接面向运维用户。
  if (value === undefined || value === '') throw new Error(`缺少参数：${name}`);
  return value;
}

function intValue(value, fallback) {
  // 端口参数允许来自字符串环境变量，无法解析时回落到默认值。
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

function boolValue(value) {
  // 兼容 .env 中常见的布尔写法，便于按需开启 SSL 连接。
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').toLowerCase());
}

function argValue(args, prefix, name) {
  // target 前缀参数优先，例如 --target-host；同时兼容 --host 简写。
  return args[`${prefix}${name[0].toUpperCase()}${name.slice(1)}`] ?? args[name];
}

function envValue(prefix, name) {
  // 环境变量同时支持 TARGET_TDSQL_* 与通用 TDSQL_*，便于迁移脚本复用配置。
  return process.env[`${prefix.toUpperCase()}_TDSQL_${name}`] ?? process.env[`TDSQL_${name}`];
}

function tdsqlConfig(args, prefix = 'target') {
  // 统一组装目标 TDSQL 连接信息，命令行参数优先于 .env 环境变量。
  return {
    host: argValue(args, prefix, 'host') || envValue(prefix, 'HOST') || '127.0.0.1',
    port: intValue(argValue(args, prefix, 'port') || envValue(prefix, 'PORT'), 3306),
    user: argValue(args, prefix, 'user') || envValue(prefix, 'USER') || 'radar',
    password: required(argValue(args, prefix, 'password') ?? envValue(prefix, 'PASSWORD'), `${prefix.toUpperCase()}_TDSQL_PASSWORD 或 --${prefix}-password`),
    database: required(argValue(args, prefix, 'database') || envValue(prefix, 'DATABASE'), `${prefix.toUpperCase()}_TDSQL_DATABASE 或 --${prefix}-database`),
    ssl: boolValue(argValue(args, prefix, 'ssl') ?? envValue(prefix, 'SSL')),
  };
}

function mysqlBaseArgs(config, includeDatabase = false) {
  // mysql 客户端参数不直接拼接密码，避免密码出现在命令行进程列表中。
  const args = [
    '-h', config.host,
    '-P', String(config.port),
    '-u', config.user,
    '--default-character-set=utf8mb4',
  ];
  if (config.ssl) args.push('--ssl');
  if (includeDatabase) args.push(config.database);
  return args;
}

function waitForExit(child, name = 'mysql') {
  // 将子进程退出码转换成 Promise，便于 main 中按顺序编排建库和导入动作。
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${name} 退出码：${code}`));
    });
  });
}

function runMysql(mysqlBin, args, config, name = 'mysql') {
  // 执行不需要标准输入的 mysql 命令，例如建库、删库和重建库。
  const child = spawn(mysqlBin, args, {
    env: { ...process.env, MYSQL_PWD: config.password },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return waitForExit(child, name);
}

async function main() {
  // 主流程：读取配置 -> 准备目标库 -> 根据文件扩展名选择直读或 gzip 解压后导入。
  const args = parseArgs(process.argv);
  const config = tdsqlConfig(args, 'target');
  const input = path.resolve(REPO_ROOT, required(args.input, '--input'));
  const mysqlBin = args.mysqlBin || process.env.MYSQL_BIN || 'mysql';
  const createDatabase = args.createDatabase ?? true;

  if (!fs.existsSync(input)) throw new Error(`输入文件不存在：${input}`);

  logger.info(`[装数] 目标 TDSQL：${config.host}:${config.port}/${config.database}`);
  logger.info(`[装数] 输入文件：${input}`);

  if (args.dropDatabase) {
    // 高风险的删库恢复必须显式加 --force，防止误操作覆盖生产库。
    if (!args.force) throw new Error('执行 --drop-database 必须同时加 --force');
    logger.warn('[装数] 正在删除并重建目标库');
    await runMysql(
      mysqlBin,
      [...mysqlBaseArgs(config), '-e', `DROP DATABASE IF EXISTS \`${config.database.replace(/`/g, '``')}\`; CREATE DATABASE \`${config.database.replace(/`/g, '``')}\` DEFAULT CHARACTER SET utf8mb4;`],
      config,
    );
  } else if (createDatabase) {
    await runMysql(
      mysqlBin,
      [...mysqlBaseArgs(config), '-e', `CREATE DATABASE IF NOT EXISTS \`${config.database.replace(/`/g, '``')}\` DEFAULT CHARACTER SET utf8mb4;`],
      config,
    );
  }

  const child = spawn(mysqlBin, mysqlBaseArgs(config, true), {
    // 真正装数时将 SQL 文件流式写入 mysql stdin，避免大文件一次性读入内存。
    env: { ...process.env, MYSQL_PWD: config.password },
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  const inputStream = fs.createReadStream(input);
  const pipePromise = input.endsWith('.gz')
    ? pipeline(inputStream, createGunzip(), child.stdin)
    : pipeline(inputStream, child.stdin);

  await Promise.all([waitForExit(child), pipePromise]);
  logger.info('[装数] 完成');
}

main().catch((err) => {
  logger.error('[装数] 失败：', err.message);
  process.exit(1);
});

/**
 * 文件：lib/code-gen.js
 * 用途：业务编号生成器。依据 app_config 中可配置的编号规则模板，结合投产窗口/父编号，
 *       生成需求/开发/测试任务编号，并保证同前缀下序号唯一递增（3 位补零）。
 * 作者：hengguan
 * 说明：模板占位符 {投产窗口} {需求编号} {序号}；序号位数固定为 3。
 */

import { get, all } from '../db/index.js';

/** 读取编号规则模板 */
function template(key, fallback) {
  const row = get('SELECT value FROM app_config WHERE key = ?', key);
  return row?.value || fallback;
}

/**
 * 计算某前缀下的下一个 3 位序号。
 * @param {string} table 表名
 * @param {string} column 编号列
 * @param {string} prefix 前缀（含末尾下划线）
 */
function nextSeq(table, column, prefix) {
  const rows = all(`SELECT ${column} AS code FROM ${table} WHERE ${column} LIKE ?`, `${prefix}%`);
  let max = 0;
  for (const r of rows) {
    const tail = String(r.code).slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1).padStart(3, '0');
}

function currentDateStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function normalizeReleaseWindow(releaseWindow) {
  const value = String(releaseWindow || '').trim();
  return /^\d{8}$/.test(value) ? value : currentDateStr();
}

/**
 * 生成需求编号。RC_{投产窗口}_{序号}
 * @param {string} releaseWindow 投产窗口（YYYYMMDD）
 */
export function genRequirementCode(releaseWindow) {
  const window = normalizeReleaseWindow(releaseWindow);
  const tpl = template('code.requirement', 'RC_{投产窗口}_{序号}');
  const prefix = tpl.replace('{投产窗口}', window).replace('{序号}', '');
  const seq = nextSeq('requirement', 'req_code', prefix);
  return tpl.replace('{投产窗口}', window).replace('{序号}', seq);
}

/**
 * 生成工单编号。TK_{投产窗口}_{序号}
 * @param {string} releaseWindow 投产窗口（YYYYMMDD）
 */
export function genTicketCode(releaseWindow) {
  const window = normalizeReleaseWindow(releaseWindow);
  const tpl = template('code.ticket', 'TK_{投产窗口}_{序号}');
  const prefix = tpl.replace('{投产窗口}', window).replace('{序号}', '');
  const seq = nextSeq('ticket', 'ticket_code', prefix);
  return tpl.replace('{投产窗口}', window).replace('{序号}', seq);
}

/**
 * 生成开发任务编号。RW_{需求编号}_{序号}
 */
export function genDevCode(reqCode) {
  const tpl = template('code.dev', 'RW_{需求编号}_{序号}');
  const prefix = tpl.replace('{需求编号}', reqCode).replace('{序号}', '');
  const seq = nextSeq('dev_task', 'task_code', prefix);
  return tpl.replace('{需求编号}', reqCode).replace('{序号}', seq);
}

/**
 * 生成测试任务编号。{类型}_{需求编号}_{序号}
 * @param {string} testType SIT/UAT/NFT/SEC
 */
export function genTestCode(testType, reqCode) {
  const tpl = template(`code.test.${testType}`, `${testType}_{需求编号}_{序号}`);
  const prefix = tpl.replace('{需求编号}', reqCode).replace('{序号}', '');
  const seq = nextSeq('test_task', 'task_code', prefix);
  return tpl.replace('{需求编号}', reqCode).replace('{序号}', seq);
}

/**
 * 生成投产申请变更编号。{版本年月}-10bg{序号}
 * @param {string} yearMonth 版本年月（YYYYMM）
 */
export function genReleaseApplyCode(yearMonth) {
  const tpl = template('code.release_apply', '{版本年月}-10bg{序号}');
  const prefix = tpl.replace('{版本年月}', yearMonth).replace('{序号}', '');
  const seq = nextSeq('release_apply', 'change_code', prefix);
  return tpl.replace('{版本年月}', yearMonth).replace('{序号}', seq);
}

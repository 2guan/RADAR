/**
 * 文件：lib/pams.js
 * 用途：外部 PAMS 问题管理系统接口客户端。封装统一鉴权（x-api-key）与超时，
 *       提供「问题概述列表」与「问题明细」两个只读拉取方法，供问题同步使用。
 * 作者：hengguan
 * 说明：基于 Node 原生 fetch（Node ≥18 内置）；接口返回结构为 { success, data, ... }，
 *       本模块统一校验 success 并返回 data，异常抛 HttpError 由上层捕获处理。
 */

import { config } from '../config.js';
import { all } from '../db/index.js';
import { badRequest } from './http.js';

const DEFAULT_OVERVIEW_API = '/PAMS/api/report/overview';
const DEFAULT_DETAIL_API = '/PAMS/api/report/detail';

/**
 * 问题工具连接配置优先读取系统设置；未配置时兼容部署环境变量。
 * API 路径独立配置，便于适配不同的问题管理工具。
 */
async function issueToolConfig() {
  const rows = await all(
    `SELECT key, value FROM app_config
      WHERE key IN ('issue.sync.baseUrl', 'issue.sync.apiKey', 'issue.sync.overviewApi', 'issue.sync.detailApi')`,
  );
  const values = Object.fromEntries(rows.map((row) => [row.key, String(row.value || '').trim()]));
  return {
    baseUrl: values['issue.sync.baseUrl'] || config.pams.baseUrl,
    apiKey: values['issue.sync.apiKey'] || config.pams.apiKey,
    overviewApi: values['issue.sync.overviewApi'] || DEFAULT_OVERVIEW_API,
    detailApi: values['issue.sync.detailApi'] || DEFAULT_DETAIL_API,
  };
}

function joinUrl(baseUrl, apiPath) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/${String(apiPath || '').replace(/^\/+/, '')}`;
}

/**
 * 发起一次带鉴权的 PAMS 请求。
 * @param {string} path 接口路径（如 /PAMS/api/report/overview）
 * @param {object} [opts] { method, body }
 * @returns {Promise<any>} 接口的 data 字段
 */
async function pamsFetch(path, opts = {}, tool = null) {
  const activeTool = tool || await issueToolConfig();
  if (!activeTool.baseUrl || !activeTool.apiKey) {
    throw badRequest('问题工具地址或 API Key 未配置');
  }
  const { method = 'GET', body } = opts;
  const url = joinUrl(activeTool.baseUrl, path);
  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: {
        'x-api-key': activeTool.apiKey,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.pams.timeout),
    });
  } catch (err) {
    throw badRequest(`访问 PAMS 接口失败：${err.name === 'TimeoutError' ? '请求超时' : err.message}`);
  }
  if (!resp.ok) throw badRequest(`PAMS 接口返回状态 ${resp.status}`);
  let json;
  try {
    json = await resp.json();
  } catch {
    throw badRequest('PAMS 接口返回非 JSON 数据');
  }
  if (json && json.success === false) {
    throw badRequest(json.message || 'PAMS 接口返回失败');
  }
  return json?.data;
}

/**
 * 拉取全部问题概述列表。
 * @returns {Promise<Array<{issue_id,status,detailed_classification,system,summary,work_order_no,details}>>}
 */
export async function fetchIssueOverview() {
  const tool = await issueToolConfig();
  const data = await pamsFetch(tool.overviewApi, { method: 'GET' }, tool);
  return Array.isArray(data) ? data : [];
}

/**
 * 按问题编号拉取问题明细。
 * @param {string} issueId 问题编号
 * @returns {Promise<object|null>} 明细对象
 */
export async function fetchIssueDetail(issueId) {
  const tool = await issueToolConfig();
  const data = await pamsFetch(tool.detailApi, {
    method: 'POST',
    body: { issue_id: issueId },
  }, tool);
  return data || null;
}

/**
 * 文件：lib/pams.js
 * 用途：外部 PAMS 问题管理系统接口客户端。封装统一鉴权（x-api-key）与超时，
 *       提供「问题概述列表」与「问题明细」两个只读拉取方法，供问题同步使用。
 * 作者：hengguan
 * 说明：基于 Node 原生 fetch（Node ≥18 内置）；接口返回结构为 { success, data, ... }，
 *       本模块统一校验 success 并返回 data，异常抛 HttpError 由上层捕获处理。
 */

import { config } from '../config.js';
import { badRequest } from './http.js';

/**
 * 发起一次带鉴权的 PAMS 请求。
 * @param {string} path 接口路径（如 /PAMS/api/report/overview）
 * @param {object} [opts] { method, body }
 * @returns {Promise<any>} 接口的 data 字段
 */
async function pamsFetch(path, opts = {}) {
  const { method = 'GET', body } = opts;
  const url = `${config.pams.baseUrl}${path}`;
  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: {
        'x-api-key': config.pams.apiKey,
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
  const data = await pamsFetch('/PAMS/api/report/overview', { method: 'GET' });
  return Array.isArray(data) ? data : [];
}

/**
 * 按问题编号拉取问题明细。
 * @param {string} issueId 问题编号
 * @returns {Promise<object|null>} 明细对象
 */
export async function fetchIssueDetail(issueId) {
  const data = await pamsFetch('/PAMS/api/report/detail', {
    method: 'POST',
    body: { issue_id: issueId },
  });
  return data || null;
}

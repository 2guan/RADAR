/**
 * 文件：utils/io.js
 * 用途：导出（下载 xlsx）与导入（上传 xlsx）的前端辅助函数。
 * 作者：hengguan
 */

import { rawClient, TOKEN_KEY } from '../api/client.js';
import { message } from 'antd';

/**
 * 导出：POST 请求返回二进制，触发浏览器下载。
 * @param {string} url 接口
 * @param {object} body 请求体（含筛选条件）
 * @param {string} filename 下载文件名
 */
export async function exportXlsx(url, body, filename) {
  const resp = await rawClient.post(url, body, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(resp.data);
  const link = document.createElement('a');
  link.href = blobUrl; link.download = filename;
  link.click();
  URL.revokeObjectURL(blobUrl);
  message.success('已导出');
}

/**
 * 导入：上传文件 + 冲突模式 + 额外字段（如 category）。
 * @param {string} url 接口
 * @param {File} file 文件
 * @param {string} mode overwrite/skip/rollback
 * @param {object} extraFields 额外 form 字段
 */
export async function importXlsx(url, file, mode = 'skip', extraFields = {}) {
  const fd = new FormData();
  fd.append('mode', mode);
  for (const [k, v] of Object.entries(extraFields)) fd.append(k, v);
  fd.append('file', file);
  const resp = await rawClient.post(url, fd, {
    headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
  });
  return resp.data?.data;
}

/**
 * 模板/GET 下载：以查询参数请求二进制并触发浏览器下载。
 * @param {string} url 接口
 * @param {object} params 查询参数
 * @param {string} filename 下载文件名
 */
export async function downloadGet(url, params, filename) {
  const resp = await rawClient.get(url, { params, responseType: 'blob' });
  const blobUrl = URL.createObjectURL(resp.data);
  const link = document.createElement('a');
  link.href = blobUrl; link.download = filename;
  link.click();
  URL.revokeObjectURL(blobUrl);
  message.success('模板已下载');
}

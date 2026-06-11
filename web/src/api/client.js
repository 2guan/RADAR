/**
 * 文件：api/client.js
 * 用途：Axios 实例封装。统一注入 JWT、统一处理响应结构 {code,data,message}、
 *       401 跳转登录、错误中文提示。
 * 作者：hengguan
 * 说明：导出 request（返回 data 部分）与 rawClient（用于下载等需要原始响应的场景）。
 */

import axios from 'axios';
import { message } from 'antd';

// 本地保存 token 的键
export const TOKEN_KEY = 'radar_token';

const rawClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 请求拦截：注入 token
rawClient.interceptors.request.use((cfg) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// 响应拦截：统一错误处理
rawClient.interceptors.response.use(
  (resp) => resp,
  (error) => {
    const status = error.response?.status;
    const msg = error.response?.data?.message || '网络异常，请稍后再试';
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (location.hash !== '#/login') location.hash = '#/login';
    }
    message.error(msg);
    return Promise.reject(error);
  },
);

/**
 * 通用请求：自动解包 data 字段。
 * @returns {Promise<any>} 后端 data
 */
export async function request(config) {
  const resp = await rawClient.request(config);
  return resp.data?.data;
}

/** GET 便捷方法 */
export const apiGet = (url, params) => request({ method: 'get', url, params });
/** POST 便捷方法 */
export const apiPost = (url, data) => request({ method: 'post', url, data });
/** PUT 便捷方法 */
export const apiPut = (url, data) => request({ method: 'put', url, data });
/** DELETE 便捷方法 */
export const apiDelete = (url) => request({ method: 'delete', url });

export { rawClient };

/**
 * 文件：lib/http.js
 * 用途：统一 HTTP 响应封装与业务异常类型，保证全平台返回结构一致 {code,data,message}。
 * 作者：hengguan
 * 说明：成功用 ok()，业务错误抛 HttpError，由全局错误处理器统一格式化。
 */

/**
 * 业务异常：携带 HTTP 状态码与中文提示。
 */
export class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

/** 400 参数错误 */
export const badRequest = (msg) => new HttpError(400, msg);
/** 401 未认证 */
export const unauthorized = (msg = '未登录或登录已失效') => new HttpError(401, msg);
/** 403 无权限 */
export const forbidden = (msg = '无操作权限') => new HttpError(403, msg);
/** 404 未找到 */
export const notFound = (msg = '资源不存在') => new HttpError(404, msg);

/**
 * 统一成功响应体。
 */
export function ok(data = null, message = 'success') {
  return { code: 0, data, message };
}

/**
 * 文件：web/src/modules/testing/api/index.js
 * 说明：测试模块通过平台 HTTP 客户端访问保持兼容的测试接口。
 * 用途：测试页面的模块 API 入口。
 * 作者：hengguan
 */

export { apiDelete, apiGet, apiPost, apiPut, rawClient } from '../../../platform/api.js';

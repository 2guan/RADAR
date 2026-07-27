/**
 * 文件：web/src/modules/identity-access/api/index.js
 * 说明：身份与权限模块统一通过平台客户端调用用户、角色和登录接口。
 * 用途：身份与权限页面的模块 API 入口。
 * 作者：hengguan
 */

export { apiDelete, apiGet, apiPost, apiPut, rawClient } from '../../../platform/api.js';

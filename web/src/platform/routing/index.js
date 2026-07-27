/**
 * 文件：web/src/platform/routing/index.js
 * 说明：集中导出业务模块可调用的稳定导航与详情链接能力。
 * 用途：平台路由前端公开入口。
 * 作者：hengguan
 */

export { default as CodeLink } from './CodeLink.jsx';
export { detailPath, detailUrl } from './detailLinks.js';
export { getHomePath } from './home.js';
export { useBackNavigation } from './navigation.js';

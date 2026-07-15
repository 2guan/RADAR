/**
 * 文件：router/home.js
 * 用途：统一维护用户默认首页到前端路由的映射。
 * 作者：hengguan
 */

export function getHomePath(defaultHome) {
  const routeMap = {
    '仪表盘': '/dashboard',
    '效能仪表盘': '/dashboard',
    '版本概览': '/overview',
    '需求分析': '/requirements',
    '工单分析': '/tickets',
    '问题管理': '/issues',
    '开发管理': '/dev',
    '测试管理': '/test/sit',
    '应用组装测试': '/test/sit',
    '用户测试': '/test/uat',
    '非功能测试': '/test/nft',
    '安全测试': '/test/sec',
    '投产管理': '/release/apply',
    '投产申请': '/release/apply',
    '投产审批': '/release',
    '人员管理': '/users',
    '系统设置': '/settings',
  };
  if (!defaultHome) return '/dashboard';
  if (defaultHome.startsWith('/')) return defaultHome;
  return routeMap[defaultHome] || '/dashboard';
}

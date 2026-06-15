/**
 * 文件：lib/perm-catalog.js
 * 用途：权限矩阵目录定义——模块与操作的中文标签，供权限矩阵 UI 渲染与后端校验复用。
 * 作者：hengguan
 * 说明：action 同时覆盖页面级(view)与页面内功能级(create/edit/intake/signoff...)。
 */

export const PERM_CATALOG = [
  { key: 'dashboard', label: '效能仪表盘', actions: [{ key: 'view', label: '查看' }, { key: 'manage', label: '管理系统图表' }] },
  { key: 'overview', label: '版本概览', actions: [{ key: 'view', label: '查看' }] },
  {
    key: 'requirement', label: '需求分析',
    actions: [
      { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
      { key: 'delete', label: '删除' }, { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
    ],
  },
  {
    key: 'issue', label: '问题管理',
    actions: [
      { key: 'view', label: '查看' }, { key: 'sync', label: '同步' },
    ],
  },
  {
    key: 'dev', label: '开发管理',
    actions: [
      { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
      { key: 'delete', label: '删除' }, { key: 'dev.intake', label: '承接开发' },
      { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
    ],
  },
  {
    key: 'test', label: '测试管理',
    actions: [
      { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
      { key: 'delete', label: '删除' }, { key: 'test.intake', label: '承接测试' },
      { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
    ],
  },
  {
    key: 'release', label: '投产管理',
    actions: [
      { key: 'view', label: '查看' }, { key: 'edit', label: '编辑' },
      { key: 'release.signoff', label: '评审会签' }, { key: 'release.register', label: '投产登记' },
      { key: 'export', label: '导出' },
    ],
  },
  {
    key: 'user', label: '人员管理',
    actions: [
      { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
      { key: 'delete', label: '删除' }, { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
    ],
  },
  {
    key: 'settings', label: '系统设置',
    actions: [
      { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
      { key: 'delete', label: '删除' }, { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
      { key: 'settings.permission.edit', label: '编辑权限矩阵' },
    ],
  },
];

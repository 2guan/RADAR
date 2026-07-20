/**
 * 文件：lib/perm-catalog.js
 * 用途：权限矩阵目录定义——模块与操作的中文标签，供权限矩阵 UI 渲染与后端校验复用。
 * 作者：hengguan
 * 说明：action 同时覆盖页面级(view)与页面内功能级(create/edit/signoff...)。
 */

export const PERM_CATALOG = [
  { key: 'dashboard', label: '效能仪表盘', actions: [{ key: 'view', label: '查看' }, { key: 'manage', label: '管理系统图表' }] },
  { key: 'overview', label: '版本概览', actions: [{ key: 'view', label: '查看' }] },
  {
    key: 'requirement', label: '需求分析',
    actions: [
      { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
      { key: 'status.edit', label: '调整状态' }, { key: 'delete', label: '删除' }, { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
    ],
  },
  {
    key: 'ticket', label: '工单分析',
    actions: [
      { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
      { key: 'status.edit', label: '调整状态' }, { key: 'delete', label: '删除' }, { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
    ],
  },
  {
    key: 'issue', label: '问题管理',
    actions: [
      { key: 'view', label: '查看' }, { key: 'sync', label: '同步' }, { key: 'delete', label: '清空' },
    ],
  },
  {
    key: 'dev', label: '开发管理',
    actions: [
      { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
      { key: 'status.edit', label: '调整状态' }, { key: 'delete', label: '删除' }, { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
    ],
  },
  ...[
    ['SIT', '应用组装测试'],
    ['UAT', '用户测试'],
    ['NFT', '非功能测试'],
    ['SEC', '安全测试'],
  ].map(([type, label]) => ({
    key: `test.${type}`, label,
    actions: [
      { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
      { key: 'status.edit', label: '调整状态' }, { key: 'delete', label: '删除' }, { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
    ],
  })),
  {
    key: 'release_apply', label: '投产申请',
    actions: [
      { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
      { key: 'delete', label: '删除' }, { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
    ],
  },
  {
    key: 'release', label: '投产审批',
    actions: [
      { key: 'view', label: '查看' }, { key: 'edit', label: '编辑' },
      { key: 'status.edit', label: '调整状态' },
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

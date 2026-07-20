/**
 * 文件：components/PermissionMatrix.jsx
 * 用途：权限矩阵配置。选择角色后以"模块 × 操作"矩阵形式展示复选框，
 *       覆盖页面级(查看)与页面内功能级(会签/导入导出等)权限，保存整体覆盖。
 * 作者：hengguan
 * 说明：超级管理员拥有全部权限，不可配置。
 */

import React, { useEffect, useState } from 'react';
import { Select, Checkbox, Button, Table, message, Alert, Space } from 'antd';
import { apiGet, apiPut } from '../api/client.js';

export default function PermissionMatrix() {
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [roleId, setRoleId] = useState(null);
  const [granted, setGranted] = useState(new Set());
  const [isSuper, setIsSuper] = useState(false);

  useEffect(() => {
    apiGet('/roles/all').then(setRoles);
    apiGet('/permissions/catalog').then(setCatalog);
  }, []);

  const loadRole = async (id) => {
    setRoleId(id);
    const res = await apiGet(`/roles/${id}/permissions`);
    setIsSuper(res.isSuper);
    setGranted(new Set(res.granted));
  };

  const toggle = (key, checked) => {
    const next = new Set(granted);
    if (checked) next.add(key); else next.delete(key);
    setGranted(next);
  };

  const save = async () => {
    await apiPut(`/roles/${roleId}/permissions`, { granted: [...granted] });
    message.success('权限已保存');
  };

  // 所有可能的操作列（取目录中操作并集，按常见顺序）
  const allActions = [
    { key: 'view', label: '查看' }, { key: 'create', label: '新增' }, { key: 'edit', label: '编辑' },
    { key: 'status.edit', label: '调整状态' },
    { key: 'delete', label: '删除' }, { key: 'import', label: '导入' }, { key: 'export', label: '导出' },
    { key: 'release.signoff', label: '评审会签' }, { key: 'release.register', label: '投产登记' },
    { key: 'settings.permission.edit', label: '编辑权限矩阵' },
  ];

  const columns = [
    { title: '模块', dataIndex: 'label', fixed: 'left', width: 120 },
    ...allActions.map((a) => ({
      title: a.label, key: a.key, align: 'center', width: 90,
      render: (_, mod) => {
        const has = mod.actions.some((x) => x.key === a.key);
        if (!has) return <span style={{ color: '#ccc' }}>—</span>;
        const permKey = `${mod.key}:${a.key}`;
        return (
          <Checkbox
            disabled={isSuper}
            checked={isSuper || granted.has(permKey)}
            onChange={(e) => toggle(permKey, e.target.checked)}
          />
        );
      },
    })),
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Space>
        <span>选择角色：</span>
        <Select
          style={{ width: 200 }} value={roleId} placeholder="请选择角色"
          onChange={loadRole} options={roles.map((r) => ({ value: r.id, label: r.name }))}
        />
        {roleId && !isSuper && <Button type="primary" onClick={save}>保存权限</Button>}
      </Space>
      {isSuper && <Alert type="info" showIcon message="超级管理员拥有全部权限，无需配置。" banner />}
      {roleId && (
        <Table
          rowKey="key" size="small" pagination={false} columns={columns} dataSource={catalog}
          scroll={{ x: 'max-content' }}
        />
      )}
    </Space>
  );
}

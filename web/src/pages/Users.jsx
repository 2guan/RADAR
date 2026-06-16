/**
 * 文件：pages/Users.jsx
 * 用途：人员管理页面。用户列表（一人多角色）+ 新增/编辑 + 重置密码 + 导入/导出。
 * 作者：hengguan
 * 说明：用户管理与角色权限配置页面，提供用户的增删改查、手机号重置和角色权限关联。
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Card, Button, Space, Modal, Form, Input, Select, Tag, Popconfirm, message,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, ImportOutlined, ExportOutlined,
} from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import DictSelect from '../components/DictSelect.jsx';
import Can from '../components/Can.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import ImportModal from '../components/ImportModal.jsx';
import { apiPost, apiPut, apiDelete, apiGet } from '../api/client.js';
import { exportXlsx, downloadGet } from '../utils/io.js';
import { useAppStore } from '../stores/app.js';

export default function Users() {
  const tableRef = useRef();
  const [form] = Form.useForm();
  const { platform } = useAppStore();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [roles, setRoles] = useState([]);
  
  const [filterQuery, setFilterQuery] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);

  // 初始化拉取：角色列表、所属机构字典分类（用于过滤面板和新增/编辑表单）、活跃用户列表（用于检索提示）
  useEffect(() => { 
    apiGet('/roles/all').then(setRoles).catch(() => {});
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
    apiGet('/users/active').then(setActiveUsers).catch(() => {});
  }, []);

  // 格式化各字段选择项
  const userOptions = activeUsers.map(u => ({ value: u.name, label: `${u.name} (${u.phone})` }));
  const orgOptions = orgs.map(o => ({ value: o.attr_value, label: o.display_value }));
  const roleOptions = roles.map(r => ({ value: r.code, label: r.name }));

  // 过滤器配置：指定字段、标签、展示类型、操作符及数据源
  const filterConfigs = [
    { field: 'user_info', label: '人员信息', type: 'select', op: 'in', isPrimary: true, placeholder: '姓名或手机号检索', options: userOptions },
    { field: 'org', label: '所属机构', type: 'select', op: 'in', isPrimary: true, options: orgOptions },
    { field: 'role', label: '角色', type: 'select', op: 'in', isPrimary: true, options: roleOptions },
  ];

  /**
   * 监听过滤器变更事件
   * 将多维过滤器（FilterPanel）的键值对转为后端通用的 [{field, value, op}] 过滤条件数组结构
   */
  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find(c => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '' && !(Array.isArray(item.value) && item.value.length === 0));
    setFilterQuery(arr);
  };

  // 后端分页列表查询获取器，注入当前的动态过滤器条件
  const fetcher = (q) => apiPost('/users/list', { ...q, filters: filterQuery });

  /**
   * 打开新增/编辑弹窗
   * @param {object|null} row - 传入的用户数据对象，若为 null 则代表新增
   */
  const openEdit = (row) => {
    setCurrent(row);
    form.setFieldsValue(row
      ? { ...row, roles: row.roles?.map((r) => r.code) }
      : { status: '启用' });
    if (!row) form.resetFields();
    setOpen(true);
  };

  /**
   * 保存人员修改或新增，根据当前编辑的记录是否存在决定调用 PUT 还是 POST API
   */
  const onSave = async () => {
    const v = await form.validateFields();
    if (current) await apiPut(`/users/${current.id}`, v);
    else await apiPost('/users', v);
    message.success('已保存');
    setOpen(false);
    tableRef.current?.reload();
  };

  // 删除人员，确认后调用 API 并在成功后刷新表格数据
  const onDelete = async (row) => { await apiDelete(`/users/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  /**
   * 重置密码：弹窗确认输入新密码，默认值为 Radar@2026!
   */
  const resetPwd = (row) => {
    let pwd = 'Radar@2026!';
    const minLen = platform['security.password.minLength'] ? Number(platform['security.password.minLength']) : 8;
    const complexityEnabled = platform['security.password.complexity'] !== 'false';
    Modal.confirm({
      title: `重置 ${row.name} 的密码`,
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>初始密码：</div>
          <Input defaultValue="Radar@2026!" onChange={(e) => { pwd = e.target.value; }} placeholder="新密码" />
          <div style={{ fontSize: 12, color: 'var(--radar-text-secondary)', marginTop: 4 }}>
            长度需不少于 {minLen} 位{complexityEnabled ? '，且需包含大小写字母、数字及特殊字符' : ''}。
          </div>
        </div>
      ),
      onOk: async () => {
        if (!pwd) {
          message.error('密码不能为空');
          throw new Error('密码不能为空');
        }
        if (pwd.length < minLen) {
          message.error(`密码长度不能小于 ${minLen} 位`);
          throw new Error(`密码长度不能小于 ${minLen} 位`);
        }
        if (complexityEnabled) {
          if (!/[A-Z]/.test(pwd) || !/[a-z]/.test(pwd) || !/[0-9]/.test(pwd) || !/[!@#$%^&*()_+\-=\[\]{};':",./<>?\\|~`]/.test(pwd)) {
            message.error('密码必须包含大小写字母、数字及特殊字符');
            throw new Error('密码校验失败');
          }
        }
        await apiPost(`/users/${row.id}/reset-password`, { password: pwd });
        message.success('密码已重置');
      },
    });
  };

  const [importOpen, setImportOpen] = useState(false);

  const columns = [
    {
      title: '手机号',
      dataIndex: 'phone',
      key: 'phone',
      sorter: true,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace' }}>
          {val}
        </span>
      ),
    },
    { title: '姓名', dataIndex: 'name', key: 'name' },
    { title: '所属机构', dataIndex: 'org', key: 'org' },
    {
      title: '角色',
      dataIndex: 'roles',
      key: 'roles',
      render: (rs) => (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, max-content)', gap: '4px 8px' }}>
          {(rs || []).map((r) => (
            <Tag key={r.id} className="status-tag tag-system" style={{ margin: 0 }}>{r.name}</Tag>
          ))}
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (s) => (
        <Tag className={s === '启用' ? 'status-tag status-tag-final' : 'status-tag status-tag-not-started'} style={{ margin: 0 }}>
          {s}
        </Tag>
      ),
    },
    {
      title: '操作', key: 'op', width: 120, fixed: 'right',
      render: (_, row) => (
        <Space size={0}>
          <Can module="user" action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Can>
          <Can module="user" action="edit"><Button type="link" size="small" icon={<KeyOutlined />} onClick={() => resetPwd(row)} title="重置密码" /></Can>
          <Can module="user" action="delete"><Popconfirm title="确认删除？" onConfirm={() => onDelete(row)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Can>
        </Space>
      ),
    },
  ];

  return (
    <Card 
      title={
        <Space size={12}>
          <span>人员管理</span>
          <Can module="user" action="create">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>
              新增人员
            </Button>
          </Can>
        </Space>
      }
      variant="borderless"
    >
      <FilterPanel
        configs={filterConfigs}
        onChange={handleFilterChange}
        actions={[
          <Can key="imp" module="user" action="import">
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)} style={{ width: 88 }}>导入</Button>
          </Can>,
          <Can key="exp" module="user" action="export">
            <Button icon={<ExportOutlined />} onClick={() => exportXlsx('/users/export', { filters: filterQuery }, '人员清单.xlsx')} style={{ width: 88 }}>导出</Button>
          </Can>,
        ]}
      />
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher}
        baseQuery={{ filters: filterQuery }}
        showSearch={false}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{item.name}</strong><span>{item.phone}</span></Space>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(item.roles || []).map((r) => (
                <Tag key={r.id} className="status-tag tag-system" style={{ margin: 0 }}>{r.name}</Tag>
              ))}
            </div>
          </Space>
        )}
      />

      <ImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={() => tableRef.current?.reload()}
        importUrl="/users/import"
        templateUrl="/users/template"
        templateFilename="人员导入模板.xlsx"
      />

      <Modal open={open} title={current ? '编辑人员' : '新增人员'} onCancel={() => setOpen(false)} onOk={onSave} okText="保存">
        <Form form={form} layout="vertical">
          <Form.Item name="phone" label="手机号（登录名）" rules={[{ required: true, message: '请输入手机号' }]}>
            <Input disabled={!!current} placeholder="如 13800010000" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}><Input /></Form.Item>
          <Form.Item name="org" label="所属机构"><DictSelect category="org" /></Form.Item>
          <Form.Item name="roles" label="角色（可多选）">
            <Select mode="multiple" placeholder="选择角色" options={roles.map((r) => ({ value: r.code, label: r.name }))} />
          </Form.Item>
          {!current && (
            <Form.Item
              name="password"
              label="初始密码"
              extra={`留空默认 Radar@2026!`}
              rules={[
                {
                  validator: (_, value) => {
                    if (!value) return Promise.resolve();
                    const minLen = platform['security.password.minLength'] ? Number(platform['security.password.minLength']) : 8;
                    if (value.length < minLen) {
                      return Promise.reject(new Error(`密码长度不能小于 ${minLen} 位`));
                    }
                    const complexityEnabled = platform['security.password.complexity'] !== 'false';
                    if (complexityEnabled) {
                      if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[!@#$%^&*()_+\-=\[\]{};':",./<>?\\|~`]/.test(value)) {
                        return Promise.reject(new Error('密码必须包含大小写字母、数字及特殊字符'));
                      }
                    }
                    return Promise.resolve();
                  }
                }
              ]}
            >
              <Input.Password placeholder="默认 Radar@2026!" />
            </Form.Item>
          )}
          <Form.Item name="status" label="状态">
            <Select options={[{ value: '启用', label: '启用' }, { value: '停用', label: '停用' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

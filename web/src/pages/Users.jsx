/**
 * 文件：pages/Users.jsx
 * 用途：人员管理页面。用户列表（一人多角色）+ 新增/编辑 + 重置密码 + 导入/导出。
 * 作者：hengguan
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Card, Button, Space, Modal, Form, Input, Select, Tag, Popconfirm, message, Upload, Dropdown,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, KeyOutlined, ImportOutlined, ExportOutlined, DownloadOutlined, DownOutlined,
} from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import DictSelect from '../components/DictSelect.jsx';
import Can from '../components/Can.jsx';
import { apiPost, apiPut, apiDelete } from '../api/client.js';
import { apiGet } from '../api/client.js';
import { exportXlsx, importXlsx, downloadGet } from '../utils/io.js';

export default function Users() {
  const tableRef = useRef();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [roles, setRoles] = useState([]);

  useEffect(() => { apiGet('/roles/all').then(setRoles); }, []);

  const fetcher = (q) => apiPost('/users/list', q);

  const openEdit = (row) => {
    setCurrent(row);
    form.setFieldsValue(row
      ? { ...row, roles: row.roles?.map((r) => r.code) }
      : { status: '启用' });
    if (!row) form.resetFields();
    setOpen(true);
  };

  const onSave = async () => {
    const v = await form.validateFields();
    if (current) await apiPut(`/users/${current.id}`, v);
    else await apiPost('/users', v);
    message.success('已保存');
    setOpen(false);
    tableRef.current?.reload();
  };

  const onDelete = async (row) => { await apiDelete(`/users/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  const resetPwd = (row) => {
    let pwd = '123456';
    Modal.confirm({
      title: `重置 ${row.name} 的密码`,
      content: <Input defaultValue="123456" onChange={(e) => { pwd = e.target.value; }} placeholder="新密码" />,
      onOk: async () => { await apiPost(`/users/${row.id}/reset-password`, { password: pwd }); message.success('密码已重置'); },
    });
  };

  const doImport = (file, mode) => {
    importXlsx('/users/import', file, mode)
      .then((r) => { message.success(`导入完成：新增${r.inserted} 更新${r.updated} 跳过${r.skipped}`); tableRef.current?.reload(); })
      .catch(() => {});
    return false;
  };

  const columns = [
    { title: '手机号', dataIndex: 'phone', key: 'phone', sorter: true, width: 150 },
    { title: '姓名', dataIndex: 'name', key: 'name', width: 120 },
    { title: '所属机构', dataIndex: 'org', key: 'org', width: 140 },
    { title: '角色', dataIndex: 'roles', key: 'roles', width: 240, render: (rs) => (rs || []).map((r) => <Tag key={r.id} color="green">{r.name}</Tag>) },
    { title: '状态', dataIndex: 'status', key: 'status', width: 90, render: (s) => <Tag color={s === '启用' ? 'green' : 'default'}>{s}</Tag> },
    {
      title: '操作', key: 'op', width: 160, fixed: 'right',
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
    <Card title="人员管理" variant="borderless">
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{item.name}</strong><span>{item.phone}</span></Space>
            <div>{(item.roles || []).map((r) => <Tag key={r.id} color="green">{r.name}</Tag>)}</div>
          </Space>
        )}
        toolbar={[
          <Can key="add" module="user" action="create"><Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>新增人员</Button></Can>,
          <Can key="tpl" module="user" action="import"><Button icon={<DownloadOutlined />} onClick={() => downloadGet('/users/template', {}, '人员模板.xlsx')}>模板</Button></Can>,
          <Can key="imp" module="user" action="import">
            <Dropdown menu={{ items: [
              { key: 'skip', label: '重复跳过' }, { key: 'overwrite', label: '覆盖更新' }, { key: 'rollback', label: '出错回滚' },
            ], onClick: ({ key }) => document.getElementById('user-import-' + key)?.click() }}>
              <Button icon={<ImportOutlined />}>导入 <DownOutlined /></Button>
            </Dropdown>
          </Can>,
          <Can key="exp" module="user" action="export"><Button icon={<ExportOutlined />} onClick={() => exportXlsx('/users/export', {}, '人员清单.xlsx')}>导出</Button></Can>,
        ]}
      />

      {['skip', 'overwrite', 'rollback'].map((m) => (
        <Upload key={m} showUploadList={false} beforeUpload={(f) => doImport(f, m)} accept=".xlsx,.csv">
          <span id={'user-import-' + m} />
        </Upload>
      ))}

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
            <Form.Item name="password" label="初始密码" extra="留空默认 123456"><Input.Password placeholder="默认 123456" /></Form.Item>
          )}
          <Form.Item name="status" label="状态">
            <Select options={[{ value: '启用', label: '启用' }, { value: '停用', label: '停用' }]} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

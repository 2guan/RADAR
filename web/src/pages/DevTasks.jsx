/**
 * 文件：pages/DevTasks.jsx
 * 用途：开发管理页面。开发任务列表 + 开发承接（按系统拆分）+ 编辑（复用 TaskEditor）+ 历史。
 * 作者：hengguan
 */

import React, { useRef, useState } from 'react';
import { Card, Button, Space, Modal, Form, Select, Tag, Popconfirm, message } from 'antd';
import { ToolOutlined, EditOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import SystemSelect from '../components/SystemSelect.jsx';
import HistoryDrawer from '../components/HistoryDrawer.jsx';
import TaskEditor from '../components/editors/TaskEditor.jsx';
import Can from '../components/Can.jsx';
import { apiPost, apiDelete } from '../api/client.js';
import { useAppStore } from '../stores/app.js';

export default function DevTasks() {
  const tableRef = useRef();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [editId, setEditId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [reqList, setReqList] = useState([]);
  const [intakeForm] = Form.useForm();

  const fetcher = (q) => apiPost('/dev-tasks/list', { ...q, releasePointIds });
  const onDelete = async (row) => { await apiDelete(`/dev-tasks/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  const openIntake = async () => {
    const res = await apiPost('/requirements/list', { releasePointIds, pageSize: 0 });
    setReqList(res.list || []);
    intakeForm.resetFields();
    setIntakeOpen(true);
  };
  const onPickReq = (reqCode) => {
    const r = reqList.find((x) => x.req_code === reqCode);
    intakeForm.setFieldsValue({ systems: [...new Set([...(r?.main_systems || []), ...(r?.collab_dev_systems || [])])] });
  };
  const doIntake = async () => {
    const v = await intakeForm.validateFields();
    const res = await apiPost('/dev-tasks/intake', { reqCode: v.reqCode, systems: v.systems });
    message.success(`已承接 ${res.length} 个开发任务`);
    setIntakeOpen(false);
    tableRef.current?.reload();
  };

  const columns = [
    { title: '状态', dataIndex: 'status', key: 'status', align: 'center', render: (s) => <StatusBadge status={s} /> },
    {
      title: '计划投产点',
      dataIndex: 'release_date',
      key: 'release_date',
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace' }}>
          {val || '—'}
        </span>
      ),
    },
    {
      title: '任务编号',
      dataIndex: 'task_code',
      key: 'task_code',
      sorter: true,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', fontWeight: 500 }}>
          {val}
        </span>
      ),
    },
    { title: '任务名称', dataIndex: 'task_name', key: 'task_name', ellipsis: true },
    {
      title: '关联需求',
      dataIndex: 'req_code',
      key: 'req_code',
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace' }}>
          {val}
        </span>
      ),
    },
    { title: '负责人', dataIndex: 'owner', key: 'owner' },
    {
      title: '实施系统',
      dataIndex: 'impl_system_name',
      key: 'impl_system_name',
      render: (val) => val ? (
        <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{val}</Tag>
      ) : '—',
    },
    { title: '偏差率', dataIndex: 'deviation_rate', key: 'deviation_rate', render: (v) => (v == null ? '—' : `${v}%`) },
    {
      title: '操作', key: 'op', width: 100, fixed: 'right',
      render: (_, row) => (
        <Space size={0} onClick={(e) => e.stopPropagation()}>
          <Can module="dev" action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditId(row.id)} /></Can>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => setHistoryId(row.id)} />
          <Can module="dev" action="delete"><Popconfirm title="确认删除？" onConfirm={() => onDelete(row)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Can>
        </Space>
      ),
    },
  ];

  return (
    <Card title="开发管理" variant="borderless">
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher} baseQuery={{ releasePointIds }} onRowClick={(r) => setEditId(r.id)}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{item.task_code}</strong><StatusBadge status={item.status} /></Space>
            <div>{item.task_name}</div>
            {item.release_date && (
              <div style={{ fontSize: '11px', color: 'var(--radar-text-secondary)' }}>
                计划投产点：{item.release_date}
              </div>
            )}
            <Space size="small">
              {item.impl_system_name && (
                <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{item.impl_system_name}</Tag>
              )}
              <span>负责人：{item.owner || '—'}</span>
            </Space>
          </Space>
        )}
        toolbar={[
          <Can key="intake" module="dev" action="dev.intake"><Button type="primary" icon={<ToolOutlined />} onClick={openIntake}>开发承接</Button></Can>,
        ]}
      />

      <Modal open={intakeOpen} title="开发承接" onCancel={() => setIntakeOpen(false)} onOk={doIntake} okText="承接">
        <Form form={intakeForm} layout="vertical">
          <Form.Item name="reqCode" label="选择需求" rules={[{ required: true, message: '请选择需求' }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择需求" onChange={onPickReq}
              options={reqList.map((r) => ({ value: r.req_code, label: `${r.req_code} ${r.title}` }))} />
          </Form.Item>
          <Form.Item name="systems" label="拆分系统（默认主责+协同改造系统，可调整）" rules={[{ required: true, message: '请选择系统' }]}>
            <SystemSelect style={{ width: '100%' }} />
          </Form.Item>
          <Tag className="status-tag-final" style={{ borderRadius: 2 }}>将为每个所选系统建立一个开发任务，已建立的系统自动跳过</Tag>
        </Form>
      </Modal>

      <TaskEditor open={!!editId} kind="dev" taskId={editId} onClose={() => setEditId(null)} onSaved={() => tableRef.current?.reload()} />
      <HistoryDrawer open={!!historyId} entityType="dev" entityId={historyId} onClose={() => setHistoryId(null)} />
    </Card>
  );
}

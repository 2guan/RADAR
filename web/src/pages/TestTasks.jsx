/**
 * 文件：pages/TestTasks.jsx
 * 用途：测试管理。SIT/UAT/NFT/SEC 拆为 4 个独立页面，复用同一面板（TestPanel）：
 *       列表 + 测试承接 + 编辑（复用 TaskEditor）+ 历史。各页面对应侧栏"测试管理"子菜单。
 * 作者：hengguan
 */

import React, { useRef, useState } from 'react';
import { Card, Button, Space, Modal, Form, Select, Tag, Popconfirm, message } from 'antd';
import { ExperimentOutlined, EditOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import SystemSelect from '../components/SystemSelect.jsx';
import HistoryDrawer from '../components/HistoryDrawer.jsx';
import TaskEditor from '../components/editors/TaskEditor.jsx';
import Can from '../components/Can.jsx';
import { apiPost, apiDelete } from '../api/client.js';
import { useAppStore } from '../stores/app.js';

const TYPE_LABEL = { SIT: '应用组装测试', UAT: '用户测试', NFT: '非功能测试', SEC: '安全测试' };

function TestPanel({ testType }) {
  const tableRef = useRef();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [editId, setEditId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [reqList, setReqList] = useState([]);
  const [intakeForm] = Form.useForm();

  const fetcher = (q) => apiPost('/test-tasks/list', { ...q, releasePointIds, testType });
  const onDelete = async (row) => { await apiDelete(`/test-tasks/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  const openIntake = async () => {
    const res = await apiPost('/requirements/list', { releasePointIds, pageSize: 0 });
    setReqList(res.list || []);
    intakeForm.resetFields();
    setIntakeOpen(true);
  };
  const onPickReq = (reqCode) => {
    const r = reqList.find((x) => x.req_code === reqCode);
    intakeForm.setFieldsValue({ systems: [...new Set([...(r?.main_systems || []), ...(r?.collab_test_systems || [])])] });
  };
  const doIntake = async () => {
    const v = await intakeForm.validateFields();
    const res = await apiPost('/test-tasks/intake', { reqCode: v.reqCode, testType, systems: v.systems });
    message.success(`已承接 ${res.length} 个${TYPE_LABEL[testType]}任务`);
    setIntakeOpen(false);
    tableRef.current?.reload();
  };

  const columns = [
    { title: '任务编号', dataIndex: 'task_code', key: 'task_code', sorter: true, width: 230, fixed: 'left' },
    { title: '任务名称', dataIndex: 'task_name', key: 'task_name', width: 220, ellipsis: true },
    { title: '关联需求', dataIndex: 'req_code', key: 'req_code', width: 170 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 110, render: (s) => <StatusBadge status={s} /> },
    { title: '负责人', dataIndex: 'owner', key: 'owner', width: 100 },
    { title: '实施系统', dataIndex: 'impl_system', key: 'impl_system', width: 120, render: (v) => v || '—' },
    { title: '偏差率', dataIndex: 'deviation_rate', key: 'deviation_rate', width: 90, render: (v) => (v == null ? '—' : `${v}%`) },
    {
      title: '操作', key: 'op', width: 120, fixed: 'right',
      render: (_, row) => (
        <Space size={0} onClick={(e) => e.stopPropagation()}>
          <Can module="test" action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditId(row.id)} /></Can>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => setHistoryId(row.id)} />
          <Can module="test" action="delete"><Popconfirm title="确认删除？" onConfirm={() => onDelete(row)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Can>
        </Space>
      ),
    },
  ];

  return (
    <>
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher} baseQuery={{ releasePointIds, testType }} onRowClick={(r) => setEditId(r.id)}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{item.task_code}</strong><StatusBadge status={item.status} /></Space>
            <div>{item.task_name}</div>
            <span>负责人：{item.owner || '—'}</span>
          </Space>
        )}
        toolbar={[
          <Can key="intake" module="test" action="test.intake"><Button type="primary" icon={<ExperimentOutlined />} onClick={openIntake}>测试承接</Button></Can>,
        ]}
      />

      <Modal open={intakeOpen} title={`${TYPE_LABEL[testType]}承接`} onCancel={() => setIntakeOpen(false)} onOk={doIntake} okText="承接">
        <Form form={intakeForm} layout="vertical">
          <Form.Item name="reqCode" label="选择需求" rules={[{ required: true, message: '请选择需求' }]}>
            <Select showSearch optionFilterProp="label" placeholder="选择需求" onChange={onPickReq}
              options={reqList.map((r) => ({ value: r.req_code, label: `${r.req_code} ${r.title}` }))} />
          </Form.Item>
          <Form.Item name="systems" label="拆分系统（留空则默认建立 1 个任务）">
            <SystemSelect style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <TaskEditor open={!!editId} kind="test" taskId={editId} onClose={() => setEditId(null)} onSaved={() => tableRef.current?.reload()} />
      <HistoryDrawer open={!!historyId} entityType="test" entityId={historyId} onClose={() => setHistoryId(null)} />
    </>
  );
}

/** 4 个独立测试页面（对应侧栏"测试管理"子菜单） */
export function SitPage() {
  return <Card title="应用组装测试（SIT）" variant="borderless"><TestPanel testType="SIT" /></Card>;
}
export function UatPage() {
  return <Card title="用户测试（UAT）" variant="borderless"><TestPanel testType="UAT" /></Card>;
}
export function NftPage() {
  return <Card title="非功能测试（NFT）" variant="borderless"><TestPanel testType="NFT" /></Card>;
}
export function SecPage() {
  return <Card title="安全测试（SEC）" variant="borderless"><TestPanel testType="SEC" /></Card>;
}

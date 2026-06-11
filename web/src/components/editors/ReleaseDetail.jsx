/**
 * 文件：components/editors/ReleaseDetail.jsx
 * 用途：投产详情弹窗（可复用：投产管理页与版本概览）。展示并编辑投产负责人、评审会签
 *       （仅具备对应会签角色的人员或超管可签署/驳回）、各系统投产登记。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import {
  Modal, Card, Descriptions, Table, Space, Button, Input, Select, DatePicker, message, Empty,
} from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import StatusBadge from '../StatusBadge.jsx';
import { apiGet, apiPost, apiPut } from '../../api/client.js';
import { useAppStore } from '../../stores/app.js';

export default function ReleaseDetail({ open, reqCode, onClose, onChanged }) {
  const { user, can } = useAppStore();
  const [detail, setDetail] = useState(null);

  const reload = async () => {
    if (!reqCode) return;
    setDetail(await apiGet(`/release/${reqCode}`));
  };
  useEffect(() => { if (open && reqCode) reload(); }, [open, reqCode]);

  // 当前用户是否可对某会签角色签署：超管或拥有该角色
  const canSign = (so) => can('release', 'release.signoff')
    && (user?.isSuper || (user?.roles || []).some((r) => r.name === so.role_name));

  const sign = (so, result) => {
    let conclusion = '';
    Modal.confirm({
      title: result === '已签署' ? `签署通过 · ${so.role_name}` : `驳回 · ${so.role_name}`,
      content: <Input.TextArea placeholder="签署备注 / 结论" onChange={(e) => { conclusion = e.target.value; }} />,
      onOk: async () => {
        await apiPost(`/release/signoff/${so.id}`, { result, conclusion });
        message.success('签署完成');
        reload(); onChanged?.();
      },
    });
  };

  const SystemRow = ({ rs }) => {
    const [time, setTime] = useState(rs.actual_release_time ? dayjs(rs.actual_release_time) : null);
    const [status, setStatus] = useState(rs.status);
    const editable = can('release', 'release.register');
    return (
      <Space wrap size={6}>
        <StatusBadge status={status} />
        <b>{rs.system_code}</b>
        <span style={{ color: 'var(--radar-text-secondary)' }}>{rs.impl_org || '—'}</span>
        <DatePicker size="small" placeholder="实际投产时间" value={time} onChange={setTime} disabled={!editable} />
        <Select size="small" value={status} style={{ width: 100 }} onChange={setStatus} disabled={!editable}
          options={['待投产', '已投产', '已取消'].map((s) => ({ value: s, label: s }))} />
        {editable && (
          <Button size="small" type="primary" onClick={async () => {
            await apiPut(`/release/system/${rs.id}`, { actual_release_time: time ? time.format('YYYY-MM-DD') : null, status });
            message.success('已登记'); reload(); onChanged?.();
          }}>保存</Button>
        )}
      </Space>
    );
  };

  const signoffCols = [
    { title: '会签角色', dataIndex: 'role_name', width: 120 },
    { title: '签署状态', dataIndex: 'result', width: 100, render: (s) => <StatusBadge status={s} /> },
    { title: '签署人', dataIndex: 'signer_name', width: 100, render: (v) => v || '—' },
    { title: '签署时间', dataIndex: 'sign_time', width: 160, render: (v) => v || '—' },
    { title: '结论', dataIndex: 'conclusion', render: (v) => v || '—' },
    {
      title: '操作', key: 'op', width: 130,
      render: (_, so) => (canSign(so) ? (
        <Space size={0}>
          <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => sign(so, '已签署')}>签署</Button>
          <Button type="link" size="small" danger icon={<CloseOutlined />} onClick={() => sign(so, '已驳回')}>驳回</Button>
        </Space>
      ) : <span style={{ color: '#bbb' }}>无权限</span>),
    },
  ];

  return (
    <Modal
      open={open}
      width={880}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
      title={(
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 32 }}>
          <span className="lc-id big" style={{ margin: 0 }}>{reqCode || 'REQ'}</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>投产详情</span>
          {detail?.releaseTask && <StatusBadge status={detail.releaseTask.status} />}
        </div>
      )}
    >
      {!detail ? <Empty /> : !detail.releaseTask ? (
        <Empty description="该需求尚未发起投产评审" />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="需求标题">{detail.requirement.title}</Descriptions.Item>
            <Descriptions.Item label="投产状态"><StatusBadge status={detail.releaseTask.status} /></Descriptions.Item>
          </Descriptions>
          <Card size="small" title="评审会签">
            <Table rowKey="id" size="small" pagination={false} columns={signoffCols} dataSource={detail.signoffs} />
          </Card>
          <Card size="small" title="各系统投产登记（全部已投产后，需求投产状态自动置为终态）">
            <Space direction="vertical" style={{ width: '100%' }}>
              {detail.systems.length === 0 ? '无改造系统' : detail.systems.map((rs) => <SystemRow key={rs.id} rs={rs} />)}
            </Space>
          </Card>
        </Space>
      )}
    </Modal>
  );
}

/**
 * 文件：pages/Release.jsx
 * 用途：投产管理页面。需求投产列表（投产/会签进度）+ 发起投产评审 + 投产详情（复用 ReleaseDetail）。
 * 作者：hengguan
 */

import React, { useRef, useState } from 'react';
import { Card, Button, Space, Tag, message } from 'antd';
import { RocketOutlined } from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ReleaseDetail from '../components/editors/ReleaseDetail.jsx';
import Can from '../components/Can.jsx';
import { apiPost } from '../api/client.js';
import { useAppStore } from '../stores/app.js';

export default function Release() {
  const tableRef = useRef();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [detailReq, setDetailReq] = useState(null);

  const fetcher = (q) => apiPost('/release/list', { releasePointIds, keyword: q.keyword });

  const init = async (reqCode) => {
    try {
      await apiPost(`/release/${reqCode}/init`);
      message.success('已发起投产评审');
      tableRef.current?.reload();
      setDetailReq(reqCode);
    } catch { /* 已提示 */ }
  };

  const columns = [
    { title: '需求编号', dataIndex: 'req_code', key: 'req_code', width: 180 },
    { title: '需求标题', dataIndex: 'title', key: 'title', width: 240, ellipsis: true },
    { title: '投产状态', dataIndex: 'release_status', key: 'release_status', width: 120, render: (s) => <StatusBadge status={s} /> },
    {
      title: '会签进度', key: 'signoff', width: 180,
      render: (_, r) => (r.signoff.total ? (
        <Space size={4}>
          <Tag color="green">签 {r.signoff.signed}</Tag>
          {r.signoff.rejected > 0 && <Tag color="red">驳 {r.signoff.rejected}</Tag>}
          <span>/ {r.signoff.total}</span>
        </Space>
      ) : '—'),
    },
    { title: 'UAT', key: 'uat', width: 90, render: (_, r) => (r.uat_ready ? <Tag color="green">已就绪</Tag> : <Tag>未就绪</Tag>) },
    {
      title: '操作', key: 'op', width: 160, fixed: 'right',
      render: (_, r) => (
        <Space onClick={(e) => e.stopPropagation()}>
          {r.initiated
            ? <Button type="link" size="small" onClick={() => setDetailReq(r.req_code)}>查看详情</Button>
            : (
              <Can module="release" action="release.register">
                <Button type="primary" size="small" icon={<RocketOutlined />} disabled={!r.uat_ready} onClick={() => init(r.req_code)}>发起投产</Button>
              </Can>
            )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="投产管理" variant="borderless">
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher} baseQuery={{ releasePointIds }} rowKey="req_code"
        onRowClick={(r) => r.initiated && setDetailReq(r.req_code)}
        mobileCard={(r) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{r.req_code}</strong><StatusBadge status={r.release_status} /></Space>
            <div>{r.title}</div>
            {r.initiated ? <Button size="small" onClick={() => setDetailReq(r.req_code)}>查看详情</Button>
              : <Can module="release" action="release.register"><Button size="small" type="primary" disabled={!r.uat_ready} onClick={() => init(r.req_code)}>发起投产</Button></Can>}
          </Space>
        )}
      />

      <ReleaseDetail open={!!detailReq} reqCode={detailReq} onClose={() => setDetailReq(null)} onChanged={() => tableRef.current?.reload()} />
    </Card>
  );
}

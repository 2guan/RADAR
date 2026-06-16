/**
 * 文件：pages/Release.jsx
 * 用途：投产审批页面。逐条展示「投产申请」中所选择的需求/问题，含投产状态、评审状态、计划投产点、
 *       需求/问题编号、需求标题/问题概述、会签进度。点击行打开投产审批详情（复用 ReleaseDetail）。
 * 作者：hengguan
 * 说明：审批对象来源于投产申请的 ref_codes（需求或问题）；不再列出全部投产点需求，也不再有「UAT 终态发起评审」逻辑。
 */

import React, { useRef, useState, useEffect } from 'react';
import { Card, Button, Space, Tag } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import ReleaseDetail from '../components/editors/ReleaseDetail.jsx';
import Can from '../components/Can.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import { apiPost, apiGet } from '../api/client.js';
import { useAppStore } from '../stores/app.js';
import { exportXlsx } from '../utils/io.js';

export default function Release() {
  const tableRef = useRef();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [detailCode, setDetailCode] = useState(null);
  const [filterQuery, setFilterQuery] = useState([]);

  const [points, setPoints] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [orgs, setOrgs] = useState([]);

  useEffect(() => {
    apiGet('/release-points/all').then(setPoints).catch(() => {});
    apiGet('/dict/by-category/release_status').then((res) => {
      setStatuses([{ attr_value: '未发起', display_value: '未发起' }, ...(res || [])]);
    }).catch(() => {});
    apiGet('/dict/by-category/review_status').then(setReviews).catch(() => {});
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
  }, []);

  const pointOptions = points.map((p) => ({ value: p.id, label: p.release_date }));
  const statusOptions = statuses.map((s) => ({ value: s.attr_value, label: s.display_value }));
  const reviewOptions = reviews.map((s) => ({ value: s.attr_value, label: s.display_value }));
  const orgOptions = orgs.map((o) => ({ value: o.attr_value, label: o.display_value }));

  const filterConfigs = [
    { field: 'impl_org', label: '实施机构', type: 'select', isPrimary: true, op: 'in', options: orgOptions },
    { field: 'code', label: '需求/问题编号', type: 'input', isPrimary: true, op: 'like', placeholder: '需求/问题编号检索' },
    { field: 'content', label: '标题/概述', type: 'input', isPrimary: true, op: 'like', placeholder: '需求标题或问题概述检索' },
    { field: 'status', label: '投产状态', type: 'select', op: 'in', options: statusOptions },
    { field: 'review_status', label: '评审状态', type: 'select', op: 'in', options: reviewOptions },
  ];

  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find((c) => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '');
    setFilterQuery(arr);
  };

  const fetcher = (q) => apiPost('/release/list', { ...q, releasePointIds, filters: filterQuery });

  const monoStyle = { fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace' };

  const columns = [
    { title: '投产状态', dataIndex: 'release_status', key: 'release_status', align: 'center', width: 96, render: (s) => <StatusBadge status={s} /> },
    {
      title: '评审状态', dataIndex: 'review_status', key: 'review_status', align: 'center', width: 96,
      render: (s) => (
        s ? (
          <StatusBadge
            status={s}
            style={{ width: 68, display: 'inline-flex', justifyContent: 'center' }}
          />
        ) : '—'
      ),
    },
    {
      title: '会签进度', key: 'signoff', width: 130,
      render: (_, r) => (r.signoff.total ? (
        <Space size={4}>
          <Tag className={`status-tag ${r.signoff.signed === 0 ? 'status-tag-initial' : (r.signoff.signed >= r.signoff.total ? 'status-tag-final' : 'status-tag-in-progress')}`} style={{ margin: 0 }}>签 {r.signoff.signed}</Tag>
          {r.signoff.rejected > 0 && <Tag className="status-tag status-tag-error" style={{ margin: 0 }}>驳 {r.signoff.rejected}</Tag>}
          <span>/ {r.signoff.total}</span>
        </Space>
      ) : '—'),
    },
    {
      title: '计划投产点', dataIndex: 'release_date', key: 'release_date', width: 120,
      render: (val) => <span style={monoStyle}>{val || '—'}</span>,
    },
    {
      title: '实施机构', dataIndex: 'impl_org', key: 'impl_org', width: 110, ellipsis: true,
      render: (v) => v || '—',
    },
    {
      title: '需求/问题编号', dataIndex: 'code', key: 'code', width: 220,
      render: (val, r) => (
        <Space size={6}>
          <Tag className="status-tag tag-system" style={{ margin: 0, borderRadius: 2 }}>{r.entity_type === 'issue' ? '问题' : (r.entity_type === 'requirement' ? '需求' : '其他')}</Tag>
          <span style={{ ...monoStyle, fontWeight: 500 }}>{val}</span>
        </Space>
      ),
    },
    {
      title: '需求标题/问题概述', dataIndex: 'title', key: 'title',
      render: (v) => (
        <div
          title={v || ''}
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '18px', maxHeight: 36 }}
        >
          {v || '—'}
        </div>
      ),
    },
  ];

  return (
    <Card title="投产审批" variant="borderless">
      <FilterPanel
        configs={filterConfigs}
        onChange={handleFilterChange}
        actions={[
          <Can key="exp" module="release" action="export">
            <Button icon={<ExportOutlined />} onClick={() => exportXlsx('/release/export', { releasePointIds, filters: filterQuery }, '投产审批清单.xlsx')} style={{ width: 88 }}>导出</Button>
          </Can>,
        ]}
      />
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher} baseQuery={{ releasePointIds, filters: filterQuery }} rowKey="code"
        showSearch={false}
        tableScroll={{}}
        onRowClick={(r) => setDetailCode(r.code)}
        mobileCard={(r) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <strong>{r.code}</strong>
              <Space size={4}><StatusBadge status={r.release_status} />{r.review_status && <StatusBadge status={r.review_status} />}</Space>
            </Space>
            <div>{r.title}</div>
            {r.impl_org && (
              <div style={{ fontSize: '11px', color: 'var(--radar-text-secondary)' }}>实施机构：{r.impl_org}</div>
            )}
            {r.release_date && (
              <div style={{ fontSize: '11px', color: 'var(--radar-text-secondary)' }}>计划投产点：{r.release_date}</div>
            )}
          </Space>
        )}
      />

      <ReleaseDetail open={!!detailCode} code={detailCode} onClose={() => setDetailCode(null)} onChanged={() => tableRef.current?.reload()} />
    </Card>
  );
}

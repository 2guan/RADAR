/**
 * 文件：pages/Issues.jsx
 * 用途：问题管理页面（只读）。展示从外部 PAMS 系统同步的问题清单，点击查看问题详情；
 *       提供「同步问题」（拉取概述列表）与「同步问题详情」（逐条更新明细）两个同步按钮。
 * 作者：hengguan
 * 说明：列表仅显示 问题编号/状态/详细分类/所属系统/问题概述；无新增/编辑/删除能力。
 */

import React, { useRef, useState, useEffect } from 'react';
import { Card, Button, Space, message, Modal } from 'antd';
import { SyncOutlined, CloudSyncOutlined } from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import Can from '../components/Can.jsx';
import IssueDetail from '../components/editors/IssueDetail.jsx';
import { apiGet, apiPost } from '../api/client.js';

export default function Issues() {
  const tableRef = useRef();
  const [detailId, setDetailId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncingDetail, setSyncingDetail] = useState(false);

  // 下拉选项：状态、详细分类、系统
  const [statuses, setStatuses] = useState([]);
  const [classifications, setClassifications] = useState([]);
  const [systems, setSystems] = useState([]);

  // 同步后用于刷新选项（详细分类/系统直接取自当前问题库去重）
  const loadOptions = () => {
    apiPost('/issues/list', { pageSize: 0 }).then((res) => {
      const list = res?.list || [];
      const uniq = (arr) => [...new Set(arr.filter(Boolean))];
      setStatuses(uniq(list.map((r) => r.status)).map((v) => ({ value: v, label: v })));
      setClassifications(uniq(list.map((r) => r.detailed_classification)).map((v) => ({ value: v, label: v })));
      setSystems(uniq(list.map((r) => r.system)).map((v) => ({ value: v, label: v })));
    }).catch(() => {});
  };

  useEffect(() => { loadOptions(); }, []);

  const filterConfigs = [
    { field: 'issue_code', label: '问题编号', type: 'input', isPrimary: true, op: 'like', placeholder: '问题编号检索' },
    { field: 'summary', label: '问题概述', type: 'input', isPrimary: true, op: 'like', placeholder: '问题概述检索' },
    { field: 'status', label: '状态', type: 'select', op: 'in', options: statuses },
    { field: 'detailed_classification', label: '详细分类', type: 'select', op: 'in', options: classifications },
    { field: 'system', label: '所属系统', type: 'select', op: 'in', options: systems },
  ];

  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find((c) => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '' && !(Array.isArray(item.value) && item.value.length === 0));
    setFilterQuery(arr);
  };

  const fetcher = (q) => apiPost('/issues/list', q);

  const openDetail = (row) => { setDetailId(row?.id || null); setDetailOpen(true); };

  // 同步问题：拉取最新问题概述列表
  const onSync = async () => {
    setSyncing(true);
    try {
      const r = await apiPost('/issues/sync', {});
      message.success(`同步问题完成：新增 ${r.inserted}，更新 ${r.updated}${r.failed?.length ? `，失败 ${r.failed.length}` : ''}`);
      tableRef.current?.reload();
      loadOptions();
    } finally {
      setSyncing(false);
    }
  };

  // 同步问题详情：逐条按问题编号更新明细
  const onSyncDetail = () => {
    Modal.confirm({
      title: '同步问题详情',
      content: '将按问题编号逐条拉取并更新问题明细，问题较多时可能耗时较长，确认继续？',
      okText: '开始同步',
      cancelText: '取消',
      onOk: async () => {
        setSyncingDetail(true);
        try {
          const r = await apiPost('/issues/sync-detail', {});
          message.success(`同步问题详情完成：更新 ${r.updated}/${r.total}${r.failed?.length ? `，失败 ${r.failed.length}` : ''}`);
          tableRef.current?.reload();
          loadOptions();
        } finally {
          setSyncingDetail(false);
        }
      },
    });
  };

  const columns = [
    {
      title: '问题编号', dataIndex: 'issue_code', key: 'issue_code', sorter: true, defaultSortOrder: 'descend',
      width: 150,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', fontWeight: 500 }}>
          {val}
        </span>
      ),
    },
    { title: '状态', dataIndex: 'status', key: 'status', align: 'center', width: 100, render: (s) => <StatusBadge status={s} /> },
    { title: '详细分类', dataIndex: 'detailed_classification', key: 'detailed_classification', width: 140, ellipsis: true },
    { title: '所属系统', dataIndex: 'system', key: 'system', width: 200, ellipsis: true },
    {
      title: '问题概述', dataIndex: 'summary', key: 'summary',
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
    <Card
      title={
        <Space size={12} wrap>
          <span>问题管理</span>
          <Can module="issue" action="sync">
            <Button type="primary" icon={<SyncOutlined />} loading={syncing} onClick={onSync}>同步问题</Button>
          </Can>
          <Can module="issue" action="sync">
            <Button icon={<CloudSyncOutlined />} loading={syncingDetail} onClick={onSyncDetail}>同步问题详情</Button>
          </Can>
        </Space>
      }
      variant="borderless"
    >
      <FilterPanel configs={filterConfigs} onChange={handleFilterChange} />
      <DataTable
        ref={tableRef}
        columns={columns}
        fetcher={fetcher}
        baseQuery={{ filters: filterQuery }}
        defaultSort={[{ field: 'issue_code', order: 'desc' }]}
        showSearch={false}
        onRowClick={openDetail}
        tableScroll={null}
        tableLayout="fixed"
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <strong style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{item.issue_code}</strong>
              <StatusBadge status={item.status} />
            </Space>
            <div>{item.summary}</div>
            <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>
              {[item.detailed_classification, item.system].filter(Boolean).join(' · ')}
            </div>
          </Space>
        )}
      />

      <IssueDetail
        open={detailOpen}
        issueId={detailId}
        onClose={() => setDetailOpen(false)}
        onSynced={() => { tableRef.current?.reload(); loadOptions(); }}
      />
    </Card>
  );
}

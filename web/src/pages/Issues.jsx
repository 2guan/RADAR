/**
 * 文件：pages/Issues.jsx
 * 用途：问题管理页面（只读）。展示从外部 PAMS 系统同步的问题清单，点击查看问题详情；
 *       提供「同步问题」（拉取概述列表）与「同步问题详情」（后台逐条慢速更新明细）两个同步按钮。
 *       后台同步通过轮询 /issues/sync-detail-status 实时展示进度和最后完成时间。
 * 作者：hengguan
 * 说明：列表显示 问题编号/工单编号/状态/详细分类/所属系统/问题概述；无新增/编辑能力。
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Card, Button, Space, message, Modal } from 'antd';
import { SyncOutlined, CloudSyncOutlined, LoadingOutlined, CheckCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import Can from '../components/Can.jsx';
import IssueDetail from '../components/editors/IssueDetail.jsx';
import { apiDelete, apiGet, apiPost } from '../api/client.js';

export default function Issues() {
  const tableRef = useRef();
  const [detailId, setDetailId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [clearing, setClearing] = useState(false);
  // 后台同步详情状态（轮询自服务端）
  const [bgStatus, setBgStatus] = useState(null); // { running, total, done, failed, lastFinishTime }
  const pollTimerRef = useRef(null);

  // 下拉选项：状态、详细分类、系统
  const [statuses, setStatuses] = useState([]);
  const [classifications, setClassifications] = useState([]);
  const [systems, setSystems] = useState([]);
  const [systemNameMap, setSystemNameMap] = useState({});

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

  // 轮询后台同步状态
  const pollStatus = useCallback(async () => {
    try {
      const s = await apiGet('/issues/sync-detail-status');
      setBgStatus(s);
      if (s?.running) {
        pollTimerRef.current = setTimeout(pollStatus, 2000);
      } else {
        // 同步刚完成时刷新列表
        if (bgStatus?.running) { tableRef.current?.reload(); loadOptions(); }
      }
    } catch { /* 网络异常时静默，等下次触发 */ }
  }, [bgStatus?.running]);

  useEffect(() => {
    loadOptions();
    apiGet('/systems/all').then((list) => {
      setSystemNameMap(Object.fromEntries((list || []).map((s) => [s.sys_code, s.sys_name])));
    }).catch(() => {});
    // 页面加载时拉取一次状态（恢复页面时同步可能仍在进行）
    apiGet('/issues/sync-detail-status').then((s) => {
      setBgStatus(s);
      if (s?.running) { pollTimerRef.current = setTimeout(pollStatus, 2000); }
    }).catch(() => {});
    return () => clearTimeout(pollTimerRef.current);
  }, []);

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

  // 启动后台同步问题详情
  const onSyncDetail = () => {
    if (bgStatus?.running) { message.warning('后台同步正在进行中，请等待完成'); return; }
    Modal.confirm({
      title: '后台同步问题详情',
      content: '系统将在后台每秒同步一条问题明细，期间可正常使用页面。确认开始？',
      okText: '开始同步',
      cancelText: '取消',
      onOk: async () => {
        try {
          await apiPost('/issues/sync-detail-bg', {});
          message.success('后台同步已启动');
          // 开始轮询
          clearTimeout(pollTimerRef.current);
          pollTimerRef.current = setTimeout(pollStatus, 1000);
        } catch (e) {
          message.error(e.message || '启动失败');
        }
      },
    });
  };

  const onClearIssues = () => {
    if (bgStatus?.running) { message.warning('后台同步正在进行中，请等待完成后再清空'); return; }
    Modal.confirm({
      title: '清空全部问题数据',
      content: '该操作将删除问题管理表中的全部问题记录，且不可撤销。确认清空？',
      okText: '确认清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setClearing(true);
        try {
          const r = await apiDelete('/issues');
          message.success(`已清空问题数据${Number.isFinite(r?.deleted) ? `：${r.deleted} 条` : ''}`);
          setDetailOpen(false);
          setDetailId(null);
          setBgStatus(null);
          tableRef.current?.reload();
          loadOptions();
        } finally {
          setClearing(false);
        }
      },
    });
  };

  const columns = [
    {
      title: '问题编号', dataIndex: 'issue_code', key: 'issue_code', sorter: true, align: 'center',
      width: 170,
      render: (val, row) => (
        <div style={{ lineHeight: '20px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', fontWeight: 500 }}>
            {val}
          </div>
          {row.work_order_no && (
            <div
              title={row.work_order_no}
              style={{ color: 'var(--radar-text-secondary)', fontSize: 12, fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {row.work_order_no}
            </div>
          )}
        </div>
      ),
    },
    { title: '状态', dataIndex: 'status', key: 'status', align: 'center', width: 100, render: (s) => <StatusBadge status={s} /> },
    { title: '详细分类', dataIndex: 'detailed_classification', key: 'detailed_classification', width: 140, ellipsis: true },
    {
      title: '所属系统', dataIndex: 'system', key: 'system', width: 200, ellipsis: true,
      render: (v) => systemNameMap[v] || v || '—',
    },
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

  // 后台同步进度文字
  const bgStatusText = (() => {
    if (!bgStatus || (!bgStatus.running && !bgStatus.lastFinishTime && !bgStatus.total)) return null;
    if (bgStatus.running) {
      const pct = bgStatus.total ? Math.round((bgStatus.done / bgStatus.total) * 100) : 0;
      return (
        <span style={{ fontSize: 12, color: 'var(--radar-text-secondary)', whiteSpace: 'nowrap' }}>
          <LoadingOutlined style={{ marginRight: 4, color: 'var(--radar-primary)' }} />
          同步中 {bgStatus.done}/{bgStatus.total}
          {bgStatus.failed > 0 && <span style={{ color: '#cf1322', marginLeft: 4 }}>失败 {bgStatus.failed}</span>}
          <span style={{ marginLeft: 4, color: 'var(--radar-text-secondary)' }}>（{pct}%）</span>
        </span>
      );
    }
    return (
      <span style={{ fontSize: 12, color: 'var(--radar-text-secondary)', whiteSpace: 'nowrap' }}>
        <CheckCircleOutlined style={{ marginRight: 4, color: '#52c41a' }} />
        已完成 {bgStatus.done}/{bgStatus.total}
        {bgStatus.failed > 0 && <span style={{ color: '#cf1322', marginLeft: 4 }}>失败 {bgStatus.failed}</span>}
        {bgStatus.lastFinishTime && <span style={{ marginLeft: 6 }}>最后同步：{bgStatus.lastFinishTime}</span>}
      </span>
    );
  })();

  return (
    <Card
      title={
        <Space size={12} wrap>
          <span>问题管理</span>
          <Can module="issue" action="sync">
            <Button type="primary" icon={<SyncOutlined />} loading={syncing} onClick={onSync}>同步问题</Button>
          </Can>
          <Can module="issue" action="sync">
            <Button icon={<CloudSyncOutlined />} disabled={bgStatus?.running} onClick={onSyncDetail}>同步问题详情</Button>
          </Can>
          <Can module="issue" action="delete">
            <Button danger icon={<DeleteOutlined />} loading={clearing} disabled={bgStatus?.running} onClick={onClearIssues}>清空</Button>
          </Can>
          {bgStatusText}
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
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{item.issue_code}</strong>
                {item.work_order_no && (
                  <span style={{ display: 'block', color: 'var(--radar-text-secondary)', fontSize: 12, fontFamily: 'SFMono-Regular, Consolas, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.work_order_no}
                  </span>
                )}
              </div>
              <StatusBadge status={item.status} />
            </Space>
            <div>{item.summary}</div>
            <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>
              {[item.detailed_classification, systemNameMap[item.system] || item.system].filter(Boolean).join(' · ')}
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

/**
 * 文件：web/src/modules/release/pages/ReleasePage.jsx
 * 说明：审批对象来源于投产申请的 ref_codes（需求、工单或问题）；不再列出全部投产点需求，也不再有「UAT 终态发起评审」逻辑。
 * 用途：投产审批页面。逐条展示「投产申请」中所选择的需求/工单/问题，含投产状态、评审状态、申请投产点、
 *       需求/问题/工单编号、需求标题/工单标题/问题概述、会签进度。点击行打开投产审批详情（复用 ReleaseDetail）。
 * 作者：hengguan
 */

import { useRef, useState, useEffect } from 'react';
import { Card, Button, Space, Tag } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { DataTable, FilterPanel } from '../../../shared/ui/index.js';
import { StatusBadge, TaskStatusBadge } from '../../../shared/workflow/index.js';
import ReleaseDetail from '../components/ReleaseDetail.jsx';
import Can from '../../../platform/auth/Can.jsx';
import { apiPost, apiGet } from '../api/index.js';
import { useAppStore } from '../../../platform/state/app.js';
import { exportXlsx } from '../../../platform/import-export/io.js';
import { ReleasePointText } from '../../settings/reference-data/index.js';
import { useStageListFields } from '../../settings/process-configuration/index.js';

export default function Release() {
  const stageList = useStageListFields('release');
  const tableRef = useRef();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [detailTarget, setDetailTarget] = useState(null);
  const [filterQuery, setFilterQuery] = useState([]);

  const [statuses, setStatuses] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [orgs, setOrgs] = useState([]);

  // 仅取投产阶段的状态，避免需求、工单状态混入投产审批筛选项。
  useEffect(() => {
    apiGet('/dict/by-category/process_status').then((res) => {
      const releaseStatuses = (res || []).filter((item) => item.extra?.stage === '投产');
      setStatuses([{ attr_value: '未发起', display_value: '未发起' }, ...releaseStatuses]);
    }).catch(() => {});
    apiGet('/dict/by-category/review_status').then(setReviews).catch(() => {});
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
  }, []);

  const statusOptions = statuses.map((s) => ({ value: s.attr_value, label: s.display_value }));
  const reviewOptions = reviews.map((s) => ({ value: s.attr_value, label: s.display_value }));
  const orgOptions = orgs.map((o) => ({ value: o.attr_value, label: o.display_value }));

  const filterConfigs = [
    { field: 'impl_org', label: '实施机构', type: 'select', isPrimary: true, op: 'in', options: orgOptions },
    { field: 'change_code', label: '变更编号', type: 'input', isPrimary: true, op: 'like', placeholder: '变更编号检索' },
    { field: 'code', label: '需求/问题/工单编号', type: 'input', isPrimary: true, op: 'like', placeholder: '需求/问题/工单编号检索' },
    { field: 'content', label: '标题/概述', type: 'input', isPrimary: true, op: 'like', placeholder: '需求标题、工单标题或问题概述检索' },
    { field: 'status', label: '投产状态', type: 'select', op: 'in', options: statusOptions },
    { field: 'review_status', label: '评审状态', type: 'select', op: 'in', options: reviewOptions },
  ].filter((config) => stageList.isFilterable(config.field));

  // 将筛选控件的原始值统一转换为后端列表接口使用的 filters 契约。
  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find((c) => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '' && !(Array.isArray(item.value) && item.value.length === 0));
    setFilterQuery(arr);
  };

  // 投产窗口和页面筛选条件必须一并提交，确保审批范围与当前工作区一致。
  const fetcher = (q) => apiPost('/release/list', { ...q, releasePointIds, filters: filterQuery });

  const monoStyle = { fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace' };

  // 会签进度由服务端聚合，列表仅负责保持审批状态和业务对象的可读呈现。
  const columns = [
    {
      title: '任务状态', dataIndex: 'task_status_short', key: 'task_status', sortKey: 'task_status', align: 'center', width: 120,
      render: (_, row) => <TaskStatusBadge shortStatus={row.task_status_short} status={row.task_status_value} fullStatus={row.task_status} />,
    },
    { title: '投产状态', dataIndex: 'release_status', key: 'release_status', sortKey: 'release_status', align: 'center', width: 96, render: (s) => <StatusBadge status={s} /> },
    {
      title: '评审状态', dataIndex: 'review_status', key: 'review_status', sortKey: 'review_status', align: 'center', width: 96,
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
      title: '会签进度', key: 'signoff', sortKey: 'signoff', width: 130,
      render: (_, r) => (r.signoff.total ? (
        <Space size={4}>
          <Tag className={`status-tag ${r.signoff.signed === 0 ? 'status-tag-initial' : (r.signoff.signed >= r.signoff.total ? 'status-tag-final' : 'status-tag-in-progress')}`} style={{ margin: 0 }}>签 {r.signoff.signed}</Tag>
          {r.signoff.rejected > 0 && <Tag className="status-tag status-tag-error" style={{ margin: 0 }}>驳 {r.signoff.rejected}</Tag>}
          <span>/ {r.signoff.total}</span>
        </Space>
      ) : '—'),
    },
    {
      title: '申请投产点', dataIndex: 'release_date', key: 'release_date', sortKey: 'release_date', width: 120,
      render: (val) => <ReleasePointText value={val} />,
    },
    {
      title: '实施机构', dataIndex: 'impl_org', key: 'impl_org', sortKey: 'impl_org', width: 110, ellipsis: true,
      render: (v, row) => row.impl_org_display || v || '—',
    },
    {
      title: '变更编号',
      dataIndex: 'change_codes',
      key: 'change_codes',
      sortKey: 'change_codes',
      width: 170,
      render: (codes) => {
        const list = Array.isArray(codes) ? codes : [];
        if (!list.length) return '—';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {list.map((code) => (
              <span key={code} style={{ ...monoStyle, color: 'var(--radar-primary)', lineHeight: '16px' }}>{code}</span>
            ))}
          </div>
        );
      },
    },
    {
      title: <span style={{ display: 'block', textAlign: 'center' }}>需求/工单编号</span>, dataIndex: 'code', key: 'code', width: 220, align: 'left',
      render: (val, r) => (
        <Space size={6}>
          <Tag className="status-tag tag-system" style={{ margin: 0, borderRadius: 2 }}>{r.entity_type === 'issue' ? '问题' : (r.entity_type === 'ticket' ? '工单' : (r.entity_type === 'requirement' ? '需求' : '其他'))}</Tag>
          <span style={{ ...monoStyle, fontWeight: 500 }}>{val}</span>
        </Space>
      ),
    },
    {
      title: '需求标题/工单标题/问题概述', dataIndex: 'title', key: 'title',
      width: 360,
      render: (v) => (
        <div
          title={v || ''}
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '18px', maxHeight: 36 }}
        >
          {v || '—'}
        </div>
      ),
    },
    // 审批列表没有行级编辑动作，但保留固定操作列承载统一的列设置入口。
    { title: '操作', key: 'op', width: 80, fixed: 'right', render: () => null },
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
        ref={tableRef} columns={columns} fetcher={fetcher} baseQuery={{ releasePointIds, filters: filterQuery }} rowKey={(r) => `${r.code}_${r.release_point_id ?? 'none'}`}
        listPreferenceKey="release.approval"
        defaultColumnKeys={['task_status', 'release_status', 'review_status', 'signoff', 'release_date', 'impl_org', 'change_codes', 'code', 'title']}
        showSearch={false}
        tableScroll={{ x: 1300 }}
        onRowClick={(r) => setDetailTarget({ code: r.code, releasePointId: r.release_point_id })}
        mobileCard={(r) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <strong>{r.code}</strong>
              <Space size={4} wrap><StatusBadge status={r.release_status} />{r.review_status ? <StatusBadge status={r.review_status} /> : <span>—</span>}</Space>
            </Space>
            <div style={{ fontSize: 12, color: 'var(--radar-text-secondary)' }}>申请投产点：<ReleasePointText value={r.release_date} /></div>
            <div>{r.title}</div>
            <div style={{ fontSize: 12, color: 'var(--radar-text-secondary)' }}>实施机构：{r.impl_org_display || r.impl_org || '—'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--radar-text-secondary)' }}>
              <span>主责系统：</span>
              {(r.main_systems_names || []).map((name) => <Tag key={name} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{name}</Tag>)}
              {!r.main_systems_names?.length && <span>—</span>}
            </div>
          </Space>
        )}
      />

      <ReleaseDetail
        open={!!detailTarget}
        code={detailTarget?.code}
        releasePointId={detailTarget?.releasePointId}
        onClose={() => setDetailTarget(null)}
        onChanged={() => tableRef.current?.reload()}
      />
    </Card>
  );
}

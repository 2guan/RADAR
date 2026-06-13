/**
 * 文件：pages/Release.jsx
 * 用途：投产管理页面。需求投产列表（投产/会签进度）+ 发起投产评审 + 投产详情（复用 ReleaseDetail）。
 * 作者：hengguan
 * 说明：投产清单展示与配置页面，可查询不同投产点所包含的需求和各个节点的签字确认状态。
 */

import React, { useRef, useState, useEffect } from 'react';
import { Card, Button, Space, Tag, message } from 'antd';
import { RocketOutlined, ExportOutlined } from '@ant-design/icons';
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
  const [detailReq, setDetailReq] = useState(null);

  const [filterQuery, setFilterQuery] = useState([]);
  
  // 各种下拉选择面板的数据源缓存状态
  const [points, setPoints] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [systems, setSystems] = useState([]);

  // 初始化拉取数据，并筛选流程状态为“投产”相关的状态，同时硬编码“未发起”作为基线状态选项
  useEffect(() => {
    apiGet('/release-points/all').then(setPoints).catch(() => {});
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
    apiGet('/dict/by-category/process_status').then(res => {
      const filtered = (res || []).filter(item => item.extra?.stage === '投产');
      setStatuses([{ attr_value: '未发起', display_value: '未发起' }, ...filtered]);
    }).catch(() => {});
    apiGet('/users/active').then(setUsers).catch(() => {});
    apiGet('/systems/all').then(setSystems).catch(() => {});
  }, []);

  // 整理数据项为 Select 组件需要的 options 格式
  const pointOptions = points.map(p => ({ value: p.id, label: p.release_date }));
  const orgOptions = orgs.map(o => ({ value: o.attr_value, label: o.display_value }));
  const statusOptions = statuses.map(s => ({ value: s.attr_value, label: s.display_value }));
  const userOptions = users.map(u => ({ value: u.name, label: `${u.name} (${u.phone})` }));
  const systemOptions = systems.map(s => ({ value: s.sys_code, label: `${s.sys_code} - ${s.sys_name}` }));

  // 查询条件配置，指定关键字匹配模式（模糊匹配 like 或 包含/等于 eq/in）
  const filterConfigs = [
    { field: 'req_code', label: '需求编号', type: 'input', isPrimary: true, op: 'like', placeholder: '需求编号检索' },
    { field: 'content', label: '需求标题/概述', type: 'input', isPrimary: true, op: 'like', placeholder: '需求标题或概述检索' },
    { field: 'release_point_id', label: '计划投产点', type: 'select', op: 'in', options: pointOptions },
    { field: 'org', label: '实施机构', type: 'select', op: 'in', options: orgOptions },
    { field: 'status', label: '投产状态', type: 'select', op: 'in', options: statusOptions },
    { field: 'owners', label: '投产负责人', type: 'select', op: 'in', options: userOptions },
    { field: 'systems', label: '涉及系统', type: 'select', op: 'in', options: systemOptions },
  ];

  /**
   * 监听过滤器变化并转换为 SQL 标准条件参数数组，剔除空值
   */
  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find(c => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '');
    setFilterQuery(arr);
  };

  // 绑定全局选择的“当前投产点”和下方过滤器，执行后端分页检索
  const fetcher = (q) => apiPost('/release/list', { ...q, releasePointIds, filters: filterQuery });

  /**
   * 发起投产评审
   * 在后端生成投产审批记录与会签项，成功后置为已发起并打开详情抽屉
   */
  const init = async (reqCode) => {
    try {
      await apiPost(`/release/${reqCode}/init`);
      message.success('已发起投产评审');
      tableRef.current?.reload();
      setDetailReq(reqCode);
    } catch { /* 异常由全局拦截器统一报错 */ }
  };

  const columns = [
    { title: '投产状态', dataIndex: 'release_status', key: 'release_status', align: 'center', render: (s) => <StatusBadge status={s} /> },
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
      title: '需求编号',
      dataIndex: 'req_code',
      key: 'req_code',
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', fontWeight: 500 }}>
          {val}
        </span>
      ),
    },
    { title: '需求标题', dataIndex: 'title', key: 'title', ellipsis: true },
    {
      title: '会签进度', key: 'signoff',
      render: (_, r) => (r.signoff.total ? (
        <Space size={4}>
          <Tag className="status-tag status-tag-final" style={{ margin: 0 }}>签 {r.signoff.signed}</Tag>
          {r.signoff.rejected > 0 && <Tag className="status-tag status-tag-error" style={{ margin: 0 }}>驳 {r.signoff.rejected}</Tag>}
          <span>/ {r.signoff.total}</span>
        </Space>
      ) : '—'),
    },
    { title: 'UAT', key: 'uat', render: (_, r) => (r.uat_ready ? <Tag className="status-tag status-tag-final" style={{ margin: 0 }}>已就绪</Tag> : <Tag className="status-tag status-tag-not-started" style={{ margin: 0 }}>未就绪</Tag>) },
    {
      title: '操作', key: 'op', width: 100, fixed: 'right',
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
      <FilterPanel
        configs={filterConfigs}
        onChange={handleFilterChange}
        actions={[
          <Can key="exp" module="release" action="export">
            <Button icon={<ExportOutlined />} onClick={() => exportXlsx('/release/export', { releasePointIds, filters: filterQuery }, '投产管理清单.xlsx')} style={{ width: 88 }}>导出</Button>
          </Can>
        ]}
      />
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher} baseQuery={{ releasePointIds, filters: filterQuery }} rowKey="req_code"
        showSearch={false}
        onRowClick={(r) => r.initiated && setDetailReq(r.req_code)}
        mobileCard={(r) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{r.req_code}</strong><StatusBadge status={r.release_status} /></Space>
            <div>{r.title}</div>
            {r.release_date && (
              <div style={{ fontSize: '11px', color: 'var(--radar-text-secondary)' }}>
                计划投产点：{r.release_date}
              </div>
            )}
            {r.initiated ? <Button size="small" onClick={() => setDetailReq(r.req_code)}>查看详情</Button>
              : <Can module="release" action="release.register"><Button size="small" type="primary" disabled={!r.uat_ready} onClick={() => init(r.req_code)}>发起投产</Button></Can>}
          </Space>
        )}
      />

      <ReleaseDetail open={!!detailReq} reqCode={detailReq} onClose={() => setDetailReq(null)} onChanged={() => tableRef.current?.reload()} />
    </Card>
  );
}

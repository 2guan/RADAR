/**
 * 文件：pages/Requirements.jsx
 * 用途：需求分析页面。需求列表（默认按当前投产窗口过滤）+ 新增/编辑（复用 RequirementEditor）
 *       + 历史记录 + 导入导出/模板。
 * 作者：hengguan
 * 说明：需求列表管理页面，支持新建、批量导入、状态筛选、模糊搜索和投产点关联，提供入口至需求编辑器。
 */

import React, { useRef, useState, useEffect } from 'react';
import { Card, Button, Space, Tag, Popconfirm, message, Upload, Dropdown, Tooltip } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined, DownloadOutlined, DownOutlined,
} from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import HistoryDrawer from '../components/HistoryDrawer.jsx';
import RequirementEditor from '../components/editors/RequirementEditor.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import Can from '../components/Can.jsx';
import { apiPost, apiDelete, apiGet } from '../api/client.js';
import { exportXlsx, downloadGet } from '../utils/io.js';
import { useAppStore } from '../stores/app.js';
import ImportModal from '../components/ImportModal.jsx';

export default function Requirements() {
  const tableRef = useRef();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const [filterQuery, setFilterQuery] = useState([]);
  
  // 下拉列表选项数据源
  const [points, setPoints] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [reqDepts, setReqDepts] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [types, setTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [systems, setSystems] = useState([]);

  useEffect(() => {
    apiGet('/release-points/all').then(setPoints).catch(() => {});
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
    apiGet('/dict/by-category/req_dept').then(setReqDepts).catch(() => {});
    apiGet('/dict/by-category/process_status').then(res => {
      const filtered = (res || []).filter(item => item.extra?.stage === '需求');
      setStatuses(filtered);
    }).catch(() => {});
    apiGet('/dict/by-category/req_type').then(setTypes).catch(() => {});
    apiGet('/users/active').then(setUsers).catch(() => {});
    apiGet('/systems/all').then(setSystems).catch(() => {});
  }, []);

  const pointOptions = points.map(p => ({ value: p.id, label: p.release_date }));
  const orgOptions = orgs.map(o => ({ value: o.attr_value, label: o.display_value }));
  const reqDeptOptions = reqDepts.map(d => ({ value: d.attr_value, label: d.display_value }));
  const statusOptions = statuses.map(s => ({ value: s.attr_value, label: s.display_value }));
  const typeOptions = types.map(t => ({ value: t.attr_value, label: t.display_value }));
  const userOptions = users.map(u => ({ value: u.name, label: `${u.name} (${u.phone})` }));
  const systemOptions = systems.map(s => ({ value: s.sys_code, label: `${s.sys_code} - ${s.sys_name}` }));

  const filterConfigs = [
    { field: 'org', label: '实施机构', type: 'select', op: 'in', options: orgOptions, isPrimary: true },
    { field: 'req_code', label: '需求编号', type: 'input', isPrimary: true, op: 'like', placeholder: '需求编号检索' },
    { field: 'content', label: '需求内容', type: 'input', isPrimary: true, op: 'like', placeholder: '需求标题或概述检索' },
    { field: 'issue_no', label: '关联问题/工单', type: 'input', op: 'like', placeholder: '问题/工单编号检索' },
    { field: 'release_point_id', label: '计划投产点', type: 'select', op: 'in', options: pointOptions },
    { field: 'status', label: '需求状态', type: 'select', op: 'in', options: statusOptions },
    { field: 'req_type', label: '需求类型', type: 'select', op: 'in', options: typeOptions },
    { field: 'propose_dept', label: '提出部门', type: 'select', op: 'in', options: reqDeptOptions },
    { field: 'proposer', label: '提出人', type: 'select', op: 'in', options: userOptions },
    { field: 'owners', label: '负责人', type: 'select', op: 'in', options: userOptions },
    { field: 'main_systems', label: '主责系统', type: 'select', op: 'in', options: systemOptions },
    { field: 'collab_systems', label: '协同系统', type: 'select', op: 'in', options: systemOptions },
  ];

  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find(c => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '' && !(Array.isArray(item.value) && item.value.length === 0));
    setFilterQuery(arr);
  };

  const fetcher = (q) => apiPost('/requirements/list', q);

  const openEdit = (row) => { setEditId(row?.id || null); setEditOpen(true); };
  const openCreate = () => { setEditId(null); setEditOpen(true); };
  const onDelete = async (row) => { await apiDelete(`/requirements/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };



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
      title: '需求编号',
      dataIndex: 'req_code',
      key: 'req_code',
      sorter: true,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', fontWeight: 500 }}>
          {val}
        </span>
      ),
    },
    { title: '需求标题', dataIndex: 'title', key: 'title', ellipsis: true },
    { title: '需求类型', dataIndex: 'req_type', key: 'req_type' },
    {
      title: '提出人',
      dataIndex: 'proposer',
      key: 'proposer',
      render: (val) => (Array.isArray(val) ? val.join(', ') : (val || '—')),
    },
    {
      title: '提出时间',
      dataIndex: 'propose_time',
      key: 'propose_time',
      sorter: true,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace' }}>
          {val || '—'}
        </span>
      ),
    },
    {
      title: '主责系统',
      dataIndex: 'main_systems_names',
      key: 'main_systems_names',
      render: (arr) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          {(arr || []).map((name) => (
            <Tag key={name} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{name}</Tag>
          ))}
        </div>
      ),
    },
    {
      title: '协同改造系统',
      dataIndex: 'collab_dev_systems_names',
      key: 'collab_dev_systems_names',
      render: (arr) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          {(arr || []).map((name) => (
            <Tag key={name} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{name}</Tag>
          ))}
        </div>
      ),
    },
    {
      title: '操作', key: 'op', width: 80, fixed: 'right',
      render: (_, row) => (
        <Space size={0} onClick={(e) => e.stopPropagation()}>
          <Can module="requirement" action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Can>
          <Can module="requirement" action="delete">
            {row.has_tasks ? (
              <Tooltip title="该需求已关联开发/测试任务，无法删除">
                <Button type="link" size="small" danger disabled icon={<DeleteOutlined />} />
              </Tooltip>
            ) : (
              <Popconfirm title="确认删除该需求？" onConfirm={() => onDelete(row)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
            )}
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <Card 
      title={
        <Space size={12}>
          <span>需求分析</span>
          <Can module="requirement" action="create">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              新增需求
            </Button>
          </Can>
        </Space>
      }
      variant="borderless"
    >
      <FilterPanel
        configs={filterConfigs}
        onChange={handleFilterChange}
        actions={[
          <Can key="imp" module="requirement" action="import">
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)} style={{ width: 88 }}>导入</Button>
          </Can>,
          <Can key="exp" module="requirement" action="export">
            <Button icon={<ExportOutlined />} onClick={() => exportXlsx('/requirements/export', { releasePointIds, filters: filterQuery }, '需求清单.xlsx')} style={{ width: 88 }}>导出</Button>
          </Can>,
        ]}
      />
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher} 
        baseQuery={{ releasePointIds, filters: filterQuery }} 
        showSearch={false}
        onRowClick={openEdit}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{item.req_code}</strong><StatusBadge status={item.status} /></Space>
            <div>{item.title}</div>
            {item.release_date && (
              <div style={{ fontSize: '11px', color: 'var(--radar-text-secondary)' }}>
                计划投产点：{item.release_date}
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(item.main_systems_names || []).map((name) => (
                <Tag key={name} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{name}</Tag>
              ))}
              {(item.collab_dev_systems_names || []).map((name) => (
                <Tag key={name} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{name}</Tag>
              ))}
            </div>
          </Space>
        )}
      />

      <ImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={() => tableRef.current?.reload()}
        importUrl="/requirements/import"
        templateUrl="/requirements/template"
        templateFilename="需求导入模板.xlsx"
      />

      <RequirementEditor
        open={editOpen} reqId={editId} defaultReleasePointId={releasePointIds.length === 1 ? releasePointIds[0] : undefined}
        onClose={() => setEditOpen(false)} onSaved={() => tableRef.current?.reload()}
      />
      <HistoryDrawer open={!!historyId} entityType="requirement" entityId={historyId} onClose={() => setHistoryId(null)} />
    </Card>
  );
}

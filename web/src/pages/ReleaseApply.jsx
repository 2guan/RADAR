/**
 * 文件：pages/ReleaseApply.jsx
 * 用途：投产申请页面。投产申请（版本变更申请）列表（默认按当前投产窗口过滤）+ 新增申请 / 编辑
 *       （复用 ReleaseApplyEditor）+ 导入导出/模板。
 * 作者：hengguan
 * 说明：仿照需求分析页面，页面上方提供「新增申请」按钮；评审状态由后端按所关联需求派生。
 */

import React, { useRef, useState, useEffect } from 'react';
import { Card, Button, Space, Tag, Popconfirm, message, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import Can from '../components/Can.jsx';
import ImportModal from '../components/ImportModal.jsx';
import ReleaseApplyEditor from '../components/editors/ReleaseApplyEditor.jsx';
import { apiPost, apiDelete, apiGet } from '../api/client.js';
import { exportXlsx } from '../utils/io.js';
import { useAppStore } from '../stores/app.js';

export default function ReleaseApply() {
  const tableRef = useRef();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState([]);

  const [orgs, setOrgs] = useState([]);
  const [systems, setSystems] = useState([]);
  const [artifactTypes, setArtifactTypes] = useState([]);
  const [ferryStatuses, setFerryStatuses] = useState([]);

  useEffect(() => {
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
    apiGet('/systems/all').then(setSystems).catch(() => {});
    apiGet('/dict/by-category/artifact_type').then(setArtifactTypes).catch(() => {});
    apiGet('/dict/by-category/ferry_status').then(setFerryStatuses).catch(() => {});
  }, []);

  const orgOptions = orgs.map((o) => ({ value: o.attr_value, label: o.display_value }));
  const systemOptions = systems.map((s) => ({ value: s.sys_code, label: `${s.sys_code} - ${s.sys_name}` }));
  const artifactOptions = artifactTypes.map((d) => ({ value: d.attr_value, label: d.display_value }));
  const ferryOptions = ferryStatuses.map((d) => ({ value: d.attr_value, label: d.display_value }));

  const filterConfigs = [
    { field: 'change_code', label: '变更编号', type: 'input', isPrimary: true, op: 'like', placeholder: '变更编号检索' },
    { field: 'content', label: '变更内容', type: 'input', isPrimary: true, op: 'like', placeholder: '变更内容或影响范围检索' },
    { field: 'change_system', label: '变更系统', type: 'select', op: 'in', options: systemOptions },
    { field: 'impl_org', label: '实施机构', type: 'select', op: 'in', options: orgOptions },
    { field: 'artifact_type', label: '制品类型', type: 'select', op: 'in', options: artifactOptions },
    { field: 'ferry_status', label: '摆渡状态', type: 'select', op: 'in', options: ferryOptions },
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

  const fetcher = (q) => apiPost('/release-apply/list', q);

  const openEdit = (row) => { setEditId(row?.id || null); setEditOpen(true); };
  const openCreate = () => { setEditId(null); setEditOpen(true); };
  const onDelete = async (row) => { await apiDelete(`/release-apply/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  const monoStyle = { fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace' };

  const columns = [
    {
      title: '评审状态', dataIndex: 'review_status', key: 'review_status', width: 88, align: 'center',
      render: (v) => (
        v ? (
          <StatusBadge
            status={v}
            style={{ width: 68, display: 'inline-flex', justifyContent: 'center' }}
          />
        ) : '—'
      ),
    },
    { title: '变更编号', dataIndex: 'change_code', key: 'change_code', width: 120, sorter: true, render: (v) => <span style={{ ...monoStyle, fontWeight: 500 }}>{v}</span> },
    { title: '变更系统', dataIndex: 'change_system_name', key: 'change_system_name', width: 110, ellipsis: true, render: (v) => v || '—' },
    {
      title: '变更内容', dataIndex: 'change_content', key: 'change_content', width: 260,
      render: (v) => (
        <div
          title={v || ''}
          style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: '18px', maxHeight: 54 }}
        >
          {v || '—'}
        </div>
      ),
    },
    {
      title: '交付制品', key: 'delivery_units', width: 150,
      render: (_, row) => {
        const units = Array.isArray(row.delivery_units) ? row.delivery_units : [];
        if (!units.length) return '—';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {units.map((u, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {u.artifact_type && (
                  <Tag className="status-tag tag-system" style={{ margin: 0, borderRadius: 2, width: 80, display: 'inline-flex', justifyContent: 'center' }}>
                    {u.artifact_type}
                  </Tag>
                )}
                {u.ferry_status && (
                  <StatusBadge
                    status={u.ferry_status}
                    style={{ width: 68, display: 'inline-flex', justifyContent: 'center' }}
                  />
                )}
              </div>
            ))}
          </div>
        );
      },
    },
    { title: '实施机构', dataIndex: 'impl_org', key: 'impl_org', width: 100, ellipsis: true, render: (v) => v || '—' },
    {
      title: '操作', key: 'op', width: 80,
      render: (_, row) => (
        <Space size={0} onClick={(e) => e.stopPropagation()}>
          <Can module="release_apply" action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Can>
          <Can module="release_apply" action="delete">
            <Popconfirm title="确认删除该投产申请？" onConfirm={() => onDelete(row)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Can>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space size={12}>
          <span>投产申请</span>
          <Can module="release_apply" action="create">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增申请</Button>
          </Can>
        </Space>
      }
      variant="borderless"
    >
      <FilterPanel
        configs={filterConfigs}
        onChange={handleFilterChange}
        actions={[
          <Can key="imp" module="release_apply" action="import">
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)} style={{ width: 88 }}>导入</Button>
          </Can>,
          <Can key="exp" module="release_apply" action="export">
            <Button icon={<ExportOutlined />} onClick={() => exportXlsx('/release-apply/export', { releasePointIds, filters: filterQuery }, '投产申请清单.xlsx')} style={{ width: 88 }}>导出</Button>
          </Can>,
        ]}
      />
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher}
        baseQuery={{ releasePointIds, filters: filterQuery }}
        showSearch={false}
        tableLayout="fixed"
        tableScroll={{ x: false }}
        onRowClick={openEdit}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <strong>{item.change_code}</strong>
              <Space size={4}>
                {item.review_status && <StatusBadge status={item.review_status} />}
                {(item.delivery_units || []).map((u, i) => u.ferry_status && <StatusBadge key={i} status={u.ferry_status} />)}
              </Space>
            </Space>
            <div>{item.change_content}</div>
            {item.change_system_name && (
              <div style={{ fontSize: '11px', color: 'var(--radar-text-secondary)' }}>变更系统：{item.change_system_name}</div>
            )}
          </Space>
        )}
      />

      <ImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={() => tableRef.current?.reload()}
        importUrl="/release-apply/import"
        templateUrl="/release-apply/template"
        templateFilename="投产申请导入模板.xlsx"
      />

      <ReleaseApplyEditor
        open={editOpen} applyId={editId}
        defaultReleasePointId={releasePointIds.length === 1 ? releasePointIds[0] : undefined}
        onClose={() => setEditOpen(false)} onSaved={() => tableRef.current?.reload()}
      />
    </Card>
  );
}

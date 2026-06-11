/**
 * 文件：pages/Requirements.jsx
 * 用途：需求分析页面。需求列表（默认按当前投产窗口过滤）+ 新增/编辑（复用 RequirementEditor）
 *       + 历史记录 + 导入导出/模板。
 * 作者：hengguan
 */

import React, { useRef, useState } from 'react';
import { Card, Button, Space, Tag, Popconfirm, message, Upload, Dropdown, Tooltip } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, HistoryOutlined, ImportOutlined, ExportOutlined, DownloadOutlined, DownOutlined,
} from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import HistoryDrawer from '../components/HistoryDrawer.jsx';
import RequirementEditor from '../components/editors/RequirementEditor.jsx';
import Can from '../components/Can.jsx';
import { apiPost, apiDelete } from '../api/client.js';
import { exportXlsx, importXlsx, downloadGet } from '../utils/io.js';
import { useAppStore } from '../stores/app.js';

export default function Requirements() {
  const tableRef = useRef();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [historyId, setHistoryId] = useState(null);

  const fetcher = (q) => apiPost('/requirements/list', { ...q, releasePointIds });

  const openEdit = (row) => { setEditId(row?.id || null); setEditOpen(true); };
  const openCreate = () => { setEditId(null); setEditOpen(true); };
  const onDelete = async (row) => { await apiDelete(`/requirements/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  const doImport = (file, mode) => {
    importXlsx('/requirements/import', file, mode)
      .then((r) => { message.success(`导入完成：新增${r.inserted} 更新${r.updated} 跳过${r.skipped}`); tableRef.current?.reload(); })
      .catch(() => {});
    return false;
  };

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
    { title: '提出人', dataIndex: 'proposer', key: 'proposer' },
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
      title: '操作', key: 'op', width: 100, fixed: 'right',
      render: (_, row) => (
        <Space size={0} onClick={(e) => e.stopPropagation()}>
          <Can module="requirement" action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Can>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => setHistoryId(row.id)} />
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
    <Card title="需求分析" variant="borderless">
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher} baseQuery={{ releasePointIds }} onRowClick={openEdit}
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
        toolbar={[
          <Can key="add" module="requirement" action="create"><Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增需求</Button></Can>,
          <Can key="tpl" module="requirement" action="import"><Button icon={<DownloadOutlined />} onClick={() => downloadGet('/requirements/template', {}, '需求模板.xlsx')}>模板</Button></Can>,
          <Can key="imp" module="requirement" action="import">
            <Dropdown menu={{ items: [{ key: 'skip', label: '重复跳过' }, { key: 'overwrite', label: '覆盖更新' }, { key: 'rollback', label: '出错回滚' }], onClick: ({ key }) => document.getElementById('req-import-' + key)?.click() }}>
              <Button icon={<ImportOutlined />}>导入 <DownOutlined /></Button>
            </Dropdown>
          </Can>,
          <Can key="exp" module="requirement" action="export"><Button icon={<ExportOutlined />} onClick={() => exportXlsx('/requirements/export', { releasePointIds }, '需求清单.xlsx')}>导出</Button></Can>,
        ]}
      />

      {['skip', 'overwrite', 'rollback'].map((m) => (
        <Upload key={m} showUploadList={false} beforeUpload={(f) => doImport(f, m)} accept=".xlsx,.csv">
          <span id={'req-import-' + m} />
        </Upload>
      ))}

      <RequirementEditor
        open={editOpen} reqId={editId} defaultReleasePointId={releasePointIds.length === 1 ? releasePointIds[0] : undefined}
        onClose={() => setEditOpen(false)} onSaved={() => tableRef.current?.reload()}
      />
      <HistoryDrawer open={!!historyId} entityType="requirement" entityId={historyId} onClose={() => setHistoryId(null)} />
    </Card>
  );
}

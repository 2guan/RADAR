/**
 * 文件：web/src/modules/development/pages/DevTasksPage.jsx
 * 说明：开发任务列表与进度跟踪页面，记录开发责任人、开发状态、设计/编码/联调完成情况。
 * 用途：开发管理页面。开发任务列表 + 开发承接（按系统拆分）+ 编辑（复用 TaskEditor）+ 历史。
 * 作者：hengguan
 */

import { useRef, useState, useEffect } from 'react';
import { Card, Button, Space, Tag, Popconfirm, message } from 'antd';
import { ToolOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons';
import { DataTable, FilterPanel } from '../../../shared/ui/index.js';
import { StatusBadge, TaskEditor, TaskStatusBadge } from '../../../shared/workflow/index.js';
import { HistoryDrawer } from '../../../platform/audit/index.js';
import Can from '../../../platform/auth/Can.jsx';
import { apiPost, apiDelete, apiGet } from '../api/index.js';
import { useAppStore } from '../../../platform/state/app.js';
import { exportXlsx } from '../../../platform/import-export/io.js';
import { ImportModal } from '../../../platform/import-export/index.js';
import { useStageListFields } from '../../settings/process-configuration/index.js';
import DevIntakeModal from '../components/DevIntakeModal.jsx';

export default function DevTasks() {
  const stageList = useStageListFields('dev');
  const tableRef = useRef();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [editId, setEditId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [filterQuery, setFilterQuery] = useState([]);
  
  // 下拉列表选项数据源的缓存状态
  const [orgs, setOrgs] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [systems, setSystems] = useState([]);

  // 初始化拉取：投产点列表、机构、以“开发”为阶段的流程状态、活跃用户、所有系统，用于筛选和表单
  useEffect(() => {
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
    apiGet('/dict/by-category/process_status').then(res => {
      const filtered = (res || []).filter(item => item.extra?.stage === '开发');
      setStatuses(filtered);
    }).catch(() => {});
    apiGet('/users/active').then(setUsers).catch(() => {});
    apiGet('/systems/all').then(setSystems).catch(() => {});
  }, []);

  // 映射选择项为标准的 value/label 结构
  const orgOptions = orgs.map(o => ({ value: o.attr_value, label: o.display_value }));
  const statusOptions = statuses.map(s => ({ value: s.attr_value, label: s.display_value }));
  const userOptions = users.map(u => ({ value: u.name, label: `${u.name} (${u.phone})` }));
  const systemOptions = systems.map(s => ({ value: s.sys_code, label: `${s.sys_code} - ${s.sys_name}` }));

  const filterConfigs = [
    { field: 'org', label: '实施机构', type: 'select', op: 'in', options: orgOptions, isPrimary: true },
    { field: 'task_code', label: '开发任务编号', type: 'input', isPrimary: true, op: 'like', placeholder: '开发任务编号检索' },
    { field: 'content', label: '开发内容', type: 'input', isPrimary: true, op: 'like', placeholder: '开发任务名称或内容检索' },
    { field: 'status', label: '开发状态', type: 'select', op: 'in', options: statusOptions },
    { field: 'owner', label: '开发负责人', type: 'select', op: 'in', options: userOptions },
    { field: 'intake_owner', label: '开发承接人', type: 'select', op: 'in', options: userOptions },
    { field: 'impl_org', label: '开发实施方', type: 'select', op: 'in', options: orgOptions },
    { field: 'owners', label: '负责人', type: 'select', op: 'in', options: userOptions },
    { field: 'impl_system', label: '实施系统', type: 'select', op: 'in', options: systemOptions },
    ...stageList.filterConfigs,
  ];

  /**
   * 监听过滤器变更，构造标准的通用 SQL 筛选条件结构
   */
  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find(c => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '' && !(Array.isArray(item.value) && item.value.length === 0));
    setFilterQuery(arr);
  };

  // 表格数据查询器
  const fetcher = (q) => apiPost('/dev-tasks/list', q);
  
  // 删除指定开发任务并重载表格数据
  const onDelete = async (row) => { await apiDelete(`/dev-tasks/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  /**
   * 打开“开发承接”弹窗
   * 拉取所有当前投产点关联的且未开始或未终态的需求/工单，用以按系统进行任务拆分
   */
  const openIntake = () => setIntakeOpen(true);

  const columns = [
    { title: '任务状态', dataIndex: 'task_status_short', key: 'task_status', sortKey: 'status', align: 'center', width: 120, render: (_, row) => <TaskStatusBadge shortStatus={row.task_status_short} status={row.task_status_value} fullStatus={row.task_status} /> },
    { title: '开发状态', dataIndex: 'status', key: 'status', align: 'center', render: (s) => <StatusBadge status={s} /> },
    {
      title: '任务编号',
      dataIndex: 'task_code',
      key: 'task_code',
      sorter: true,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace', fontWeight: 500 }}>
          {val}
        </span>
      ),
    },
    { title: '任务名称', dataIndex: 'task_name', key: 'task_name', ellipsis: true },
    {
      title: '关联需求/工单',
      dataIndex: 'req_code',
      key: 'req_code',
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace' }}>
          {val}
        </span>
      ),
    },
    { title: '开发负责人', dataIndex: 'owner', key: 'owner' },
    { title: '开发承接人', dataIndex: 'intake_owner', key: 'intake_owner' },
    {
      title: '实施系统',
      dataIndex: 'impl_system_name',
      key: 'impl_system_name',
      sortKey: 'impl_system',
      render: (val) => val ? (
        <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{val}</Tag>
      ) : '—',
    },
    { title: '偏差率', dataIndex: 'deviation_rate', key: 'deviation_rate', render: (v) => (v == null ? '—' : `${v}%`) },
    {
      title: '操作', key: 'op', width: 80, fixed: 'right',
      render: (_, row) => (
        <Space size={0} onClick={(e) => e.stopPropagation()}>
          <Can module="dev" action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditId(row.id)} /></Can>
          <Can module="dev" action="delete"><Popconfirm title="确认删除？" onConfirm={() => onDelete(row)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Can>
        </Space>
      ),
    },
  ];

  return (
    <Card 
      title={
        <Space size={12}>
          <span>开发管理</span>
          <Can module="dev" action="create">
            <Button type="primary" icon={<ToolOutlined />} onClick={openIntake}>
              开发承接
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
          <Can key="imp" module="dev" action="import">
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)} style={{ width: 88 }}>导入</Button>
          </Can>,
          <Can key="exp" module="dev" action="export">
            <Button icon={<ExportOutlined />} onClick={() => exportXlsx('/dev-tasks/export', { releasePointIds, filters: filterQuery }, '开发任务清单.xlsx')} style={{ width: 88 }}>导出</Button>
          </Can>,
        ]}
      />
      <DataTable
        ref={tableRef} columns={[...columns.slice(0, -1), ...stageList.allColumns, columns.at(-1)]} fetcher={fetcher}
        listPreferenceKey="development.tasks"
        defaultColumnKeys={['task_status', 'status', 'task_code', 'task_name', 'req_code', 'owner', 'impl_system_name', 'deviation_rate']}
        baseQuery={{ releasePointIds, filters: filterQuery }} 
        showSearch={false}
        onRowClick={(r) => setEditId(r.id)}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{item.task_code}</strong><StatusBadge status={item.status} /></Space>
            <div>{item.task_name}</div>
            <div style={{ fontSize: 12, color: 'var(--radar-text-secondary)' }}>开发实施方：{item.impl_org_display || item.impl_org || '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--radar-text-secondary)' }}>开发负责人：{item.owner || '—'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--radar-text-secondary)' }}>
              <span>实施系统：</span>
              {item.impl_system_name ? <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{item.impl_system_name}</Tag> : <span>—</span>}
            </div>
          </Space>
        )}
      />


      <DevIntakeModal
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        onSaved={() => tableRef.current?.reload()}
      />

      <TaskEditor open={!!editId} kind="dev" taskId={editId} onClose={() => setEditId(null)} onSaved={() => tableRef.current?.reload()} />
      <ImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={() => tableRef.current?.reload()}
        importUrl="/dev-tasks/import"
        templateUrl="/dev-tasks/template"
        templateFilename="开发任务导入模板.xlsx"
      />
      <HistoryDrawer open={!!historyId} entityType="dev" entityId={historyId} onClose={() => setHistoryId(null)} />
    </Card>
  );
}

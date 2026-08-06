/**
 * 文件：web/src/modules/testing/pages/TestTasksPage.jsx
 * 说明：测试任务工作流管理页面，用于跟踪测试阶段（SIT/UAT/等）、测试结论及主测试责任人。
 * 用途：测试管理。SIT/UAT/NFT/SEC 拆为 4 个独立页面，复用同一面板（TestPanel）：
 *       列表 + 测试承接 + 编辑（复用 TaskEditor）+ 历史。各页面对应侧栏"测试管理"子菜单。
 * 作者：hengguan
 */

import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Card, Button, Space, Tag, Popconfirm, message } from 'antd';
import { ExperimentOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons';
import { DataTable, FilterPanel } from '../../../shared/ui/index.js';
import { StatusBadge, TaskEditor, TaskStatusBadge } from '../../../shared/workflow/index.js';
import { HistoryDrawer } from '../../../platform/audit/index.js';
import Can from '../../../platform/auth/Can.jsx';
import { apiPost, apiDelete, apiGet } from '../api/index.js';
import { useAppStore } from '../../../platform/state/app.js';
import { exportXlsx } from '../../../platform/import-export/io.js';
import { ImportModal } from '../../../platform/import-export/index.js';
import { useStageListFields } from '../../settings/process-configuration/index.js';
import TestIntakeModal from '../components/TestIntakeModal.jsx';

const TYPE_LABEL = { SIT: '应用组装测试', UAT: '用户测试', NFT: '非功能测试', SEC: '安全测试' };
const moduleForTestType = (testType) => `test.${testType}`;

const TestPanel = forwardRef(function TestPanel({ testType }, ref) {
  const stageList = useStageListFields(`test.${testType}`);
  const moduleKey = moduleForTestType(testType);
  const tableRef = useRef();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [editId, setEditId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [intakeOpen, setIntakeOpen] = useState(false);

  const [filterQuery, setFilterQuery] = useState([]);
  
  // 导入数据弹窗的显隐状态，控制 ImportModal 组件的挂载与显示
  const [importOpen, setImportOpen] = useState(false);
  
  // 下拉列表选项数据源
  const [orgs, setOrgs] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [systems, setSystems] = useState([]);

  useEffect(() => {
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
    apiGet('/dict/by-category/process_status').then(res => {
      const filtered = (res || []).filter(item => item.extra?.stage === '测试');
      setStatuses(filtered);
    }).catch(() => {});
    apiGet('/users/active').then(setUsers).catch(() => {});
    apiGet('/systems/all').then(setSystems).catch(() => {});
  }, []);

  const orgOptions = orgs.map(o => ({ value: o.attr_value, label: o.display_value }));
  const statusOptions = statuses.map(s => ({ value: s.attr_value, label: s.display_value }));
  const userOptions = users.map(u => ({ value: u.name, label: `${u.name} (${u.phone})` }));
  const systemOptions = systems.map(s => ({ value: s.sys_code, label: `${s.sys_code} - ${s.sys_name}` }));
  const filterConfigs = [
    { field: 'task_code', label: '测试任务编号', type: 'input', isPrimary: true, op: 'like', placeholder: '测试任务编号检索' },
    { field: 'content', label: '测试内容', type: 'input', isPrimary: true, op: 'like', placeholder: '测试任务名称检索' },
    { field: 'status', label: '测试状态', type: 'select', op: 'in', options: statusOptions },
    { field: 'owner', label: '测试负责人', type: 'select', op: 'in', options: userOptions },
    { field: 'intake_owner', label: '测试承接人', type: 'select', op: 'in', options: userOptions },
    { field: 'impl_org', label: '测试实施方', type: 'select', op: 'in', options: orgOptions },
    { field: 'owners', label: '负责人', type: 'select', op: 'in', options: userOptions },
    { field: 'impl_system', label: '实施系统', type: 'select', op: 'in', options: systemOptions },
    ...stageList.filterConfigs,
  ].filter((config) => stageList.isFilterable(config.field));

  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find(c => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '' && !(Array.isArray(item.value) && item.value.length === 0));
    setFilterQuery(arr);
  };

  const fetcher = (q) => apiPost('/test-tasks/list', { ...q, filters: filterQuery });
  const onDelete = async (row) => { await apiDelete(`/test-tasks/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  useImperativeHandle(ref, () => ({
    openIntake,
  }));

  const openIntake = () => setIntakeOpen(true);

  const columns = [
    { title: '任务状态', dataIndex: 'task_status_short', key: 'task_status', sortKey: 'status', align: 'center', width: 120, render: (_, row) => <TaskStatusBadge shortStatus={row.task_status_short} status={row.task_status_value} fullStatus={row.task_status} /> },
    { title: `${TYPE_LABEL[testType]}状态`, dataIndex: 'status', key: 'status', align: 'center', render: (s) => <StatusBadge status={s} /> },
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
    { title: '测试负责人', dataIndex: 'owner', key: 'owner' },
    { title: '测试承接人', dataIndex: 'intake_owner', key: 'intake_owner' },
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
          <Can module={moduleKey} action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditId(row.id)} /></Can>
          <Can module={moduleKey} action="delete"><Popconfirm title="确认删除？" onConfirm={() => onDelete(row)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Can>
        </Space>
      ),
    },
  ];


  return (
    <>
      <FilterPanel
        configs={filterConfigs}
        onChange={handleFilterChange}
        actions={[
          <Can key="imp" module={moduleKey} action="import">
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)} style={{ width: 88 }}>导入</Button>
          </Can>,
          <Can key="exp" module={moduleKey} action="export">
            <Button icon={<ExportOutlined />} onClick={() => exportXlsx('/test-tasks/export', { releasePointIds, test_type: testType, filters: filterQuery }, `${TYPE_LABEL[testType]}清单.xlsx`)} style={{ width: 88 }}>导出</Button>
          </Can>,
        ]}
      />
      <DataTable
        ref={tableRef} columns={[...columns.slice(0, -1), ...stageList.allColumns, columns.at(-1)]} fetcher={fetcher}
        listPreferenceKey="testing.tasks"
        defaultColumnKeys={['task_status', 'status', 'task_code', 'task_name', 'req_code', 'owner', 'impl_system_name', 'deviation_rate']}
        baseQuery={{ releasePointIds, testType, filters: filterQuery }} 
        showSearch={false}
        onRowClick={(r) => setEditId(r.id)}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{item.task_code}</strong><StatusBadge status={item.status} /></Space>
            <div>{item.task_name}</div>
            <div style={{ fontSize: 12, color: 'var(--radar-text-secondary)' }}>测试实施方：{item.impl_org_display || item.impl_org || '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--radar-text-secondary)' }}>测试负责人：{item.owner || '—'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', fontSize: 12, color: 'var(--radar-text-secondary)' }}>
              <span>实施系统：</span>
              {item.impl_system_name ? <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{item.impl_system_name}</Tag> : <span>—</span>}
            </div>
          </Space>
        )}
      />


      <TestIntakeModal
        open={intakeOpen}
        testType={testType}
        onClose={() => setIntakeOpen(false)}
        onSaved={() => tableRef.current?.reload()}
      />

      <TaskEditor open={!!editId} kind="test" taskId={editId} onClose={() => setEditId(null)} onSaved={() => tableRef.current?.reload()} />
      <HistoryDrawer open={!!historyId} entityType="test" entityId={historyId} onClose={() => setHistoryId(null)} />

      {/* 测试任务数据导入弹窗：支持导入模板下载，覆盖、跳过及出错回滚的导入模式 */}
      <ImportModal
        open={importOpen}
        onCancel={() => setImportOpen(false)}
        onSuccess={() => tableRef.current?.reload()}
        importUrl="/test-tasks/import"
        templateUrl="/test-tasks/template"
        templateFilename="测试任务导入模板.xlsx"
        extraFields={{ testType }}
      />
    </>
  );
});

/** 4 个独立测试页面（对应侧栏"测试管理"子菜单） */
export function SitPage() {
  const ref = useRef();
  return (
    <Card 
      title={
        <Space size={12}>
          <span>应用组装测试（SIT）</span>
          <Can module="test.SIT" action="create">
            <Button type="primary" icon={<ExperimentOutlined />} onClick={() => ref.current?.openIntake()}>
              测试承接
            </Button>
          </Can>
        </Space>
      }
      variant="borderless"
    >
      <TestPanel ref={ref} testType="SIT" />
    </Card>
  );
}
export function UatPage() {
  const ref = useRef();
  return (
    <Card 
      title={
        <Space size={12}>
          <span>用户测试（UAT）</span>
          <Can module="test.UAT" action="create">
            <Button type="primary" icon={<ExperimentOutlined />} onClick={() => ref.current?.openIntake()}>
              测试承接
            </Button>
          </Can>
        </Space>
      }
      variant="borderless"
    >
      <TestPanel ref={ref} testType="UAT" />
    </Card>
  );
}
export function NftPage() {
  const ref = useRef();
  return (
    <Card 
      title={
        <Space size={12}>
          <span>非功能测试（NFT）</span>
          <Can module="test.NFT" action="create">
            <Button type="primary" icon={<ExperimentOutlined />} onClick={() => ref.current?.openIntake()}>
              测试承接
            </Button>
          </Can>
        </Space>
      }
      variant="borderless"
    >
      <TestPanel ref={ref} testType="NFT" />
    </Card>
  );
}
export function SecPage() {
  const ref = useRef();
  return (
    <Card 
      title={
        <Space size={12}>
          <span>安全测试（SEC）</span>
          <Can module="test.SEC" action="create">
            <Button type="primary" icon={<ExperimentOutlined />} onClick={() => ref.current?.openIntake()}>
              测试承接
            </Button>
          </Can>
        </Space>
      }
      variant="borderless"
    >
      <TestPanel ref={ref} testType="SEC" />
    </Card>
  );
}

/**
 * 文件：web/src/modules/requirements/pages/RequirementsPage.jsx
 * 说明：需求列表管理页面，支持新建、批量导入、状态筛选、模糊搜索和投产点关联，提供入口至需求编辑器。
 * 用途：需求分析页面。需求列表（默认按当前投产窗口过滤）+ 新增/编辑（复用 RequirementEditor）
 *       + 历史记录 + 导入导出/模板。
 * 作者：hengguan
 */

import { useRef, useState, useEffect } from 'react';
import { Card, Button, Space, Tag, Popconfirm, message, Tooltip } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined,
} from '@ant-design/icons';
import { DataTable, FilterPanel } from '../../../shared/ui/index.js';
import { StatusBadge, TaskStatusBadge } from '../../../shared/workflow/index.js';
import { HistoryDrawer } from '../../../platform/audit/index.js';
import RequirementEditor from '../components/RequirementEditor.jsx';
import Can from '../../../platform/auth/Can.jsx';
import { apiPost, apiDelete, apiGet } from '../api/index.js';
import { exportXlsx } from '../../../platform/import-export/io.js';
import { useAppStore } from '../../../platform/state/app.js';
import { ImportModal } from '../../../platform/import-export/index.js';
import { makeReleasePointOptions, ReleasePointText } from '../../settings/reference-data/index.js';
import { useStageListFields } from '../../settings/process-configuration/index.js';

export default function Requirements() {
  const stageList = useStageListFields('requirement');
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

  // 初始化需求筛选需要的字典；流程状态只保留需求阶段，避免跨模块状态混用。
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

  const pointOptions = makeReleasePointOptions(points);
  const orgOptions = orgs.map(o => ({ value: o.attr_value, label: o.display_value }));
  const reqDeptOptions = reqDepts.map(d => ({ value: d.attr_value, label: d.display_value }));
  const statusOptions = statuses.map(s => ({ value: s.attr_value, label: s.display_value }));
  const typeOptions = types.map(t => ({ value: t.attr_value, label: t.display_value }));
  const userOptions = users.map(u => ({ value: u.name, label: `${u.name} (${u.phone})` }));
  const systemOptions = systems.map(s => ({ value: s.sys_code, label: `${s.sys_code} - ${s.sys_name}` }));

  const fallbackNativeFilterLabels = { implementation_org: '实施机构', req_code: '需求编号', issue_no: 'OA编号/工单编号', release_point_id: '计划投产点', status: '需求状态', req_type: '需求类型', is_accounting: '是否涉账', priority: '优先级', propose_dept: '提出部门', proposer: '提出人', receiver: '需求接收人', workload: '工作量', registrar: '录入人', register_time: '录入时间', main_systems: '主责系统', collab_dev_systems: '协同改造系统' };
  const fallbackNativeFilters = [
    'implementation_org', 'req_code', 'issue_no', 'release_point_id', 'status', 'req_type', 'is_accounting', 'priority',
    'propose_dept', 'proposer', 'receiver', 'workload', 'registrar', 'register_time', 'main_systems', 'collab_dev_systems',
  ].map((field_key) => ({ field_key, label: fallbackNativeFilterLabels[field_key] }));
  const nativeFilterFields = stageList.loaded ? stageList.nativeFilterFields : fallbackNativeFilters;
  const nativeFilterConfig = (field) => {
    const label = field.label;
    const text = (placeholder = `${label}检索`) => ({ field: field.field_key, label, type: 'input', op: 'like', placeholder });
    switch (field.field_key) {
      case 'implementation_org': return { field: field.field_key, label, type: 'select', op: 'in', options: orgOptions, isPrimary: true };
      case 'req_code': return { ...text('需求编号检索'), isPrimary: true };
      case 'release_point_id': return { field: field.field_key, label, type: 'select', op: 'in', options: pointOptions };
      case 'status': return { field: field.field_key, label, type: 'select', op: 'in', options: statusOptions };
      case 'req_type': return { field: field.field_key, label, type: 'select', op: 'in', options: typeOptions };
      case 'is_accounting': return { field: field.field_key, label, type: 'select', op: 'in', options: [{ value: '否', label: '否' }, { value: '是', label: '是' }] };
      case 'priority': return { field: field.field_key, label, type: 'select', op: 'in', options: [{ value: '高', label: '高' }, { value: '中', label: '中' }, { value: '低', label: '低' }] };
      case 'propose_dept': return { field: field.field_key, label, type: 'select', op: 'in', options: reqDeptOptions };
      case 'proposer': case 'receiver': case 'registrar': case 'yn_owner': case 'jk_owner': return { field: field.field_key, label, type: 'select', op: 'in', options: userOptions };
      case 'main_systems': case 'collab_dev_systems': case 'collab_test_systems': return { field: field.field_key, label, type: 'select', op: 'in', options: systemOptions };
      default: return text();
    }
  };
  // `content`、`owners` 是固定的组合检索，不是输入项配置字段；其余条件逐项服从字段开关。
  const filterConfigs = [
    ...nativeFilterFields.map(nativeFilterConfig),
    { field: 'content', label: '需求内容', type: 'input', isPrimary: true, op: 'like', placeholder: '需求标题或概述检索' },
    { field: 'owners', label: '负责人', type: 'select', op: 'in', options: userOptions },
    ...stageList.filterConfigs,
  ];

  // 将筛选控件值规范为服务端识别的字段、操作符和值三元组。
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

  // 新建和编辑共用编辑器；有行数据时才携带既有记录标识。
  const openEdit = (row) => { setEditId(row?.id || null); setEditOpen(true); };
  const openCreate = () => { setEditId(null); setEditOpen(true); };
  const onDelete = async (row) => { await apiDelete(`/requirements/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };



  // 关联开发或测试任务的需求禁止删除，避免破坏交付链路的可追溯性。
  const columns = [
    { title: '任务状态', dataIndex: 'task_status_short', key: 'task_status', align: 'center', width: 120, render: (_, row) => <TaskStatusBadge shortStatus={row.task_status_short} status={row.task_status_value} fullStatus={row.task_status} /> },
    { title: '需求状态', dataIndex: 'status', key: 'status', align: 'center', render: (s) => <StatusBadge status={s} /> },
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
    {
      title: '计划投产点',
      dataIndex: 'release_date',
      key: 'release_date',
      render: (val) => <ReleasePointText value={val} />,
    },
    {
      title: '需求标题',
      dataIndex: 'title',
      key: 'title',
      width: 280,
      render: (text) => (
        <div
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'normal',
            wordBreak: 'break-all',
          }}
          title={text}
        >
          {text}
        </div>
      ),
    },
    { title: '需求类型', dataIndex: 'req_type', key: 'req_type' },
    { title: '优先级', dataIndex: 'priority', key: 'priority', width: 76 },
    {
      title: '提出人',
      dataIndex: 'proposer',
      key: 'proposer',
      render: (val) => (Array.isArray(val) ? val.join(', ') : (val || '—')),
    },
      { title: '实施机构', dataIndex: 'implementation_org', key: 'implementation_org' },
    { title: '需求接收人', dataIndex: 'receiver', key: 'receiver' },
    { title: '工作量', dataIndex: 'workload', key: 'workload' },
    { title: '录入人', dataIndex: 'registrar', key: 'registrar' },
    { title: '录入时间', dataIndex: 'register_time', key: 'register_time', sorter: true },
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

  const nativeColumnAliases = { release_point_id: 'release_date', main_systems: 'main_systems_names', collab_dev_systems: 'collab_dev_systems_names' };
  const columnByKey = new Map(columns.map((column) => [column.key, column]));
  const configuredNativeColumns = stageList.loaded
    ? stageList.nativeListFields.map((field) => {
      const column = columnByKey.get(nativeColumnAliases[field.field_key] || field.field_key);
      return column
        ? { ...column, key: field.field_key, title: field.label }
        : { title: field.label, dataIndex: field.field_key, key: field.field_key, render: (value) => Array.isArray(value) ? (value.join('、') || '—') : (value || '—') };
    })
    : columns.slice(1, -1);

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
        ref={tableRef} columns={[columns[0], ...configuredNativeColumns, ...stageList.columns, columns.at(-1)]} fetcher={fetcher}
        baseQuery={{ releasePointIds, filters: filterQuery }}
        showSearch={false}
        onRowClick={openEdit}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{item.req_code}</strong><StatusBadge status={item.status} /></Space>
            <div>{item.title}</div>
            {item.release_date && (
              <div style={{ fontSize: '11px', color: 'var(--radar-text-secondary)' }}>
                计划投产点：<ReleasePointText value={item.release_date} />
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

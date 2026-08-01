/**
 * 文件：web/src/modules/testing/pages/TestTasksPage.jsx
 * 说明：测试任务工作流管理页面，用于跟踪测试阶段（SIT/UAT/等）、测试结论及主测试责任人。
 * 用途：测试管理。SIT/UAT/NFT/SEC 拆为 4 个独立页面，复用同一面板（TestPanel）：
 *       列表 + 测试承接 + 编辑（复用 TaskEditor）+ 历史。各页面对应侧栏"测试管理"子菜单。
 * 作者：hengguan
 */

import { useRef, useState, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Card, Button, Space, Modal, Tag, Popconfirm, message, Table, Input, Spin, List, Radio, Checkbox, Select } from 'antd';
import { ExperimentOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons';
import { DataTable, FilterPanel, ResizableTitle } from '../../../shared/ui/index.js';
import { StatusBadge, TaskEditor, TaskStatusBadge } from '../../../shared/workflow/index.js';
import { SystemSelect } from '../../settings/reference-data/index.js';
import { HistoryDrawer } from '../../../platform/audit/index.js';
import Can from '../../../platform/auth/Can.jsx';
import { apiPost, apiDelete, apiGet } from '../api/index.js';
import { useAppStore } from '../../../platform/state/app.js';
import { useResponsive } from '../../../platform/ui/useResponsive.js';
import { exportXlsx } from '../../../platform/import-export/io.js';
import { ImportModal } from '../../../platform/import-export/index.js';
import { useStageListFields } from '../../settings/process-configuration/index.js';

const TYPE_LABEL = { SIT: '应用组装测试', UAT: '用户测试', NFT: '非功能测试', SEC: '安全测试' };
const moduleForTestType = (testType) => `test.${testType}`;

const TestPanel = forwardRef(function TestPanel({ testType }, ref) {
  const stageList = useStageListFields(`test.${testType}`);
  const moduleKey = moduleForTestType(testType);
  const tableRef = useRef();
  const { isMobile } = useResponsive();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [editId, setEditId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [reqList, setReqList] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedReq, setSelectedReq] = useState(null);
  const [previewData, setPreviewData] = useState({ overall: [], split: [] });
  const [splitMode, setSplitMode] = useState('overall');
  const [selectedNewSystems, setSelectedNewSystems] = useState([]);
  const [selectedOwners, setSelectedOwners] = useState({});
  const [selectedImplOrgs, setSelectedImplOrgs] = useState({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reqColWidths, setReqColWidths] = useState({});
  const [prevColWidths, setPrevColWidths] = useState({});

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
  const defaultImplOrgsFor = (tasks) => Object.fromEntries((tasks || [])
    .filter((task) => !task.exists && task.defaultImplOrg)
    .map((task) => [task.sysCode, task.defaultImplOrg]));

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

  const fetcher = (q) => apiPost('/test-tasks/list', { ...q, filters: filterQuery });
  const onDelete = async (row) => { await apiDelete(`/test-tasks/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  useImperativeHandle(ref, () => ({
    openIntake
  }));

  const openIntake = async () => {
    const [reqRes, ticketRes] = await Promise.all([
      apiPost('/requirements/list', { releasePointIds, pageSize: 0 }),
      apiPost('/tickets/list', { releasePointIds, pageSize: 0 }),
    ]);
    const reqs = (reqRes.list || []).map((r) => ({ ...r, entity_type: 'requirement', entity_label: '需求' }));
    const tickets = (ticketRes.list || []).map((t) => ({
      ...t,
      req_code: t.ticket_code,
      entity_type: 'ticket',
      entity_label: '工单',
      main_systems_names: t.main_systems_names || [],
    }));
    const list = [...reqs, ...tickets].filter(
      (r) => !r.release_stage_type || (r.release_stage_type !== 'in-progress' && r.release_stage_type !== 'final')
    );
    const pendingCodes = await apiPost('/test-tasks/intake-pending-codes', { testType, reqCodes: list.map((item) => item.req_code) });
    setReqList(list.filter((item) => (pendingCodes || []).includes(item.req_code)));
    setSearchText('');
    setSelectedReq(null);
    setPreviewData({ overall: [], split: [] });
    setSplitMode('overall');
    setSelectedNewSystems([]);
    setSelectedOwners({});
    setSelectedImplOrgs({});
    setIntakeOpen(true);
  };

  const handleSelectReq = async (record) => {
    setSelectedReq(record);
    if (record) {
      setLoadingPreview(true);
      try {
        const res = await apiPost('/test-tasks/intake-preview', { reqCode: record.req_code, testType });
        setPreviewData(res || { overall: [], split: [] });
        const currentList = res ? (splitMode === 'overall' ? res.overall : res.split) : [];
        const checkable = currentList.filter(t => !t.exists).map(t => t.sysCode);
        setSelectedNewSystems(checkable);
        setSelectedOwners({});
        setSelectedImplOrgs(defaultImplOrgsFor(currentList));
      } catch (err) {
        message.error(err.message || '加载预览失败');
      } finally {
        setLoadingPreview(false);
      }
    } else {
      setPreviewData({ overall: [], split: [] });
      setSelectedNewSystems([]);
      setSelectedOwners({});
      setSelectedImplOrgs({});
    }
  };

  const handleSplitModeChange = (mode) => {
    setSplitMode(mode);
    const currentList = mode === 'overall' ? previewData.overall : previewData.split;
    const checkable = (currentList || []).filter(t => !t.exists).map(t => t.sysCode);
    setSelectedNewSystems(checkable);
    setSelectedOwners({});
    setSelectedImplOrgs(defaultImplOrgsFor(currentList));
  };

  const doIntake = async () => {
    if (!selectedReq) {
      message.warning('请先选择需求/工单');
      return;
    }
    if (!selectedNewSystems.length) {
      message.warning('请至少勾选一个需要新建的任务');
      return;
    }
    if (selectedNewSystems.some((sysCode) => !selectedOwners[sysCode])) {
      message.warning('请为每个勾选的测试任务选择测试负责人');
      return;
    }
    if (selectedNewSystems.some((sysCode) => !selectedImplOrgs[sysCode])) {
      message.warning('请为每个勾选的测试任务选择测试实施方');
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost('/test-tasks/intake', {
        reqCode: selectedReq.req_code,
        testType,
        assignments: selectedNewSystems.map((sysCode) => ({
          sysCode, owner: selectedOwners[sysCode], implOrg: selectedImplOrgs[sysCode],
        })),
        splitMode,
      });
      message.success(`已成功承接 ${res.length} 个${TYPE_LABEL[testType]}任务`);
      setIntakeOpen(false);
      tableRef.current?.reload();
    } catch (err) {
      message.error(err.message || '承接失败');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: '任务状态', dataIndex: 'task_status_short', key: 'task_status', align: 'center', width: 120, render: (_, row) => <TaskStatusBadge shortStatus={row.task_status_short} status={row.task_status_value} fullStatus={row.task_status} /> },
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

  const reqColumns = [
    {
      title: '类型',
      dataIndex: 'entity_label',
      key: 'entity_label',
      width: 70,
      render: (val) => val ? <Tag className="status-tag" style={{ margin: 0 }}>{val}</Tag> : '—',
    },
    {
      title: '需求/工单编号',
      dataIndex: 'req_code',
      key: 'req_code',
      width: 130,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontWeight: 500 }}>
          {val}
        </span>
      ),
    },
    {
      title: '标题/概述',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: '主责系统',
      dataIndex: 'main_systems_names',
      key: 'main_systems_names',
      render: (arr) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(arr || []).map((name) => (
            <Tag key={name} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0, fontSize: 10, lineHeight: '16px' }}>{name}</Tag>
          ))}
        </div>
      ),
    },
  ];

  const previewColumns = [
    {
      title: '建立状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (val, record) => {
        const isExist = record.exists;
        return (
          <Tag className={isExist ? 'status-tag status-tag-final' : 'status-tag status-tag-in-progress'} style={{ margin: 0 }}>
            {val}
          </Tag>
        );
      },
    },
    {
      title: '实施系统',
      dataIndex: 'sysName',
      key: 'sysName',
      render: (val, record) => (
        <span style={{ fontWeight: 500 }}>
          {val} {record.sysCode !== 'overall' && <span style={{ color: 'var(--radar-text-secondary)', fontSize: 11, fontWeight: 400 }}>({record.sysCode})</span>}
        </span>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 80,
      align: 'center',
      render: (val) => (
        <Tag className="status-tag" style={{
          borderColor: val === '主责' ? 'var(--radar-primary)' : (val === '整体' ? 'var(--radar-ink)' : 'var(--radar-accent)'),
          color: val === '主责' ? 'var(--radar-primary)' : (val === '整体' ? 'var(--radar-ink)' : 'var(--radar-accent)'),
          background: val === '主责' ? 'var(--radar-primary-soft)' : (val === '整体' ? 'var(--radar-bg)' : 'var(--radar-accent-soft)'),
          margin: 0
        }}>
          {val}
        </Tag>
      ),
    },
    {
      title: '计划生成任务编号',
      dataIndex: 'taskCode',
      key: 'taskCode',
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>
          {val}
        </span>
      ),
    },
    {
      title: '测试任务名称',
      dataIndex: 'taskName',
      key: 'taskName',
      ellipsis: true,
    },
    {
      title: '测试实施方', key: 'impl_org', width: 170,
      render: (_, record) => record.exists ? <span>—</span> : (
        <Select
          value={selectedImplOrgs[record.sysCode]}
          options={orgOptions}
          placeholder="选择测试实施方"
          size="small"
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          onClick={(event) => event.stopPropagation()}
          onChange={(implOrg) => setSelectedImplOrgs((current) => ({ ...current, [record.sysCode]: implOrg }))}
        />
      ),
    },
    {
      title: '测试负责人', key: 'intake_owner', width: 180,
      render: (_, record) => record.exists ? <span>{record.owner || '—'}</span> : (
        <Select
          value={selectedOwners[record.sysCode]}
          options={userOptions}
          placeholder="选择测试负责人"
          size="small"
          showSearch
          optionFilterProp="label"
          style={{ width: '100%' }}
          onClick={(event) => event.stopPropagation()}
          onChange={(owner) => setSelectedOwners((current) => ({ ...current, [record.sysCode]: owner }))}
        />
      ),
    },
  ];

  const handleReqResize = (key) => (w) => setReqColWidths((prev) => ({ ...prev, [key]: w }));
  const resizableReqColumns = useMemo(() => reqColumns.map((c) => {
    const width = reqColWidths[c.dataIndex || c.key] || c.width;
    return {
      ...c,
      width,
      onHeaderCell: (col) => ({
        width: col.width,
        onResize: handleReqResize(c.dataIndex || c.key),
      }),
    };
  }), [reqColumns, reqColWidths]);

  const handlePrevResize = (key) => (w) => setPrevColWidths((prev) => ({ ...prev, [key]: w }));
  const resizablePreviewColumns = useMemo(() => previewColumns.map((c) => {
    const width = prevColWidths[c.dataIndex || c.key] || c.width;
    return {
      ...c,
      width,
      onHeaderCell: (col) => ({
        width: col.width,
        onResize: handlePrevResize(c.dataIndex || c.key),
      }),
    };
  }), [previewColumns, prevColWidths]);

  const filteredReqs = reqList.filter((r) => {
    if (!searchText) return true;
    const txt = searchText.toLowerCase();
    const code = (r.req_code || '').toLowerCase();
    const title = (r.title || '').toLowerCase();
    const systems = (r.main_systems_names || []).join(',').toLowerCase();
    return code.includes(txt) || title.includes(txt) || systems.includes(txt);
  });

  const currentPreviewList = splitMode === 'overall' ? previewData.overall : previewData.split;

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
        ref={tableRef} columns={[...columns.slice(0, -1), ...stageList.columns, columns.at(-1)]} fetcher={fetcher}
        baseQuery={{ releasePointIds, testType, filters: filterQuery }} 
        showSearch={false}
        onRowClick={(r) => setEditId(r.id)}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{item.task_code}</strong><StatusBadge status={item.status} /></Space>
            <div>{item.task_name}</div>
            <Space size="small">
              {item.impl_system_name && (
                <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{item.impl_system_name}</Tag>
              )}
              <span>测试负责人：{item.owner || '—'}</span>
              <span>测试承接人：{item.intake_owner || '—'}</span>
            </Space>
          </Space>
        )}
      />

      <Modal
        open={intakeOpen}
        title={`${TYPE_LABEL[testType]}承接`}
        width={isMobile ? 'calc(100vw - 24px)' : 1180}
        onCancel={() => setIntakeOpen(false)}
        onOk={doIntake}
        confirmLoading={saving}
        okText="承接"
        styles={{ body: { padding: '12px 0 0 0' } }}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. 选择需求/工单 */}
          <div className="form-section-card" style={{ marginBottom: 0 }}>
            <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>1. 选择需求/工单</div>
            <div style={{ marginBottom: 8 }}>
              <Input.Search
                placeholder="需求/工单编号、标题/概述、主责系统检索..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                size="small"
                style={{ width: isMobile ? '100%' : 320 }}
                allowClear
                className="super-compact-table-search"
              />
            </div>
            {isMobile ? (
              <List
                dataSource={filteredReqs}
                rowKey="req_code"
                size="small"
                pagination={{ pageSize: 5, size: 'small', showSizeChanger: false }}
                renderItem={(r) => {
                  const isSelected = selectedReq?.req_code === r.req_code;
                  return (
                    <Card
                      size="small"
                      style={{
                        marginBottom: 8,
                        cursor: 'pointer',
                        borderColor: isSelected ? 'var(--radar-primary)' : 'var(--radar-border)',
                        background: isSelected ? 'var(--radar-primary-soft)' : 'var(--radar-surface)',
                      }}
                      onClick={() => handleSelectReq(r)}
                    >
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                          <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontWeight: 600 }}>
                            {r.req_code}
                          </span>
                          <Tag className="status-tag" style={{ margin: 0 }}>{r.entity_label || '需求'}</Tag>
                          <Radio checked={isSelected} />
                        </Space>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {(r.main_systems_names || []).map((name) => (
                            <Tag key={name} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0, fontSize: 10 }}>{name}</Tag>
                          ))}
                        </div>
                      </Space>
                    </Card>
                  );
                }}
              />
            ) : (
              <Table
                dataSource={filteredReqs}
                columns={resizableReqColumns}
                components={{ header: { cell: ResizableTitle } }}
                rowKey="req_code"
                size="small"
                className="super-compact-table"
                pagination={{ pageSize: 5, size: 'small', showSizeChanger: false }}
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: selectedReq ? [selectedReq.req_code] : [],
                  onChange: (_, rows) => {
                    if (rows.length) handleSelectReq(rows[0]);
                  },
                }}
                onRow={(record) => ({
                  onClick: () => handleSelectReq(record),
                  style: { cursor: 'pointer' },
                })}
              />
            )}
          </div>

          {/* 2. 选择承接方式 */}
          {selectedReq && (
            <div className="form-section-card" style={{ marginBottom: 0 }}>
              <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>2. 选择承接方式</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>方式选择：</span>
                <Radio.Group value={splitMode} onChange={(e) => handleSplitModeChange(e.target.value)} size="small">
                  <Radio value="overall">合并承接</Radio>
                  <Radio value="split">拆分承接</Radio>
                </Radio.Group>
              </div>
            </div>
          )}

          {/* 3. 确认测试任务 */}
          <div className="form-section-card" style={{ marginBottom: 0 }}>
            <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>3. 确认测试任务</div>
            {selectedReq ? (
              <Spin spinning={loadingPreview}>
                {isMobile ? (
                  <List
                    dataSource={currentPreviewList}
                    rowKey="sysCode"
                    size="small"
                    renderItem={(item) => {
                      const isChecked = selectedNewSystems.includes(item.sysCode);
                      const toggleCheck = () => {
                        if (item.exists) return;
                        if (isChecked) {
                          setSelectedNewSystems(selectedNewSystems.filter(c => c !== item.sysCode));
                        } else {
                          setSelectedNewSystems([...selectedNewSystems, item.sysCode]);
                        }
                      };
                      return (
                        <Card
                          size="small"
                          style={{
                            marginBottom: 8,
                            borderColor: isChecked ? 'var(--radar-primary)' : 'var(--radar-border)',
                          }}
                          onClick={toggleCheck}
                        >
                          <Space direction="vertical" size={4} style={{ width: '100%' }}>
                            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                              <Space>
                                <Checkbox
                                  checked={item.exists ? false : isChecked}
                                  disabled={item.exists}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={toggleCheck}
                                />
                                <strong style={{ fontSize: 13 }}>{item.sysName}</strong>
                                {item.sysCode !== 'overall' && <span style={{ color: 'var(--radar-text-secondary)', fontSize: 11 }}>({item.sysCode})</span>}
                              </Space>
                              <Tag className={item.exists ? 'status-tag status-tag-final' : 'status-tag status-tag-in-progress'} style={{ margin: 0 }}>
                                {item.status}
                              </Tag>
                            </Space>
                            <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginTop: 4 }}>
                              角色：
                              <Tag className="status-tag" style={{
                                borderColor: item.role === '主责' ? 'var(--radar-primary)' : (item.role === '整体' ? 'var(--radar-ink)' : 'var(--radar-accent)'),
                                color: item.role === '主责' ? 'var(--radar-primary)' : (item.role === '整体' ? 'var(--radar-ink)' : 'var(--radar-accent)'),
                                background: item.role === '主责' ? 'var(--radar-primary-soft)' : (item.role === '整体' ? 'var(--radar-bg)' : 'var(--radar-accent-soft)'),
                                margin: 0,
                                fontSize: 10,
                                lineHeight: '14px'
                              }}>
                                {item.role}
                              </Tag>
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                              计划生成任务编号：<span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{item.taskCode}</span>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--radar-ink)' }}>
                              任务名称：{item.taskName}
                            </div>
                            {!item.exists && (
                              <Select
                                value={selectedImplOrgs[item.sysCode]}
                                options={orgOptions}
                                placeholder="选择测试实施方（必填）"
                                size="small"
                                showSearch
                                optionFilterProp="label"
                                style={{ width: '100%' }}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(implOrg) => setSelectedImplOrgs((current) => ({ ...current, [item.sysCode]: implOrg }))}
                              />
                            )}
                            <Select
                              value={selectedOwners[item.sysCode]}
                              options={userOptions}
                              placeholder="选择测试负责人（必填）"
                              size="small"
                              showSearch
                              optionFilterProp="label"
                              disabled={item.exists}
                              style={{ width: '100%' }}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(owner) => setSelectedOwners((current) => ({ ...current, [item.sysCode]: owner }))}
                            />
                          </Space>
                        </Card>
                      );
                    }}
                  />
                ) : (
                  <Table
                    dataSource={currentPreviewList}
                    columns={resizablePreviewColumns}
                    components={{ header: { cell: ResizableTitle } }}
                    rowKey="sysCode"
                    size="small"
                    className="super-compact-table"
                    pagination={false}
                    rowSelection={{
                      selectedRowKeys: selectedNewSystems,
                      onChange: (keys) => setSelectedNewSystems(keys),
                      getCheckboxProps: (record) => ({
                        disabled: record.exists,
                      }),
                    }}
                  />
                )}
              </Spin>
            ) : (
              <div className="lc-empty" style={{ padding: '24px 0' }}>请在上方选择一条需求/工单进行承接</div>
            )}
          </div>
        </div>
      </Modal>

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

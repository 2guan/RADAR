/**
 * 文件：pages/DevTasks.jsx
 * 用途：开发管理页面。开发任务列表 + 开发承接（按系统拆分）+ 编辑（复用 TaskEditor）+ 历史。
 * 作者：hengguan
 */

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Card, Button, Space, Modal, Form, Tag, Popconfirm, message, Table, Input, Spin, List, Radio, Checkbox } from 'antd';
import { ToolOutlined, EditOutlined, DeleteOutlined, HistoryOutlined, ImportOutlined, ExportOutlined } from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import SystemSelect from '../components/SystemSelect.jsx';
import HistoryDrawer from '../components/HistoryDrawer.jsx';
import TaskEditor from '../components/editors/TaskEditor.jsx';
import FilterPanel from '../components/FilterPanel.jsx';
import Can from '../components/Can.jsx';
import { apiPost, apiDelete, apiGet } from '../api/client.js';
import { useAppStore } from '../stores/app.js';
import { useResponsive } from '../hooks/useResponsive.js';
import ResizableTitle from '../components/ResizableTitle.jsx';
import { exportXlsx } from '../utils/io.js';
import ImportModal from '../components/ImportModal.jsx';

export default function DevTasks() {
  const tableRef = useRef();
  const { isMobile } = useResponsive();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [editId, setEditId] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [reqList, setReqList] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [selectedReq, setSelectedReq] = useState(null);
  const [previewList, setPreviewList] = useState([]);
  const [selectedNewSystems, setSelectedNewSystems] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reqColWidths, setReqColWidths] = useState({});
  const [prevColWidths, setPrevColWidths] = useState({});

  const [filterQuery, setFilterQuery] = useState([]);
  
  // 下拉列表选项数据源
  const [points, setPoints] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [users, setUsers] = useState([]);
  const [systems, setSystems] = useState([]);

  useEffect(() => {
    apiGet('/release-points/all').then(setPoints).catch(() => {});
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
    apiGet('/dict/by-category/process_status').then(res => {
      const filtered = (res || []).filter(item => item.extra?.stage === '开发');
      setStatuses(filtered);
    }).catch(() => {});
    apiGet('/users/active').then(setUsers).catch(() => {});
    apiGet('/systems/all').then(setSystems).catch(() => {});
  }, []);

  const pointOptions = points.map(p => ({ value: p.id, label: p.release_date }));
  const orgOptions = orgs.map(o => ({ value: o.attr_value, label: o.display_value }));
  const statusOptions = statuses.map(s => ({ value: s.attr_value, label: s.display_value }));
  const userOptions = users.map(u => ({ value: u.name, label: `${u.name} (${u.phone})` }));
  const systemOptions = systems.map(s => ({ value: s.sys_code, label: `${s.sys_code} - ${s.sys_name}` }));

  const filterConfigs = [
    { field: 'task_code', label: '开发任务编号', type: 'input', isPrimary: true, op: 'like', placeholder: '输入开发任务编号模糊搜索' },
    { field: 'content', label: '开发内容', type: 'input', isPrimary: true, op: 'like', placeholder: '输入开发任务名称或内容模糊搜索' },
    { field: 'release_point_id', label: '计划投产点', type: 'select', op: 'in', options: pointOptions },
    { field: 'org', label: '实施机构', type: 'select', op: 'in', options: orgOptions },
    { field: 'status', label: '开发状态', type: 'select', op: 'in', options: statusOptions },
    { field: 'owner', label: '开发负责人', type: 'select', op: 'in', options: userOptions },
    { field: 'impl_org', label: '开发实施方', type: 'select', op: 'in', options: orgOptions },
    { field: 'owners', label: '负责人', type: 'select', op: 'in', options: userOptions },
    { field: 'impl_system', label: '实施系统', type: 'select', op: 'in', options: systemOptions },
  ];

  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find(c => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '');
    setFilterQuery(arr);
  };

  const fetcher = (q) => apiPost('/dev-tasks/list', q);
  const onDelete = async (row) => { await apiDelete(`/dev-tasks/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  const openIntake = async () => {
    const res = await apiPost('/requirements/list', { releasePointIds, pageSize: 0 });
    const list = (res.list || []).filter(
      (r) => !r.release_stage_type || (r.release_stage_type !== 'in-progress' && r.release_stage_type !== 'final')
    );
    setReqList(list);
    setSearchText('');
    setSelectedReq(null);
    setPreviewList([]);
    setSelectedNewSystems([]);
    setIntakeOpen(true);
  };

  const handleSelectReq = async (record) => {
    setSelectedReq(record);
    if (record) {
      setLoadingPreview(true);
      try {
        const res = await apiPost('/dev-tasks/intake-preview', { reqCode: record.req_code });
        setPreviewList(res || []);
        // Default check all "新建任务" (exists is false)
        const checkable = (res || [])
          .filter((t) => !t.exists)
          .map((t) => t.sysCode);
        setSelectedNewSystems(checkable);
      } catch (err) {
        message.error(err.message || '加载预览失败');
      } finally {
        setLoadingPreview(false);
      }
    } else {
      setPreviewList([]);
      setSelectedNewSystems([]);
    }
  };

  const doIntake = async () => {
    if (!selectedReq) {
      message.warning('请先选择需求');
      return;
    }
    if (!selectedNewSystems.length) {
      message.warning('请至少勾选一个需要新建的任务');
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost('/dev-tasks/intake', {
        reqCode: selectedReq.req_code,
        systems: selectedNewSystems,
      });
      message.success(`已成功承接 ${res.length} 个开发任务`);
      setIntakeOpen(false);
      tableRef.current?.reload();
    } catch (err) {
      message.error(err.message || '承接失败');
    } finally {
      setSaving(false);
    }
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
      title: '关联需求',
      dataIndex: 'req_code',
      key: 'req_code',
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace' }}>
          {val}
        </span>
      ),
    },
    { title: '负责人', dataIndex: 'owner', key: 'owner' },
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
      title: '操作', key: 'op', width: 100, fixed: 'right',
      render: (_, row) => (
        <Space size={0} onClick={(e) => e.stopPropagation()}>
          <Can module="dev" action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditId(row.id)} /></Can>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => setHistoryId(row.id)} />
          <Can module="dev" action="delete"><Popconfirm title="确认删除？" onConfirm={() => onDelete(row)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Can>
        </Space>
      ),
    },
  ];
  const reqColumns = [
    {
      title: '计划投产点',
      dataIndex: 'release_date',
      key: 'release_date',
      width: 100,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>
          {val || '—'}
        </span>
      ),
    },
    {
      title: '需求编号',
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
      title: '需求标题',
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
          {val} <span style={{ color: 'var(--radar-text-secondary)', fontSize: 11, fontWeight: 400 }}>({record.sysCode})</span>
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
          borderColor: val === '主责' ? 'var(--radar-primary)' : 'var(--radar-accent)',
          color: val === '主责' ? 'var(--radar-primary)' : 'var(--radar-accent)',
          background: val === '主责' ? 'var(--radar-primary-soft)' : 'var(--radar-accent-soft)',
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
      title: '开发任务名称',
      dataIndex: 'taskName',
      key: 'taskName',
      ellipsis: true,
    },
  ];

  // 列宽拖拽支持
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
    const relDate = (r.release_date || '').toLowerCase();
    const code = (r.req_code || '').toLowerCase();
    const title = (r.title || '').toLowerCase();
    const systems = (r.main_systems_names || []).join(',').toLowerCase();
    return relDate.includes(txt) || code.includes(txt) || title.includes(txt) || systems.includes(txt);
  });

  return (
    <Card 
      title={
        <Space size={12}>
          <span>开发管理</span>
          <Can module="dev" action="dev.intake">
            <Button type="primary" icon={<ToolOutlined />} onClick={openIntake}>
              开发承接
            </Button>
          </Can>
        </Space>
      }
      variant="borderless"
    >
      <FilterPanel configs={filterConfigs} onChange={handleFilterChange} />
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher} 
        baseQuery={{ releasePointIds, filters: filterQuery }} 
        showSearch={false}
        onRowClick={(r) => setEditId(r.id)}
        toolbar={[
          <Can key="imp" module="dev" action="import">
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>导入</Button>
          </Can>,
          <Can key="exp" module="dev" action="export">
            <Button icon={<ExportOutlined />} onClick={() => exportXlsx('/dev-tasks/export', { filters: filterQuery }, '开发任务清单.xlsx')}>导出</Button>
          </Can>,
        ]}
        mobileCard={(item) => (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Space style={{ justifyContent: 'space-between', width: '100%' }}><strong>{item.task_code}</strong><StatusBadge status={item.status} /></Space>
            <div>{item.task_name}</div>
            {item.release_date && (
              <div style={{ fontSize: '11px', color: 'var(--radar-text-secondary)' }}>
                计划投产点：{item.release_date}
              </div>
            )}
            <Space size="small">
              {item.impl_system_name && (
                <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{item.impl_system_name}</Tag>
              )}
              <span>负责人：{item.owner || '—'}</span>
            </Space>
          </Space>
        )}
      />

      <Modal
        open={intakeOpen}
        title="开发承接"
        width={920}
        onCancel={() => setIntakeOpen(false)}
        onOk={doIntake}
        confirmLoading={saving}
        okText="承接"
        styles={{ body: { padding: '12px 0 0 0' } }}
        destroyOnHidden
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. 选择需求 */}
          <div className="form-section-card" style={{ marginBottom: 0 }}>
            <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>1. 选择需求</div>
            <div style={{ marginBottom: 8 }}>
              <Input.Search
                placeholder="搜索投产点、需求编号、需求标题、主责系统..."
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
                          <Radio checked={isSelected} />
                        </Space>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                          计划投产点：{r.release_date || '—'}
                        </div>
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

          {/* 2. 确认拆分开发任务 */}
          <div className="form-section-card" style={{ marginBottom: 0 }}>
            <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>2. 确认拆分开发任务</div>
            {selectedReq ? (
              <Spin spinning={loadingPreview}>
                {isMobile ? (
                  <List
                    dataSource={previewList}
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
                                <span style={{ color: 'var(--radar-text-secondary)', fontSize: 11 }}>({item.sysCode})</span>
                              </Space>
                              <Tag className={item.exists ? 'status-tag status-tag-final' : 'status-tag status-tag-in-progress'} style={{ margin: 0 }}>
                                {item.status}
                              </Tag>
                            </Space>
                            <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginTop: 4 }}>
                              角色：
                              <Tag className="status-tag" style={{
                                borderColor: item.role === '主责' ? 'var(--radar-primary)' : 'var(--radar-accent)',
                                color: item.role === '主责' ? 'var(--radar-primary)' : 'var(--radar-accent)',
                                background: item.role === '主责' ? 'var(--radar-primary-soft)' : 'var(--radar-accent-soft)',
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
                          </Space>
                        </Card>
                      );
                    }}
                  />
                ) : (
                  <Table
                    dataSource={previewList}
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
              <div className="lc-empty" style={{ padding: '24px 0' }}>请在上方选择一条需求进行承接</div>
            )}
          </div>
        </div>
      </Modal>

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

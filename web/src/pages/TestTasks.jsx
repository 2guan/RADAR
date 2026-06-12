/**
 * 文件：pages/TestTasks.jsx
 * 用途：测试管理。SIT/UAT/NFT/SEC 拆为 4 个独立页面，复用同一面板（TestPanel）：
 *       列表 + 测试承接 + 编辑（复用 TaskEditor）+ 历史。各页面对应侧栏"测试管理"子菜单。
 * 作者：hengguan
 */

import React, { useRef, useState, useMemo } from 'react';
import { Card, Button, Space, Modal, Form, Tag, Popconfirm, message, Table, Input, Spin, List, Radio, Checkbox } from 'antd';
import { ExperimentOutlined, EditOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import DataTable from '../components/DataTable.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import SystemSelect from '../components/SystemSelect.jsx';
import HistoryDrawer from '../components/HistoryDrawer.jsx';
import TaskEditor from '../components/editors/TaskEditor.jsx';
import Can from '../components/Can.jsx';
import { apiPost, apiDelete } from '../api/client.js';
import { useAppStore } from '../stores/app.js';
import { useResponsive } from '../hooks/useResponsive.js';
import ResizableTitle from '../components/ResizableTitle.jsx';

const TYPE_LABEL = { SIT: '应用组装测试', UAT: '用户测试', NFT: '非功能测试', SEC: '安全测试' };

function TestPanel({ testType }) {
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
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reqColWidths, setReqColWidths] = useState({});
  const [prevColWidths, setPrevColWidths] = useState({});

  const fetcher = (q) => apiPost('/test-tasks/list', { ...q, releasePointIds, testType });
  const onDelete = async (row) => { await apiDelete(`/test-tasks/${row.id}`); message.success('已删除'); tableRef.current?.reload(); };

  const openIntake = async () => {
    const res = await apiPost('/requirements/list', { releasePointIds, pageSize: 0 });
    const list = (res.list || []).filter(
      (r) => !r.release_stage_type || (r.release_stage_type !== 'in-progress' && r.release_stage_type !== 'final')
    );
    setReqList(list);
    setSearchText('');
    setSelectedReq(null);
    setPreviewData({ overall: [], split: [] });
    setSplitMode('overall');
    setSelectedNewSystems([]);
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
      } catch (err) {
        message.error(err.message || '加载预览失败');
      } finally {
        setLoadingPreview(false);
      }
    } else {
      setPreviewData({ overall: [], split: [] });
      setSelectedNewSystems([]);
    }
  };

  const handleSplitModeChange = (mode) => {
    setSplitMode(mode);
    const currentList = mode === 'overall' ? previewData.overall : previewData.split;
    const checkable = (currentList || []).filter(t => !t.exists).map(t => t.sysCode);
    setSelectedNewSystems(checkable);
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
      const res = await apiPost('/test-tasks/intake', {
        reqCode: selectedReq.req_code,
        testType,
        systems: selectedNewSystems,
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
          <Can module="test" action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => setEditId(row.id)} /></Can>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => setHistoryId(row.id)} />
          <Can module="test" action="delete"><Popconfirm title="确认删除？" onConfirm={() => onDelete(row)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Can>
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
    const relDate = (r.release_date || '').toLowerCase();
    const code = (r.req_code || '').toLowerCase();
    const title = (r.title || '').toLowerCase();
    const systems = (r.main_systems_names || []).join(',').toLowerCase();
    return relDate.includes(txt) || code.includes(txt) || title.includes(txt) || systems.includes(txt);
  });

  const currentPreviewList = splitMode === 'overall' ? previewData.overall : previewData.split;

  return (
    <>
      <DataTable
        ref={tableRef} columns={columns} fetcher={fetcher} baseQuery={{ releasePointIds, testType }} onRowClick={(r) => setEditId(r.id)}
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
        toolbar={[
          <Can key="intake" module="test" action="test.intake"><Button type="primary" icon={<ExperimentOutlined />} onClick={openIntake}>测试承接</Button></Can>,
        ]}
      />

      <Modal
        open={intakeOpen}
        title={`${TYPE_LABEL[testType]}承接`}
        width={920}
        onCancel={() => setIntakeOpen(false)}
        onOk={doIntake}
        confirmLoading={saving}
        okText="承接"
        styles={{ body: { padding: '12px 0 0 0' } }}
        destroyOnClose
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
              <div className="lc-empty" style={{ padding: '24px 0' }}>请在上方选择一条需求进行承接</div>
            )}
          </div>
        </div>
      </Modal>

      <TaskEditor open={!!editId} kind="test" taskId={editId} onClose={() => setEditId(null)} onSaved={() => tableRef.current?.reload()} />
      <HistoryDrawer open={!!historyId} entityType="test" entityId={historyId} onClose={() => setHistoryId(null)} />
    </>
  );
}

/** 4 个独立测试页面（对应侧栏"测试管理"子菜单） */
export function SitPage() {
  return <Card title="应用组装测试（SIT）" variant="borderless"><TestPanel testType="SIT" /></Card>;
}
export function UatPage() {
  return <Card title="用户测试（UAT）" variant="borderless"><TestPanel testType="UAT" /></Card>;
}
export function NftPage() {
  return <Card title="非功能测试（NFT）" variant="borderless"><TestPanel testType="NFT" /></Card>;
}
export function SecPage() {
  return <Card title="安全测试（SEC）" variant="borderless"><TestPanel testType="SEC" /></Card>;
}

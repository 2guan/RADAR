/**
 * 文件：web/src/modules/development/components/DevIntakeModal.jsx
 * 说明：开发承接的唯一前端流程，供开发管理和版本概览嵌入使用。
 * 用途：统一候选工作项、系统角色、实施方、负责人和提交校验，避免入口间规则漂移。
 * 作者：hengguan
 */
import { useEffect, useMemo, useState } from 'react';
import { Card, Checkbox, Input, List, Modal, Radio, Select, Space, Spin, Table, Tag, message } from 'antd';
import { useResponsive } from '../../../platform/ui/useResponsive.js';
import { useAppStore } from '../../../platform/state/app.js';
import { apiPost, apiGet } from '../api/index.js';

function normalizeWorkItem(item) {
  const mainSystemNames = item.main_systems_names
    || (item.mainSystemsInfo || []).map((system) => system.sys_name || system.sys_code)
    || [];
  return {
    ...item,
    entity_label: item.entity_label || (item.entity_type === 'ticket' ? '工单' : '需求'),
    main_systems_names: mainSystemNames,
  };
}

async function loadCandidates(releasePointIds) {
  const [requirementResponse, ticketResponse] = await Promise.all([
    apiPost('/requirements/list', { releasePointIds, pageSize: 0 }),
    apiPost('/tickets/list', { releasePointIds, pageSize: 0 }),
  ]);
  const candidates = [
    ...(requirementResponse.list || []).map((item) => normalizeWorkItem({ ...item, entity_type: 'requirement', entity_label: '需求' })),
    ...(ticketResponse.list || []).map((item) => normalizeWorkItem({
      ...item,
      req_code: item.ticket_code,
      entity_type: 'ticket',
      entity_label: '工单',
    })),
  ].filter((item) => !item.release_stage_type || (item.release_stage_type !== 'in-progress' && item.release_stage_type !== 'final'));
  const pendingCodes = await apiPost('/dev-tasks/intake-pending-codes', { reqCodes: candidates.map((item) => item.req_code) });
  return candidates.filter((item) => (pendingCodes || []).includes(item.req_code));
}

export default function DevIntakeModal({ open, onClose, onSaved, initialWorkItem = null }) {
  const { isMobile } = useResponsive();
  const releasePointIds = useAppStore((state) => state.releasePointIds);
  const [candidates, setCandidates] = useState([]);
  const [selectedWorkItem, setSelectedWorkItem] = useState(null);
  const [previewList, setPreviewList] = useState([]);
  const [selectedSystems, setSelectedSystems] = useState([]);
  const [owners, setOwners] = useState({});
  const [implementationOrgs, setImplementationOrgs] = useState({});
  const [orgOptions, setOrgOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [candidatePage, setCandidatePage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectWorkItem = async (item) => {
    const normalized = normalizeWorkItem(item);
    setSelectedWorkItem(normalized);
    setPreviewList([]);
    setSelectedSystems([]);
    setOwners({});
    setImplementationOrgs({});
    setLoading(true);
    try {
      const preview = await apiPost('/dev-tasks/intake-preview', { reqCode: normalized.req_code });
      const newItems = (preview || []).filter((row) => !row.exists);
      setPreviewList(preview || []);
      setSelectedSystems(newItems.map((row) => row.sysCode));
      setImplementationOrgs(Object.fromEntries(newItems
        .filter((row) => row.defaultImplOrg)
        .map((row) => [row.sysCode, row.defaultImplOrg])));
    } catch (error) {
      message.error(error.message || '加载预览失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    // 每次打开都清空上一次选择，避免从概览切换工作项时沿用旧系统、负责人或实施方。
    setSearchText('');
    setCandidatePage(1);
    setCandidates([]);
    setSelectedWorkItem(null);
    setPreviewList([]);
    setSelectedSystems([]);
    setOwners({});
    setImplementationOrgs({});
    Promise.all([apiGet('/dict/by-category/org'), apiGet('/users/active')])
      .then(([orgs, users]) => {
        if (!active) return;
        setOrgOptions((orgs || []).map((org) => ({ value: org.attr_value, label: org.display_value })));
        setUserOptions((users || []).map((user) => ({ value: user.name, label: `${user.name} (${user.phone})` })));
      })
      .catch(() => {});
    if (initialWorkItem) {
      selectWorkItem(initialWorkItem);
    } else {
      setLoading(true);
      loadCandidates(releasePointIds)
        .then((items) => { if (active) { setCandidates(items); setCandidatePage(1); } })
        .catch((error) => { if (active) message.error(error.message || '加载可承接需求/工单失败'); })
        .finally(() => { if (active) setLoading(false); });
    }
    return () => { active = false; };
  }, [open, initialWorkItem?.req_code, releasePointIds]);

  const updateRole = (sysCode, role) => {
    setPreviewList((current) => current.map((item) => {
      if (role === '主责') return { ...item, role: item.sysCode === sysCode ? '主责' : '协同' };
      return item.sysCode === sysCode ? { ...item, role } : item;
    }));
  };

  const submit = async () => {
    // 提交前在前端完整复核可编辑行；服务端仍会执行同一套角色和数据范围校验。
    if (!selectedWorkItem) return message.warning('请先选择需求/工单');
    if (!selectedSystems.length) return message.warning('请至少勾选一个需要新建的任务');
    if (selectedSystems.some((code) => !owners[code])) return message.warning('请为每个勾选的开发任务选择开发负责人');
    if (selectedSystems.some((code) => !implementationOrgs[code])) return message.warning('请为每个勾选的开发任务选择开发实施方');
    if (previewList.filter((item) => item.role === '主责').length !== 1) return message.warning('开发系统角色必须且只能选择一个主责系统');
    setSaving(true);
    try {
      const result = await apiPost('/dev-tasks/intake', {
        reqCode: selectedWorkItem.req_code,
        systemRoles: previewList.map((item) => ({ sysCode: item.sysCode, role: item.role })),
        assignments: selectedSystems.map((sysCode) => ({
          sysCode,
          owner: owners[sysCode],
          implOrg: implementationOrgs[sysCode],
        })),
      });
      message.success(`已成功承接 ${result.length} 个开发任务`);
      onSaved?.();
      onClose?.();
    } catch (error) {
      message.error(error.message || '承接失败');
    } finally {
      setSaving(false);
    }
  };

  const filteredCandidates = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return candidates;
    return candidates.filter((item) => [item.req_code, item.title, ...(item.main_systems_names || [])]
      .filter(Boolean).join(' ').toLowerCase().includes(keyword));
  }, [candidates, searchText]);
  const workItemColumns = [
    { title: '类型', dataIndex: 'entity_label', width: 70, render: (value) => <Tag className="status-tag" style={{ margin: 0 }}>{value}</Tag> },
    { title: '需求/工单编号', dataIndex: 'req_code', width: 150 },
    { title: '标题/概述', dataIndex: 'title', ellipsis: true },
    { title: '主责系统', dataIndex: 'main_systems_names', render: (names) => (names || []).join('、') || '—' },
  ];
  const previewColumns = [
    { title: '建立状态', dataIndex: 'status', width: 96, render: (value, row) => <Tag className={row.exists ? 'status-tag status-tag-final' : 'status-tag status-tag-in-progress'} style={{ margin: 0 }}>{value}</Tag> },
    { title: '实施系统', dataIndex: 'sysName', render: (value, row) => <span>{value} <span className="lc-muted">({row.sysCode})</span></span> },
    { title: '角色', dataIndex: 'role', width: 112, render: (value, row) => <Select value={value} options={[{ value: '主责', label: '主责' }, { value: '协同', label: '协同' }]} size="small" style={{ width: '100%' }} onChange={(role) => updateRole(row.sysCode, role)} /> },
    { title: '计划生成任务编号', dataIndex: 'taskCode', width: 174 },
    { title: '开发任务名称', dataIndex: 'taskName', ellipsis: true },
    { title: '开发实施方', width: 170, render: (_, row) => row.exists ? '—' : <Select value={implementationOrgs[row.sysCode]} options={orgOptions} placeholder="选择开发实施方" size="small" showSearch optionFilterProp="label" style={{ width: '100%' }} onChange={(value) => setImplementationOrgs((current) => ({ ...current, [row.sysCode]: value }))} /> },
    { title: '开发负责人', width: 180, render: (_, row) => row.exists ? row.owner || '—' : <Select value={owners[row.sysCode]} options={userOptions} placeholder="选择开发负责人" size="small" showSearch optionFilterProp="label" style={{ width: '100%' }} onChange={(value) => setOwners((current) => ({ ...current, [row.sysCode]: value }))} /> },
  ];

  const selectedCard = selectedWorkItem && (
    <Card size="small" style={{ borderColor: 'var(--radar-primary)', background: 'var(--radar-primary-soft)' }}>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space><strong>{selectedWorkItem.req_code}</strong><Tag className="status-tag" style={{ margin: 0 }}>{selectedWorkItem.entity_label}</Tag></Space>
        <span>{selectedWorkItem.title}</span>
      </Space>
    </Card>
  );

  return (
    <Modal open={open} title="开发承接" width={isMobile ? 'calc(100vw - 24px)' : 1180} onCancel={onClose} onOk={submit} confirmLoading={saving} okText="承接" styles={{ body: { padding: '12px 0 0' } }} destroyOnHidden>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="form-section-card" style={{ marginBottom: 0 }}>
          <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>1. 选择需求/工单</div>
          {initialWorkItem ? selectedCard : <>
            <Input.Search placeholder="需求/工单编号、标题/概述、主责系统检索..." value={searchText} onChange={(event) => { setSearchText(event.target.value); setCandidatePage(1); }} size="small" style={{ width: isMobile ? '100%' : 320, marginBottom: 8 }} allowClear />
            {isMobile ? <List loading={loading} dataSource={filteredCandidates} rowKey="req_code" pagination={filteredCandidates.length > 5 ? { current: candidatePage, pageSize: 5, total: filteredCandidates.length, size: 'small', showSizeChanger: false, onChange: setCandidatePage } : false} renderItem={(item) => <List.Item onClick={() => selectWorkItem(item)} style={{ cursor: 'pointer' }}><Radio checked={selectedWorkItem?.req_code === item.req_code} />&nbsp;<strong>{item.req_code}</strong>&nbsp;{item.title}</List.Item>} /> : <Table loading={loading} dataSource={filteredCandidates} columns={workItemColumns} rowKey="req_code" size="small" className="super-compact-table" pagination={{ pageSize: 5, size: 'small', showSizeChanger: false }} rowSelection={{ type: 'radio', selectedRowKeys: selectedWorkItem ? [selectedWorkItem.req_code] : [], onChange: (_, rows) => rows[0] && selectWorkItem(rows[0]) }} onRow={(item) => ({ onClick: () => selectWorkItem(item), style: { cursor: 'pointer' } })} />}
          </>}
        </div>
        <div className="form-section-card" style={{ marginBottom: 0 }}>
          <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>2. 确认拆分开发任务</div>
          {selectedWorkItem ? <Spin spinning={loading}>{isMobile ? <List dataSource={previewList} rowKey="sysCode" renderItem={(row) => <List.Item><Space direction="vertical" style={{ width: '100%' }}><Checkbox checked={selectedSystems.includes(row.sysCode)} disabled={row.exists} onChange={(event) => setSelectedSystems((current) => event.target.checked ? [...current, row.sysCode] : current.filter((code) => code !== row.sysCode))}>{row.sysName}</Checkbox><Select value={row.role} options={[{ value: '主责', label: '主责' }, { value: '协同', label: '协同' }]} size="small" onChange={(role) => updateRole(row.sysCode, role)} />{!row.exists && <><Select value={implementationOrgs[row.sysCode]} options={orgOptions} placeholder="选择开发实施方（必填）" size="small" onChange={(value) => setImplementationOrgs((current) => ({ ...current, [row.sysCode]: value }))} /><Select value={owners[row.sysCode]} options={userOptions} placeholder="选择开发负责人（必填）" size="small" onChange={(value) => setOwners((current) => ({ ...current, [row.sysCode]: value }))} /></>}</Space></List.Item>} /> : <Table dataSource={previewList} columns={previewColumns} rowKey="sysCode" size="small" className="super-compact-table" pagination={false} rowSelection={{ selectedRowKeys: selectedSystems, onChange: setSelectedSystems, getCheckboxProps: (row) => ({ disabled: row.exists }) }} />}</Spin> : <div className="lc-empty" style={{ padding: '24px 0' }}>请在上方选择一条需求/工单进行承接</div>}
        </div>
      </div>
    </Modal>
  );
}

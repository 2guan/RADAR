/**
 * 文件：components/editors/CoverageAnalysisModal.jsx
 * 用途：应用组装阶段「测试覆盖性分析」结构化填写弹窗（接近全屏）。
 *       头部展示需求/工单编号、名称、主责系统、协同系统；
 *       逐条列出开发阶段影响性分析条目（系统名称/变更类型/变更内容），
 *       右侧填写案例覆盖策略简述、测试覆盖检查结果、测试案例编号、测试人员。
 * 作者：hengguan
 * 说明：需先在开发阶段填写影响性分析，才能填写本表；无影响条目时给出提示。
 */

import React, { useEffect, useState } from 'react';
import { Modal, Button, Select, Input, Tag, Table, Spin, Empty, message, Card, Space, Tooltip } from 'antd';
import { apiGet, apiPost } from '../../api/client.js';
import { useResponsive } from '../../hooks/useResponsive.js';
import { COVERAGE_RESULTS } from '../../config/impactSchema.js';

// 覆盖登记字段校验规则（与后端 impact-schema.js 保持一致）
const COV_RULES = {
  strategy: { label: '案例覆盖策略简述', min: 5, max: 1000 },
  result: { label: '测试覆盖检查结果', enum: COVERAGE_RESULTS },
  case_no: { label: '测试案例编号', min: 5, max: 1000 },
  tester: { label: '测试人员', min: 2, max: 100 },
};

function validateRows(rows) {
  const errs = [];
  rows.forEach((r, idx) => {
    for (const [key, def] of Object.entries(COV_RULES)) {
      const val = r[key] == null ? '' : String(r[key]).trim();
      if (def.enum) { if (!def.enum.includes(val)) errs.push(`第 ${idx + 1} 条「${def.label}」请选择`); continue; }
      if (!val) { errs.push(`第 ${idx + 1} 条「${def.label}」不能为空`); continue; }
      if (def.min && val.length < def.min) errs.push(`第 ${idx + 1} 条「${def.label}」不少于 ${def.min} 个字`);
      if (def.max && val.length > def.max) errs.push(`第 ${idx + 1} 条「${def.label}」不大于 ${def.max} 个字`);
    }
  });
  return errs;
}

export default function CoverageAnalysisModal({ open, reqCode, readOnly, onClose, onSaved }) {
  const { isMobile } = useResponsive();
  const [header, setHeader] = useState(null);
  const [rows, setRows] = useState([]);
  const [hasImpact, setHasImpact] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !reqCode) return;
    setLoading(true);
    apiGet(`/coverage-analysis/${encodeURIComponent(reqCode)}`)
      .then((d) => {
        setHeader(d.header);
        setRows(d.rows || []);
        setHasImpact(!!d.hasImpact);
      })
      .catch((e) => message.error(e.message || '加载失败'))
      .finally(() => setLoading(false));
  }, [open, reqCode]);

  const patchRow = (cid, patch) => setRows((prev) => prev.map((r) => (r.change_item_id === cid ? { ...r, ...patch } : r)));

  const save = async () => {
    const errs = validateRows(rows);
    if (errs.length) { message.error(errs[0] + (errs.length > 1 ? ` 等 ${errs.length} 处` : '')); return; }
    setSaving(true);
    try {
      const payload = rows.map((r) => ({
        change_item_id: r.change_item_id, strategy: r.strategy, result: r.result, case_no: r.case_no, tester: r.tester,
      }));
      await apiPost(`/coverage-analysis/${encodeURIComponent(reqCode)}/save`, { rows: payload });
      message.success('已保存');
      onSaved?.();
    } catch (e) {
      message.error(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: '#', key: 'idx', width: 44, align: 'center', render: (_, __, i) => i + 1 },
    { title: '分类', dataIndex: 'category', width: 150, render: (v) => <Tag color="processing" style={{ margin: 0, borderRadius: 2 }}>{v}</Tag> },
    { title: '系统名称', dataIndex: 'system', width: 130, ellipsis: true, render: (v) => v || '—' },
    { title: '变更类型', dataIndex: 'change_kind', width: 80, align: 'center', render: (v) => v || '—' },
    { title: '变更内容', dataIndex: 'change_content', width: 220, render: (v) => <Tooltip title={v}><div style={{ maxHeight: 60, overflow: 'hidden' }}>{v || '—'}</div></Tooltip> },
    {
      title: '案例覆盖策略简述', dataIndex: 'strategy', width: 240,
      render: (v, r) => (
        <Input.TextArea size="small" value={v} readOnly={readOnly} autoSize={{ minRows: 1, maxRows: 4 }} maxLength={1000} showCount
          placeholder="不少于 5 个字" style={{ fontSize: 12 }} onChange={(e) => patchRow(r.change_item_id, { strategy: e.target.value })} />
      ),
    },
    {
      title: '测试覆盖检查结果', dataIndex: 'result', width: 120, align: 'center',
      render: (v, r) => (
        <Select size="small" style={{ width: '100%' }} value={v || undefined} placeholder="请选择" disabled={readOnly}
          options={COVERAGE_RESULTS.map((o) => ({ value: o, label: o }))} onChange={(val) => patchRow(r.change_item_id, { result: val })} />
      ),
    },
    {
      title: '测试案例编号', dataIndex: 'case_no', width: 200,
      render: (v, r) => (
        <Input.TextArea size="small" value={v} readOnly={readOnly} autoSize={{ minRows: 1, maxRows: 4 }} maxLength={1000} showCount
          placeholder="不少于 5 个字" style={{ fontSize: 12 }} onChange={(e) => patchRow(r.change_item_id, { case_no: e.target.value })} />
      ),
    },
    {
      title: '测试人员', dataIndex: 'tester', width: 130,
      render: (v, r) => (
        <Input size="small" value={v} readOnly={readOnly} maxLength={100} placeholder="姓名"
          onChange={(e) => patchRow(r.change_item_id, { tester: e.target.value })} />
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="应用组装阶段 · 测试覆盖性分析"
      width="94%"
      style={{ top: 16, maxWidth: 1500, paddingBottom: 0 }}
      styles={{ body: { padding: '12px 16px', maxHeight: 'calc(100vh - 160px)', overflow: 'auto' } }}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>{readOnly ? '关闭' : '取消'}</Button>,
        !readOnly && hasImpact && <Button key="save" type="primary" loading={saving} onClick={save}>保存</Button>,
      ].filter(Boolean)}
    >
      <Spin spinning={loading}>
        {header && (
          <div className="form-section-card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 24px', fontSize: 12 }}>
              <HeaderField label={`${header.entity_label || '需求'}编号`} value={<b style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{header.req_code}</b>} />
              <HeaderField label={`${header.entity_label || '需求'}名称`} value={header.title || '—'} />
              <HeaderField label="主责系统" value={<SysTags names={header.main_system_names} />} />
              <HeaderField label="协同系统" value={<SysTags names={header.collab_system_names} />} />
            </div>
          </div>
        )}

        {!hasImpact ? (
          <Empty description="请先在开发阶段填写影响性分析后，再填写测试覆盖性分析" />
        ) : rows.length === 0 ? (
          <Empty description="暂无影响性分析条目" />
        ) : isMobile ? (
          <Space direction="vertical" size={8} style={{ width: '100%' }}>
            {rows.map((r, idx) => (
              <Card key={r.change_item_id} size="small">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, color: 'var(--radar-text-secondary)', fontSize: 12 }}>#{idx + 1}</span>
                  <Tag color="processing" style={{ margin: 0, borderRadius: 2 }}>{r.category}</Tag>
                  <span style={{ fontSize: 12 }}>{r.system} · {r.change_kind}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--radar-text-secondary)', marginBottom: 8 }}>变更内容：{r.change_content}</div>
                <MobileField label="案例覆盖策略简述">
                  <Input.TextArea size="small" value={r.strategy} readOnly={readOnly} autoSize={{ minRows: 1, maxRows: 4 }} maxLength={1000} showCount
                    placeholder="不少于 5 个字" onChange={(e) => patchRow(r.change_item_id, { strategy: e.target.value })} />
                </MobileField>
                <MobileField label="测试覆盖检查结果">
                  <Select size="small" style={{ width: '100%' }} value={r.result || undefined} placeholder="请选择" disabled={readOnly}
                    options={COVERAGE_RESULTS.map((o) => ({ value: o, label: o }))} onChange={(val) => patchRow(r.change_item_id, { result: val })} />
                </MobileField>
                <MobileField label="测试案例编号">
                  <Input.TextArea size="small" value={r.case_no} readOnly={readOnly} autoSize={{ minRows: 1, maxRows: 4 }} maxLength={1000} showCount
                    placeholder="不少于 5 个字" onChange={(e) => patchRow(r.change_item_id, { case_no: e.target.value })} />
                </MobileField>
                <MobileField label="测试人员">
                  <Input size="small" value={r.tester} readOnly={readOnly} maxLength={100} placeholder="姓名"
                    onChange={(e) => patchRow(r.change_item_id, { tester: e.target.value })} />
                </MobileField>
              </Card>
            ))}
          </Space>
        ) : (
          <Table
            dataSource={rows}
            columns={columns}
            rowKey="change_item_id"
            size="small"
            className="super-compact-table"
            pagination={false}
            scroll={{ x: 'max-content' }}
          />
        )}
      </Spin>
    </Modal>
  );
}

function HeaderField({ label, value }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color: 'var(--radar-text-secondary)' }}>{label}：</span>
      <span>{value}</span>
    </span>
  );
}

function SysTags({ names }) {
  if (!names?.length) return <span style={{ color: 'var(--radar-text-secondary)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
      {names.map((n) => <Tag key={n} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{n}</Tag>)}
    </span>
  );
}

function MobileField({ label, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  );
}

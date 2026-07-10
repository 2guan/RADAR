/**
 * 文件：components/editors/CoverageAnalysisModal.jsx
 * 用途：应用组装阶段「测试覆盖性分析」结构化填写弹窗（接近全屏）。
 *       头部展示需求/工单编号、名称、主责系统、协同系统；逐条列出开发阶段影响性分析条目
 *       （系统名称/变更类型/变更内容），右侧填写案例覆盖策略简述、测试覆盖检查结果、
 *       测试案例编号、测试人员。逐条编辑/保存，保存后转为展示态，点「修改」回到编辑态。
 * 作者：hengguan
 * 说明：需先在开发阶段填写影响性分析，才能填写本表；无影响条目时给出提示。
 */

import React, { useEffect, useState } from 'react';
import { Modal, Button, Select, Input, Tag, Spin, Empty, message, Row, Col } from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { apiGet, apiPut } from '../../api/client.js';
import AnalysisHeader from './AnalysisHeader.jsx';
import { COVERAGE_RESULTS } from '../../config/impactSchema.js';

// 覆盖登记字段（与后端 impact-schema.js 一致），col 为 24 栅格列宽，保证等宽
const COV_FIELDS = [
  { key: 'result', label: '测试覆盖检查结果', type: 'result', col: 8 },
  { key: 'tester', label: '测试人员', type: 'input', col: 8, min: 2, max: 100 },
  { key: 'strategy', label: '案例覆盖策略简述', type: 'text', col: 24, rows: 3, min: 5, max: 1000 },
  { key: 'case_no', label: '测试案例编号', type: 'text', col: 24, rows: 2, min: 5, max: 1000 },
];

function validateRow(r) {
  const errs = [];
  for (const def of COV_FIELDS) {
    const val = r[def.key] == null ? '' : String(r[def.key]).trim();
    if (def.type === 'result') { if (!COVERAGE_RESULTS.includes(val)) errs.push(`「${def.label}」请选择`); continue; }
    if (!val) { errs.push(`「${def.label}」不能为空`); continue; }
    if (def.min && val.length < def.min) errs.push(`「${def.label}」不少于 ${def.min} 个字`);
    if (def.max && val.length > def.max) errs.push(`「${def.label}」不大于 ${def.max} 个字`);
  }
  return errs;
}

export default function CoverageAnalysisModal({ open, reqCode, readOnly, onClose, onSaved }) {
  const [header, setHeader] = useState(null);
  const [rows, setRows] = useState([]);
  const [hasImpact, setHasImpact] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const reload = () => {
    setLoading(true);
    apiGet(`/coverage-analysis/${encodeURIComponent(reqCode)}`)
      .then((d) => {
        setHeader(d.header);
        setHasImpact(!!d.hasImpact);
        // 未登记的行默认进入编辑态，方便填写
        setRows((d.rows || []).map((r) => ({ ...r, _editing: !r.saved, _snapshot: null })));
      })
      .catch((e) => message.error(e.message || '加载失败'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (open && reqCode) reload(); /* eslint-disable-next-line */ }, [open, reqCode]);

  const patch = (cid, p) => setRows((prev) => prev.map((r) => (r.change_item_id === cid ? { ...r, ...p } : r)));
  const startEdit = (cid) => setRows((prev) => prev.map((r) => (r.change_item_id === cid
    ? { ...r, _editing: true, _snapshot: { strategy: r.strategy, result: r.result, case_no: r.case_no, tester: r.tester } } : r)));
  const cancelEdit = (cid) => setRows((prev) => prev.map((r) => (r.change_item_id === cid && r._snapshot
    ? { ...r, _editing: false, ...r._snapshot, _snapshot: null } : r)));

  const saveRow = async (row) => {
    const errs = validateRow(row);
    if (errs.length) { message.error(errs[0] + (errs.length > 1 ? ` 等 ${errs.length} 处` : '')); return; }
    setBusyId(row.change_item_id);
    try {
      await apiPut(`/coverage-analysis/items/${row.change_item_id}`, {
        strategy: row.strategy, result: row.result, case_no: row.case_no, tester: row.tester,
      });
      setRows((prev) => prev.map((r) => (r.change_item_id === row.change_item_id ? { ...r, saved: true, _editing: false, _snapshot: null } : r)));
      message.success('已保存');
      onSaved?.();
    } catch (e) {
      message.error(e.message || '保存失败');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="应用组装阶段 · 测试覆盖性分析"
      width="94%"
      style={{ top: 16, maxWidth: 1440, paddingBottom: 0 }}
      styles={{ body: { padding: '12px 16px', maxHeight: 'calc(100vh - 150px)', overflow: 'auto' } }}
      destroyOnHidden
      footer={[<Button key="close" onClick={onClose}>{readOnly ? '关闭' : '完成'}</Button>]}
    >
      <Spin spinning={loading}>
        <AnalysisHeader header={header} />

        {!hasImpact ? (
          <Empty description="请先在开发阶段填写影响性分析后，再填写测试覆盖性分析" style={{ padding: '32px 0' }} />
        ) : rows.length === 0 ? (
          <Empty description="暂无影响性分析条目" style={{ padding: '32px 0' }} />
        ) : (
          rows.map((row, idx) => (
            <CoverageCard
              key={row.change_item_id}
              index={idx}
              row={row}
              readOnly={readOnly}
              busy={busyId === row.change_item_id}
              onPatch={(p) => patch(row.change_item_id, p)}
              onEdit={() => startEdit(row.change_item_id)}
              onCancel={() => cancelEdit(row.change_item_id)}
              onSave={() => saveRow(row)}
            />
          ))
        )}
      </Spin>
    </Modal>
  );
}

/** 单条覆盖卡片：上部展示影响条目，下部编辑/展示覆盖登记 */
function CoverageCard({ index, row, readOnly, busy, onPatch, onEdit, onCancel, onSave }) {
  const editing = row._editing;
  return (
    <div className="form-section-card" style={{ marginBottom: 12, padding: '10px 14px' }}>
      {/* 影响条目（只读）+ 操作 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, color: 'var(--radar-primary)', fontSize: 12 }}>#{index + 1}</span>
        <Tag color="processing" style={{ margin: 0, borderRadius: 2 }}>{row.category}</Tag>
        {row.system && <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{row.system}</Tag>}
        {row.change_kind && <span style={{ fontSize: 12, color: 'var(--radar-text-secondary)' }}>{row.change_kind}</span>}
        {!editing && (row.saved
          ? <Tag className="status-tag" style={{ margin: 0, borderColor: row.result === '已覆盖' ? 'var(--radar-success, #52c41a)' : 'var(--radar-error, #ff4d4f)', color: row.result === '已覆盖' ? 'var(--radar-success, #52c41a)' : 'var(--radar-error, #ff4d4f)' }}>{row.result || '未登记'}</Tag>
          : <Tag className="status-tag status-tag-error" style={{ margin: 0 }}>未登记</Tag>)}
        <div style={{ flex: 1 }} />
        {!readOnly && (editing ? (
          <>
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={busy} onClick={onSave}>保存</Button>
            {row._snapshot && <Button size="small" type="text" icon={<CloseOutlined />} onClick={onCancel}>取消</Button>}
          </>
        ) : (
          <Button size="small" type="link" icon={<EditOutlined />} onClick={onEdit} style={{ padding: '0 6px' }}>修改</Button>
        ))}
      </div>

      {/* 变更内容（只读） */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 3 }}>变更内容</div>
        <div style={{ fontSize: 12, color: 'var(--radar-ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{row.change_content || '—'}</div>
      </div>

      {/* 覆盖登记字段 */}
      <Row gutter={[12, editing ? 10 : 8]}>
        {COV_FIELDS.map((def) => (
          <Col key={def.key} xs={24} md={def.col}>
            <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 3 }}>{def.label}</div>
            {editing
              ? <CovControl def={def} value={row[def.key]} onChange={(v) => onPatch({ [def.key]: v })} />
              : <CovValue def={def} value={row[def.key]} />}
          </Col>
        ))}
      </Row>
    </div>
  );
}

function CovControl({ def, value, onChange }) {
  if (def.type === 'result') {
    return <Select size="small" style={{ width: '100%' }} placeholder="请选择" value={value || undefined} onChange={onChange}
      options={COVERAGE_RESULTS.map((o) => ({ value: o, label: o }))} />;
  }
  if (def.type === 'input') {
    return <Input size="small" value={value} maxLength={def.max} placeholder="姓名" onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <Input.TextArea size="small" value={value} onChange={(e) => onChange(e.target.value)}
      autoSize={{ minRows: def.rows || 2, maxRows: 8 }} maxLength={def.max} showCount
      placeholder={def.min ? `不少于 ${def.min} 个字` : '请输入'} style={{ fontSize: 12 }} />
  );
}

function CovValue({ def, value }) {
  if (def.type === 'result') {
    if (!value) return <span style={{ color: 'var(--radar-text-secondary)', fontSize: 12 }}>—</span>;
    const ok = value === '已覆盖';
    return <Tag className="status-tag" style={{ margin: 0, borderColor: ok ? 'var(--radar-success, #52c41a)' : 'var(--radar-error, #ff4d4f)', color: ok ? 'var(--radar-success, #52c41a)' : 'var(--radar-error, #ff4d4f)' }}>{value}</Tag>;
  }
  if (def.type === 'input') {
    return <span style={{ fontSize: 12 }}>{value || '—'}</span>;
  }
  return (
    <div style={{ fontSize: 12, color: 'var(--radar-ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
      {value || <span style={{ color: 'var(--radar-text-secondary)' }}>—</span>}
    </div>
  );
}

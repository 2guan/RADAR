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
import { Modal, Button, Select, Input, Tag, Spin, Empty, message, Row, Col, Tooltip } from 'antd';
import { EditOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { apiGet, apiPut } from '../../api/client.js';
import AnalysisHeader from './AnalysisHeader.jsx';
import { COVERAGE_RESULTS, FIELD_DEFS, visibleFieldsOf, valueTagClass } from '../../config/impactSchema.js';

// 覆盖登记字段（与后端 impact-schema.js 一致），col 为 24 栅格列宽，保证等宽
const COV_FIELDS = [
  { key: 'strategy', label: '案例覆盖策略简述', type: 'text', col: 24, rows: 6, min: 5, max: 1000, placeholder: '说明测试场景、覆盖范围及验证重点', validationHint: '补充测试场景、覆盖范围及验证重点' },
  { key: 'case_no', label: '测试案例编号', type: 'text', col: 24, rows: 2, min: 5, max: 1000, placeholder: '填写关联的测试案例编号，多个编号用逗号分隔', validationHint: '填写关联的测试案例编号' },
  { key: 'tester', label: '测试人员', type: 'input', col: 12, min: 2, max: 100, placeholder: '填写实际执行测试的人员姓名', validationHint: '填写实际执行测试的人员姓名' },
  { key: 'result', label: '测试覆盖检查结果', type: 'result', col: 12 },
];

function validateRow(r) {
  const errs = [];
  for (const def of COV_FIELDS) {
    const val = r[def.key] == null ? '' : String(r[def.key]).trim();
    if (def.type === 'result') { if (!COVERAGE_RESULTS.includes(val)) errs.push(`「${def.label}」请选择`); continue; }
    if (!val) { errs.push(`「${def.label}」不能为空`); continue; }
    if (def.min && val.length < def.min) errs.push(`「${def.label}」请${def.validationHint || '补充完整内容'}`);
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

/** 单条覆盖卡片：左侧完整展示影响条目，右侧登记测试覆盖信息。 */
function CoverageCard({ index, row, readOnly, busy, onPatch, onEdit, onCancel, onSave }) {
  const editing = row._editing;
  const impactFields = visibleFieldsOf(row);
  return (
    <div className="form-section-card analysis-card coverage-analysis-card">
      <div className="analysis-card-header">
        <span className="analysis-card-index">#{index + 1}</span>
        <span className="analysis-card-category">{row.category}</span>
        {!editing && (row.saved && row.result
          ? <Tag className={`status-tag ${row.result === '已覆盖' ? 'status-tag-final' : 'status-tag-initial'}`} style={{ margin: 0 }}>{row.result}</Tag>
          : <Tag className="status-tag status-tag-not-started" style={{ margin: 0 }}>未登记</Tag>)}
        <div className="analysis-card-spacer" />
        {!readOnly && (editing ? (
          <>
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={busy} onClick={onSave}>保存</Button>
            {row._snapshot && <Button size="small" type="text" icon={<CloseOutlined />} onClick={onCancel}>取消</Button>}
          </>
        ) : (
          <Tooltip title="修改"><Button size="small" type="link" icon={<EditOutlined />} onClick={onEdit} aria-label="修改" style={{ padding: '0 6px' }} /></Tooltip>
        ))}
      </div>

      <div className="coverage-card-grid">
        <section className="analysis-pane analysis-pane-impact">
          <div className="analysis-pane-title">影响性分析</div>
          <Row gutter={[12, 10]}>
            {impactFields.map((key) => {
              const def = FIELD_DEFS[key];
              return (
                <Col key={key} xs={24} md={def.col}>
                  <div className="analysis-field-label">{def.label}</div>
                  <ImpactValue def={def} value={row[key]} />
                </Col>
              );
            })}
          </Row>
        </section>

        <section className="analysis-pane analysis-pane-coverage">
          <div className="analysis-pane-title">测试覆盖分析</div>
          <Row gutter={[12, editing ? 10 : 8]}>
            {COV_FIELDS.map((def) => (
              <Col key={def.key} xs={24} md={def.col}>
                <div className="analysis-field-label">{def.label}</div>
                {editing
                  ? <CovControl def={def} value={row[def.key]} onChange={(v) => onPatch({ [def.key]: v })} />
                  : <CovValue def={def} value={row[def.key]} />}
              </Col>
            ))}
          </Row>
        </section>
      </div>
    </div>
  );
}

function ImpactValue({ def, value }) {
  if (def.type === 'system') {
    return value
      ? <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{value}</Tag>
      : <EmptyValue />;
  }
  if (def.type === 'systems') {
    const names = Array.isArray(value) ? value : [];
    return names.length
      ? <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>{names.map((name) => <Tag key={name} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{name}</Tag>)}</span>
      : <EmptyValue />;
  }
  if (def.type === 'yesno' || def.type === 'kind') {
    return value
      ? <Tag className={`status-tag ${valueTagClass(def.type, value)}`} style={{ borderRadius: 2, margin: 0 }}>{value}</Tag>
      : <EmptyValue />;
  }
  return <div className="analysis-value analysis-value-text">{value || <EmptyValue />}</div>;
}

function EmptyValue() {
  return <span className="analysis-empty-value">—</span>;
}

function CovControl({ def, value, onChange }) {
  if (def.type === 'result') {
    return <Select size="small" style={{ width: '100%' }} popupClassName="analysis-select-dropdown" placeholder="选择测试覆盖检查结果" value={value || undefined} onChange={onChange}
      options={COVERAGE_RESULTS.map((o) => ({ value: o, label: o }))} />;
  }
  if (def.type === 'input') {
    return <Input size="small" value={value} maxLength={def.max} placeholder={def.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <Input.TextArea size="small" value={value} onChange={(e) => onChange(e.target.value)}
      autoSize={{ minRows: def.rows || 2, maxRows: 8 }} maxLength={def.max} showCount
      placeholder={def.placeholder || `填写${def.label}`} />
  );
}

function CovValue({ def, value }) {
  if (def.type === 'result') {
    if (!value) return <span style={{ color: 'var(--radar-text-secondary)', fontSize: 12 }}>—</span>;
    const ok = value === '已覆盖';
    return <Tag className={`status-tag ${ok ? 'status-tag-final' : 'status-tag-initial'}`} style={{ margin: 0 }}>{value}</Tag>;
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

/**
 * 文件：components/editors/ImpactAnalysisModal.jsx
 * 用途：开发阶段「影响性分析」结构化填写弹窗（接近全屏）。
 *       头部展示需求/工单编号、名称、主责系统、协同系统；「添加变更内容」按分类新增条目；
 *       每条支持逐条编辑/保存/删除，保存后转为展示态，点「修改」回到编辑态。
 *       同一字段在不同分类中保持一致列宽，整体与开发任务详情页风格统一。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import { Modal, Button, Dropdown, Select, Input, Tag, Empty, Spin, message, Popconfirm, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { apiGet, apiPost, apiPut, apiDelete } from '../../api/client.js';
import { useResponsive } from '../../hooks/useResponsive.js';
import SystemNameInput, { SystemNamesSelect } from '../SystemNameInput.jsx';
import AnalysisHeader from './AnalysisHeader.jsx';
import {
  CHANGE_CATEGORIES, FIELD_DEFS, CHANGE_KINDS, YES_NO, visibleFieldsOf, validateItem,
} from '../../config/impactSchema.js';

let _seq = 1;
const uid = () => `k${_seq++}`;

// 新增条目的默认值
function makeValues(category, defaultSystem) {
  return {
    category, system: defaultSystem || '', change_kind: undefined,
    change_content: '', artifact: '', impact_analysis: '',
    involve_other: '否', involve_other_systems: [],
    upstream_impact: '', data_impact: '',
    job_chain_change: '否', job_chain_change_detail: '',
    updown_dep_change: '否', updown_dep_change_detail: '',
    runtime_change: '否', runtime_change_detail: '',
  };
}

export default function ImpactAnalysisModal({ open, reqCode, readOnly, onClose, onSaved }) {
  const { isMobile } = useResponsive();
  const [header, setHeader] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState(null);

  const reload = () => {
    setLoading(true);
    apiGet(`/impact-analysis/${encodeURIComponent(reqCode)}`)
      .then((d) => {
        setHeader(d.header);
        setCards((d.items || []).map((it) => ({ _key: uid(), id: it.id, editing: false, values: { ...makeValues(it.category), ...it } })));
      })
      .catch((e) => message.error(e.message || '加载失败'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (open && reqCode) reload(); /* eslint-disable-next-line */ }, [open, reqCode]);

  const defaultSystem = header?.main_system_names?.[0] || '';

  const addCard = (category) =>
    setCards((prev) => [...prev, { _key: uid(), id: null, editing: true, values: makeValues(category, defaultSystem) }]);

  const patch = (key, p) =>
    setCards((prev) => prev.map((c) => (c._key === key ? { ...c, values: { ...c.values, ...p } } : c)));

  const startEdit = (key) =>
    setCards((prev) => prev.map((c) => (c._key === key ? { ...c, editing: true, snapshot: { ...c.values } } : c)));

  const cancelEdit = (card) => {
    if (card.id == null) { setCards((prev) => prev.filter((c) => c._key !== card._key)); return; }
    setCards((prev) => prev.map((c) => (c._key === card._key ? { ...c, editing: false, values: c.snapshot || c.values, snapshot: undefined } : c)));
  };

  const saveCard = async (card) => {
    const errs = validateItem(card.values);
    if (errs.length) { message.error(errs[0] + (errs.length > 1 ? ` 等 ${errs.length} 处` : '')); return; }
    setBusyKey(card._key);
    try {
      const saved = card.id == null
        ? await apiPost(`/impact-analysis/${encodeURIComponent(reqCode)}/items`, card.values)
        : await apiPut(`/impact-analysis/items/${card.id}`, card.values);
      setCards((prev) => prev.map((c) => (c._key === card._key
        ? { _key: c._key, id: saved.id, editing: false, values: { ...makeValues(saved.category), ...saved } }
        : c)));
      message.success('已保存');
      onSaved?.();
    } catch (e) {
      message.error(e.message || '保存失败');
    } finally {
      setBusyKey(null);
    }
  };

  const removeCard = async (card) => {
    if (card.id == null) { setCards((prev) => prev.filter((c) => c._key !== card._key)); return; }
    setBusyKey(card._key);
    try {
      await apiDelete(`/impact-analysis/items/${card.id}`);
      setCards((prev) => prev.filter((c) => c._key !== card._key));
      message.success('已删除');
      onSaved?.();
    } catch (e) {
      message.error(e.message || '删除失败');
    } finally {
      setBusyKey(null);
    }
  };

  const categoryMenu = {
    items: CHANGE_CATEGORIES.map((c) => ({ key: c, label: c })),
    onClick: ({ key }) => addCard(key),
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="开发阶段 · 影响性分析"
      width="94%"
      style={{ top: 16, maxWidth: 1440, paddingBottom: 0 }}
      styles={{ body: { padding: '12px 16px', maxHeight: 'calc(100vh - 150px)', overflow: 'auto' } }}
      destroyOnHidden
      footer={[<Button key="close" onClick={onClose}>{readOnly ? '关闭' : '完成'}</Button>]}
    >
      <Spin spinning={loading}>
        <AnalysisHeader header={header} />

        {!readOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '0 0 12px' }}>
            <Dropdown menu={categoryMenu} trigger={['click']}>
              <Button type="primary" size="small" icon={<PlusOutlined />}>添加变更内容</Button>
            </Dropdown>
            <span style={{ fontSize: 12, color: 'var(--radar-text-secondary)' }}>共 {cards.length} 条变更内容</span>
          </div>
        )}

        {cards.length === 0 ? (
          <Empty description={readOnly ? '暂无影响性分析条目' : '点击「添加变更内容」新增条目'} style={{ padding: '32px 0' }} />
        ) : (
          cards.map((card, idx) => (
            <ChangeItemCard
              key={card._key}
              index={idx}
              card={card}
              readOnly={readOnly}
              isMobile={isMobile}
              busy={busyKey === card._key}
              onPatch={(p) => patch(card._key, p)}
              onEdit={() => startEdit(card._key)}
              onCancel={() => cancelEdit(card)}
              onSave={() => saveCard(card)}
              onRemove={() => removeCard(card)}
            />
          ))
        )}
      </Spin>
    </Modal>
  );
}

/** 单条变更内容卡片：编辑态用表单控件、展示态用只读呈现，字段按分类等宽栅格排列 */
function ChangeItemCard({ index, card, readOnly, isMobile, busy, onPatch, onEdit, onCancel, onSave, onRemove }) {
  const { values, editing } = card;
  const fields = visibleFieldsOf(values);

  return (
    <div className="form-section-card" style={{ marginBottom: 12, padding: '10px 14px' }}>
      {/* 卡片头：序号 + 分类 + 操作 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: editing ? 10 : 6 }}>
        <span style={{ fontWeight: 700, color: 'var(--radar-primary)', fontSize: 12 }}>#{index + 1}</span>
        <Tag color="processing" style={{ margin: 0, borderRadius: 2 }}>{values.category}</Tag>
        <div style={{ flex: 1 }} />
        {!readOnly && (editing ? (
          <>
            <Button size="small" type="primary" icon={<SaveOutlined />} loading={busy} onClick={onSave}>保存</Button>
            {card.id == null ? (
              <Popconfirm title="放弃该条目？" onConfirm={onCancel}>
                <Button size="small" type="text" icon={<CloseOutlined />}>取消</Button>
              </Popconfirm>
            ) : (
              <Button size="small" type="text" icon={<CloseOutlined />} onClick={onCancel}>取消</Button>
            )}
          </>
        ) : (
          <>
            <Button size="small" type="link" icon={<EditOutlined />} onClick={onEdit} style={{ padding: '0 6px' }}>修改</Button>
            <Popconfirm title="确认删除该条目？" onConfirm={onRemove}>
              <Button size="small" type="link" danger icon={<DeleteOutlined />} loading={busy} style={{ padding: '0 6px' }}>删除</Button>
            </Popconfirm>
          </>
        ))}
      </div>

      <Row gutter={[12, editing ? 10 : 8]}>
        {fields.map((key) => {
          const def = FIELD_DEFS[key];
          return (
            <Col key={key} xs={24} md={def.col}>
              <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {def.label}
              </div>
              {editing
                ? <FieldControl def={def} value={values[key]} onChange={(v) => onPatch({ [key]: v })} />
                : <FieldValue def={def} value={values[key]} />}
            </Col>
          );
        })}
      </Row>
    </div>
  );
}

/** 编辑态控件 */
function FieldControl({ def, value, onChange }) {
  if (def.type === 'system') return <SystemNameInput value={value} onChange={onChange} />;
  if (def.type === 'systems') return <SystemNamesSelect value={value} onChange={onChange} />;
  if (def.type === 'kind') {
    return <Select size="small" style={{ width: '100%' }} placeholder="请选择" value={value || undefined} onChange={onChange}
      options={CHANGE_KINDS.map((k) => ({ value: k, label: k }))} />;
  }
  if (def.type === 'yesno') {
    return <Select size="small" style={{ width: '100%' }} placeholder="请选择" value={value || undefined} onChange={onChange}
      options={YES_NO.map((k) => ({ value: k, label: k }))} />;
  }
  return (
    <Input.TextArea
      size="small" value={value} onChange={(e) => onChange(e.target.value)}
      autoSize={{ minRows: def.rows || 2, maxRows: 8 }} maxLength={def.max} showCount={!!def.max}
      placeholder={def.min ? `不少于 ${def.min} 个字` : '请输入'} style={{ fontSize: 12 }}
    />
  );
}

/** 展示态呈现 */
function FieldValue({ def, value }) {
  if (def.type === 'system') {
    return value
      ? <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{value}</Tag>
      : <span style={{ color: 'var(--radar-text-secondary)', fontSize: 12 }}>—</span>;
  }
  if (def.type === 'systems') {
    const arr = Array.isArray(value) ? value : [];
    return arr.length
      ? <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>{arr.map((n) => <Tag key={n} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{n}</Tag>)}</span>
      : <span style={{ color: 'var(--radar-text-secondary)', fontSize: 12 }}>—</span>;
  }
  if (def.type === 'yesno') {
    return <span style={{ fontSize: 12, fontWeight: 500, color: value === '是' ? 'var(--radar-primary)' : 'var(--radar-ink)' }}>{value || '—'}</span>;
  }
  if (def.type === 'kind') {
    return <span style={{ fontSize: 12 }}>{value || '—'}</span>;
  }
  return (
    <div style={{ fontSize: 12, color: 'var(--radar-ink)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>
      {value || <span style={{ color: 'var(--radar-text-secondary)' }}>—</span>}
    </div>
  );
}

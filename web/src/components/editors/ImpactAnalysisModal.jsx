/**
 * 文件：components/editors/ImpactAnalysisModal.jsx
 * 用途：开发阶段「影响性分析」结构化填写弹窗（接近全屏）。
 *       头部展示需求/工单编号、名称、主责系统、协同系统；
 *       「添加变更内容」按分类新增条目，PC 端每个模块尽量一行内展示全部字段。
 * 作者：hengguan
 * 说明：按需求/工单（reqCode）级别存取，多条变更条目一次性保存（整表替换语义）。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Dropdown, Select, Input, Tag, Empty, Spin, message, Popconfirm, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { apiGet, apiPost } from '../../api/client.js';
import { useResponsive } from '../../hooks/useResponsive.js';
import SystemNameInput, { SystemNamesSelect } from '../SystemNameInput.jsx';
import {
  CHANGE_CATEGORIES, CATEGORY_FIELDS, FIELD_DEFS, CHANGE_KINDS, YES_NO, validateItems,
} from '../../config/impactSchema.js';

let _seq = 1;
const uid = () => `k${_seq++}`;

// 新增条目的默认值
function makeItem(category, defaultSystem) {
  return {
    _key: uid(), category, system: defaultSystem || '', change_kind: undefined,
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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !reqCode) return;
    setLoading(true);
    apiGet(`/impact-analysis/${encodeURIComponent(reqCode)}`)
      .then((d) => {
        setHeader(d.header);
        setItems((d.items || []).map((it) => ({ ...makeItem(it.category), ...it, _key: uid() })));
      })
      .catch((e) => message.error(e.message || '加载失败'))
      .finally(() => setLoading(false));
  }, [open, reqCode]);

  const defaultSystem = header?.main_system_names?.[0] || '';

  const addItem = (category) => setItems((prev) => [...prev, makeItem(category, defaultSystem)]);
  const removeItem = (key) => setItems((prev) => prev.filter((it) => it._key !== key));
  const patchItem = (key, patch) => setItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));

  const save = async () => {
    const errs = validateItems(items);
    if (errs.length) {
      message.error(errs[0] + (errs.length > 1 ? ` 等 ${errs.length} 处` : ''));
      return;
    }
    setSaving(true);
    try {
      const payload = items.map(({ _key, ...rest }) => rest);
      const d = await apiPost(`/impact-analysis/${encodeURIComponent(reqCode)}/save`, { items: payload });
      message.success('已保存');
      setItems((d.items || []).map((it) => ({ ...makeItem(it.category), ...it, _key: uid() })));
      onSaved?.(d.items || []);
    } catch (e) {
      message.error(e.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const categoryMenu = {
    items: CHANGE_CATEGORIES.map((c) => ({ key: c, label: c })),
    onClick: ({ key }) => addItem(key),
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="开发阶段 · 影响性分析"
      width="94%"
      style={{ top: 16, maxWidth: 1500, paddingBottom: 0 }}
      styles={{ body: { padding: '12px 16px', maxHeight: 'calc(100vh - 160px)', overflow: 'auto' } }}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>{readOnly ? '关闭' : '取消'}</Button>,
        !readOnly && <Button key="save" type="primary" loading={saving} onClick={save}>保存</Button>,
      ].filter(Boolean)}
    >
      <Spin spinning={loading}>
        {/* 头部信息 */}
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

        {/* 工具条 */}
        {!readOnly && (
          <div style={{ marginBottom: 12 }}>
            <Dropdown menu={categoryMenu} trigger={['click']}>
              <Button type="primary" size="small" icon={<PlusOutlined />}>添加变更内容</Button>
            </Dropdown>
            <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--radar-text-secondary)' }}>共 {items.length} 条</span>
          </div>
        )}

        {/* 变更条目 */}
        {items.length === 0 ? (
          <Empty description={readOnly ? '暂无影响性分析条目' : '点击「添加变更内容」新增条目'} />
        ) : (
          items.map((it, idx) => (
            <ChangeItemCard
              key={it._key}
              index={idx}
              item={it}
              readOnly={readOnly}
              isMobile={isMobile}
              onPatch={(patch) => patchItem(it._key, patch)}
              onRemove={() => removeItem(it._key)}
            />
          ))
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

/** 单条变更内容卡片：字段按分类渲染，PC 端一行内平铺 */
function ChangeItemCard({ index, item, readOnly, isMobile, onPatch, onRemove }) {
  const fields = CATEGORY_FIELDS[item.category] || [];
  // 过滤掉未激活的条件字段（依赖项 ≠ 指定值时不展示）
  const visibleFields = fields.filter((key) => {
    const def = FIELD_DEFS[key];
    if (!def.requiredWhen) return true;
    const [dk, dv] = def.requiredWhen;
    return String(item[dk] || '').trim() === dv;
  });

  return (
    <div className="form-section-card" style={{ marginBottom: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        <span style={{ fontWeight: 600, color: 'var(--radar-text-secondary)', fontSize: 12 }}>#{index + 1}</span>
        <Tag color="processing" style={{ margin: 0, borderRadius: 2 }}>{item.category}</Tag>
        <div style={{ flex: 1 }} />
        {!readOnly && (
          <Popconfirm title="确认删除该条目？" onConfirm={onRemove}>
            <Tooltip title="删除条目"><Button danger size="small" type="text" icon={<DeleteOutlined />} /></Tooltip>
          </Popconfirm>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        {visibleFields.map((key) => {
          const def = FIELD_DEFS[key];
          return (
            <div
              key={key}
              style={{
                flex: isMobile ? '1 1 100%' : `${def.span || 1} 1 0`,
                minWidth: isMobile ? '100%' : (def.type === 'text' ? 180 : 130),
              }}
            >
              <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {def.label}
              </div>
              <FieldControl def={def} value={item[key]} readOnly={readOnly} onChange={(v) => onPatch({ [key]: v })} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 按字段类型渲染录入控件 */
function FieldControl({ def, value, onChange, readOnly }) {
  if (def.type === 'system') {
    return <SystemNameInput value={value} onChange={onChange} disabled={readOnly} />;
  }
  if (def.type === 'systems') {
    return <SystemNamesSelect value={value} onChange={onChange} disabled={readOnly} />;
  }
  if (def.type === 'kind') {
    return (
      <Select size="small" style={{ width: '100%' }} placeholder="请选择" value={value || undefined} onChange={onChange} disabled={readOnly}
        options={CHANGE_KINDS.map((k) => ({ value: k, label: k }))} />
    );
  }
  if (def.type === 'yesno') {
    return (
      <Select size="small" style={{ width: '100%' }} placeholder="请选择" value={value || undefined} onChange={onChange} disabled={readOnly}
        options={YES_NO.map((k) => ({ value: k, label: k }))} />
    );
  }
  // text
  return (
    <Input.TextArea
      size="small"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      readOnly={readOnly}
      autoSize={{ minRows: 1, maxRows: 4 }}
      maxLength={def.max}
      showCount={!!def.max}
      placeholder={def.min ? `不少于 ${def.min} 个字` : '请输入'}
      style={{ fontSize: 12 }}
    />
  );
}

/**
 * 文件：web/src/modules/settings/process-configuration/components/StageContentPanel.jsx
 * 说明：遵循项目研发规约；跨模块能力仅可经公开契约访问。
 * 用途：业务详情页中的公共扩展输入项与交付件区域。布局、类型、数据源、显示与
 *       必填提示全部由阶段内容配置返回，业务编辑器无需维护新增字段名单。
 * 作者：hengguan
 */

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { App, Button, DatePicker, Form, Input, Row, Col, Select, Space, Spin, Tag, Tooltip } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import AttachmentField from '../../../../platform/attachments/AttachmentField.jsx';
import { apiGet, apiPut, rawClient } from '../../../../platform/api.js';
import { invalidateStageContentData, loadStageContentSchema, loadStageContentValues, patchStageContentValues, subscribeStageContentConfigUpdated } from '../api/stageContentDataCache.js';

function SourceSelect({ sourceKey, multiple, value, onChange, disabled }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const load = async (keyword = '') => {
    if (!sourceKey) return;
    setLoading(true);
    try { setOptions(await apiGet(`/stage-content/sources/${sourceKey}`, { keyword })); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [sourceKey]);
  return <Select showSearch allowClear filterOption={false} onSearch={load} loading={loading} disabled={disabled}
    mode={multiple ? 'multiple' : undefined} value={value} onChange={onChange} options={options.map((item) => ({ value: item.value, label: item.label }))}
    notFoundContent={loading ? <Spin size="small" /> : '无匹配数据'} placeholder="搜索并选择" />;
}

function DynamicInput({ field, value, onChange, disabled }) {
  if (field.input_type === 'textarea') return <Input.TextArea rows={3} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
  if (field.input_type === 'date' || field.input_type === 'datetime') return <DatePicker showTime={field.input_type === 'datetime'} style={{ width: '100%' }} value={value ? dayjs(value) : null} disabled={disabled} onChange={(date) => onChange(date ? date.format(field.input_type === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD') : null)} />;
  if (['select', 'person', 'release_point'].includes(field.input_type)) return <SourceSelect sourceKey={field.source_key} multiple={!!field.multiple} value={value} onChange={onChange} disabled={disabled} />;
  return <Input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}

const scopeClass = (scopeKey) => String(scopeKey || '').replace(/[^a-zA-Z0-9_-]/g, '-');

function sameTargets(left, right) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => left[key] === right[key]);
}

/**
 * 扩展输入项独立保存，避免侵入各业务主表保存逻辑；交付件复用统一附件组件。
 * 内置字段和业务组件仍由原业务编辑器渲染，以保持既有专业交互与布局。
 */
const StageContentPanel = forwardRef(function StageContentPanel({ scopeKey, entityId, readOnly, entityType, position = 'left', showDeliverables = true, showBuiltinDeliverables = true, renderDeliverableAction, onDirtyChange }, ref) {
  const { message } = App.useApp();
  const [schema, setSchema] = useState(null);
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [builtinTargets, setBuiltinTargets] = useState({});
  const changedKeysRef = useRef(new Set());
  const load = async () => {
    if (!scopeKey) return;
    const [nextSchema, nextValues] = await Promise.all([
      loadStageContentSchema(scopeKey),
      loadStageContentValues(scopeKey, entityId),
    ]);
    setSchema(nextSchema);
    setValues(nextValues || {});
    changedKeysRef.current.clear();
  };
  useEffect(() => {
    load().catch(() => {});
    const refresh = () => {
      invalidateStageContentData(scopeKey, entityId);
      load().catch(() => {});
    };
    return subscribeStageContentConfigUpdated(scopeKey, refresh);
  }, [scopeKey, entityId]);
  const fields = useMemo(() => (schema?.fields || []).filter((field) => field.field_kind === 'extension' && field.visible), [schema]);
  useLayoutEffect(() => {
    const updateTargets = () => {
      const next = {};
      for (const section of schema?.sections || []) {
        const selector = `[data-stage-builtin-section="${scopeClass(scopeKey)}:${section.section_key}"]`;
        const target = document.querySelector(selector);
        if (target) next[section.section_key] = target;
      }
      setBuiltinTargets((old) => sameTargets(old, next) ? old : next);
    };
    updateTargets();
    const frame = window.requestAnimationFrame(updateTargets);
    return () => window.cancelAnimationFrame(frame);
  }, [scopeKey, schema]);
  const deliverableSection = useMemo(() => (
    (schema?.sections || []).find((section) => section.section_key === 'deliverables') || null
  ), [schema]);
  const deliverables = useMemo(() => (schema?.deliverables || []).filter((item) => (
    item.visible
    && (deliverableSection?.layout_mode || 'left') === position
    && (showBuiltinDeliverables || !String(item.deliverable_key).startsWith('builtin_'))
  )), [schema, showBuiltinDeliverables, position, deliverableSection]);
  const saveValues = async ({ notify = false } = {}) => {
    if (!entityId) return;
    setSaving(true);
    try {
      const changedValues = Object.fromEntries([...changedKeysRef.current].map((key) => [key, values[key]]));
      if (Object.keys(changedValues).length) {
        await apiPut(`/stage-content/${scopeKey}/entities/${entityId}/values`, { values: changedValues });
        patchStageContentValues(scopeKey, entityId, changedValues);
      }
      changedKeysRef.current.clear();
      if (notify) message.success('扩展信息已保存');
    } finally { setSaving(false); }
  };
  const downloadTemplate = async (deliverable) => {
    try {
      const response = await rawClient.get(`/stage-content/deliverables/${deliverable.id}/template`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const disposition = response.headers?.['content-disposition'] || '';
      const matched = disposition.match(/filename\*=UTF-8''([^;]+)/);
      const link = document.createElement('a');
      link.href = url;
      link.download = matched ? decodeURIComponent(matched[1]) : `${deliverable.label}模板`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) { message.error(error.message || '模板下载失败'); }
  };
  // 由详情页的整体“保存”按钮统一调用，扩展信息不再拥有单独保存入口。
  useImperativeHandle(ref, () => ({ save: () => saveValues(), hasEntity: !!entityId }), [entityId, scopeKey, values]);
  if (!schema || (!fields.length && (!showDeliverables || !deliverables.length))) return null;
  const sections = schema.sections || [];
  const defaultExtensionSection = sections.find((section) => section.section_key === 'extension');
  const fieldsBySection = new Map();
  const builtinExtensionFields = [];
  for (const field of fields) {
    // 兼容早期保存时未指定分区的输入项：它们应进入默认“扩展信息”分区，
    // 而非再生成一张同名卡片，避免高度计算与视觉内容脱节。
    const section = sections.find((item) => item.id === field.section_id) || defaultExtensionSection;
    if ((section?.layout_mode || 'left') !== position) continue;
    const builtinTarget = section && builtinTargets[section.section_key];
    if (builtinTarget) {
      builtinExtensionFields.push({ field, target: builtinTarget });
      continue;
    }
    // 分组键必须使用解析后的分区 ID。不能继续使用 field.section_id：
    // 对历史空分区字段而言它仍是空值，会再次拆出一张同名卡片。
    const key = section?.id || 'extension';
    if (!fieldsBySection.has(key)) fieldsBySection.set(key, []);
    fieldsBySection.get(key).push(field);
  }
  return <Form component={false} layout="vertical" requiredMark={false} className={`editor-form stage-content-panel stage-content-panel-${position} stage-content-panel-scope-${String(scopeKey || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`}>
    {builtinExtensionFields.map(({ field, target }) => createPortal(
      <div className={`stage-builtin-field${field.column_span === 24 ? ' stage-builtin-field-full' : ''}`} style={{ order: Number(field.sort || 0) }}>
        <Form.Item label={field.label} style={{ marginBottom: 8 }}>
          <DynamicInput field={field} value={values[field.field_key]} disabled={readOnly || !entityId} onChange={(value) => {
            setValues((old) => ({ ...old, [field.field_key]: value }));
            changedKeysRef.current.add(field.field_key);
            onDirtyChange?.();
          }} />
        </Form.Item>
      </div>,
      target,
      `extension-${field.id}`,
    ))}
    {[...fieldsBySection.entries()].map(([sectionId, sectionFields]) => {
      const section = sections.find((item) => item.id === sectionId);
      // 每个公共分区均作为详情布局 Row 的直接子项，以便完全遵循分区配置的
      // 左/右/整行和排序；不能再将多个分区包在同一个无语义容器中。
      return <div
        key={sectionId}
        className={`form-section-card stage-content-panel stage-content-panel-card stage-detail-section-${section?.section_key || 'extension'}`}
        data-stage-layout-section={section?.section_key || 'extension'}
        data-stage-layout-slot="extension"
        data-stage-layout-instance={String(sectionId)}
      >
        {section?.show_title !== 0 && <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>{section?.title || '扩展信息'}</div>}
        {!section?.collapsed && <><Row gutter={[12, 8]}>
          {sectionFields.map((field) => <Col key={field.id} span={field.column_span === 24 ? 24 : 12} xs={24}>
            <Form.Item label={field.label} style={{ marginBottom: 8 }}>
              <DynamicInput field={field} value={values[field.field_key]} disabled={readOnly || !entityId} onChange={(value) => {
                setValues((old) => ({ ...old, [field.field_key]: value }));
                changedKeysRef.current.add(field.field_key);
                onDirtyChange?.();
              }} />
            </Form.Item>
          </Col>)}
        </Row>
        {!readOnly && !entityId && <Tag>保存主记录后可填写扩展信息</Tag>}</>}
      </div>;
    })}
    {showDeliverables && deliverables.length > 0 && <div
      className="form-section-card stage-content-panel stage-content-panel-card stage-detail-section-deliverables"
      data-stage-layout-section="deliverables"
      data-stage-layout-slot="deliverables"
      data-stage-layout-instance="deliverables"
    >
      {deliverableSection?.show_title !== 0 && <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>{deliverableSection?.title || '交付件'}</div>}
      {!deliverableSection?.collapsed && deliverables.map((item) => <div key={item.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--radar-border-light)' }}>
        <div className="form-section-title" style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span>{item.label}</span>
          <Space size={2}>
            {item.template?.template_mode === 'upload' && <Tooltip title="下载模板"><Button type="text" size="small" icon={<DownloadOutlined style={{ fontSize: 12 }} />} onClick={() => downloadTemplate(item)} aria-label={`下载${item.label}模板`} /></Tooltip>}
            {renderDeliverableAction?.(item)}
          </Space>
        </div>
        {/* 同时保存交付件 ID 与名称：新配置由 ID 校验，既有导出与历史附件仍可按名称兼容读取。 */}
        <AttachmentField entityType={entityType} entityId={entityId} fieldKey={item.label} deliverableId={item.id} readOnly={readOnly} inputMode={item.input_mode} />
      </div>)}
    </div>}
  </Form>;
});

export default StageContentPanel;

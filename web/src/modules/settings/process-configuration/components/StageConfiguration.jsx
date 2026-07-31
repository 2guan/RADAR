/**
 * 文件：web/src/modules/settings/process-configuration/components/StageConfiguration.jsx
 * 说明：遵循项目研发规约；跨模块能力仅可经公开契约访问。
 * 用途：系统设置中的“输入项配置”和“交付件配置”。Tab 从菜单范围动态读取，
 *       表格列和状态必填控制完全由后端元数据驱动。
 * 作者：Codex
 * 作者：hengguan
 */

import { useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Checkbox, Empty, Form, Input, InputNumber, List, Modal, Popconfirm, Row, Col, Select, Space, Table, Tabs, Tag, Tooltip, Upload } from 'antd';
import { DeleteOutlined, DownOutlined, EditOutlined, HolderOutlined, PlusOutlined, SettingOutlined, UpOutlined } from '@ant-design/icons';
import { apiDelete, apiGet, apiPost, apiPut, rawClient } from '../../../../platform/api.js';
import { MENU } from '../../../../platform/routing/menu.js';
import { buildStageSectionLayout } from '../../../../shared/workflow/index.js';
import { useResponsive } from '../../../../platform/ui/useResponsive.js';
import { ResizableTitle } from '../../../../shared/ui/index.js';
import { notifyStageContentConfigUpdated } from '../api/stageContentDataCache.js';

const FIELD_TYPES = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '长文本' },
  { value: 'date', label: '日期' },
  { value: 'datetime', label: '日期时间' },
  { value: 'select', label: '模糊下拉' },
  { value: 'person', label: '人员选择' },
  { value: 'release_point', label: '投产点选择' },
];

function flattenMenu(items, parentLabel = '') {
  return items.flatMap((item) => item.children
    ? flattenMenu(item.children, item.label)
    : [{ module: item.module, label: parentLabel ? `${parentLabel} · ${item.label}` : item.label }]);
}

/** 状态类型来自后端参数配置的 dict_item.extra.stateType，按出现顺序生成配置项。 */
function statusTypeGroups(statuses = []) {
  const groups = new Map();
  for (const status of statuses) {
    const key = status.state_type;
    if (!groups.has(key)) groups.set(key, { key, label: status.state_type_label, statuses: [] });
    groups.get(key).statuses.push(status);
  }
  return [...groups.values()];
}

/** 恢复原有逐阶段继承规则：初始态 → 进行中/终态，进行中 → 终态。 */
function withRequiredCascade(keys = []) {
  const selected = new Set(keys);
  if (selected.has('initial')) selected.add('inProgress');
  if (selected.has('initial') || selected.has('inProgress')) selected.add('final');
  return [...selected];
}

function rulesToSelected(rules = {}, statuses = []) {
  const selected = statusTypeGroups(statuses)
    .filter((group) => group.statuses.some((status) => !!rules[status.id]))
    .map((group) => group.key);
  return withRequiredCascade(selected);
}

function selectedToRules(keys = [], statuses = []) {
  const selected = new Set(withRequiredCascade(keys));
  return Object.fromEntries(statuses.map((status) => [status.id, selected.has(status.state_type)]));
}

/** 输入项类别是配置权限与删除规则的直观说明，不在列表重复展示字段数据源。 */
function FieldKindTag({ kind }) {
  const definitions = {
    native: { label: '内置', color: 'blue' },
    extension: { label: '扩展', color: 'green' },
    component: { label: '业务组件', color: 'purple' },
  };
  const item = definitions[kind] || definitions.extension;
  return <Tag color={item.color}>{item.label}</Tag>;
}

/** 与参数配置页统一：操作列只保留图标；不可删除项仍保留置灰删除图标以稳定列宽并说明受保护状态。 */
function ConfigurationActions({ onEdit, onDelete, deleteTitle, disabledDelete = false }) {
  return <Space size={0}>
    <Button type="link" size="small" icon={<EditOutlined />} onClick={onEdit} aria-label="编辑" />
    {disabledDelete ? (
      <Tooltip title="内置字段和业务组件不可删除"><Button type="link" size="small" danger disabled icon={<DeleteOutlined />} aria-label="不可删除" /></Tooltip>
    ) : (
      <Popconfirm title={deleteTitle} onConfirm={onDelete}>
        <Button type="link" size="small" danger icon={<DeleteOutlined />} aria-label="删除" />
      </Popconfirm>
    )}
  </Space>;
}

/**
 * 复用系统设置页的移动端“字段名—值”卡片结构。配置列表为本地元数据，
 * 不经过 DataTable 的远程分页，因此在此保持相同的视觉和操作布局。
 */
function StageConfigurationMobileList({ rows, columns, loading }) {
  return <List className="stage-config-mobile-list" loading={loading} split={false}
    locale={{ emptyText: <Empty description="暂无配置" /> }} dataSource={rows}
    renderItem={(row) => <List.Item key={row.id}>
      <Card size="small" className="stage-config-mobile-card">
        {columns.map((column, index) => {
          const raw = column.dataIndex ? row[column.dataIndex] : undefined;
          const value = column.render ? column.render(raw, row) : raw;
          const isOperation = column.title === '操作';
          return <div key={column.key || column.dataIndex || `column_${index}`} className={isOperation ? 'crud-card-ops' : 'crud-card-row'}>
            {!isOperation && <span className="crud-card-label">{column.title}</span>}
            <span className={isOperation ? undefined : 'crud-card-value'}>{value == null || value === '' ? '—' : value}</span>
          </div>;
        })}
      </Card>
    </List.Item>}
  />;
}

function menuOrderedScopes(scopes) {
  const menuItems = flattenMenu(MENU);
  const byModule = new Map(menuItems.map((item, index) => [item.module, { ...item, index }]));
  return [...scopes].sort((a, b) => (byModule.get(a.scope_key)?.index ?? 999) - (byModule.get(b.scope_key)?.index ?? 999));
}

/** 按参数配置的状态类型生成必填控制，具体状态由服务端在保存时展开。 */
function RequiredControl({ statuses, value, onChange }) {
  const groups = statusTypeGroups(statuses);
  const selected = new Set(withRequiredCascade(value || []));
  const toggle = (key, checked) => {
    const next = new Set(value || []);
    if (checked) next.add(key); else next.delete(key);
    onChange(withRequiredCascade([...next]));
  };
  return (
    <Space size={[18, 8]} wrap>
      {groups.map((group) => {
        const inherited = (group.key === 'inProgress' && selected.has('initial'))
          || (group.key === 'final' && (selected.has('initial') || selected.has('inProgress')));
        return <Checkbox key={group.key} checked={selected.has(group.key)} disabled={inherited} onChange={(event) => toggle(group.key, event.target.checked)}>{group.label}必填</Checkbox>;
      })}
    </Space>
  );
}

/** 配置列表直接呈现每个真实状态的必填结果，避免用户必须进入详情才能判断规则。 */
function RequiredRuleTags({ statuses, rules = {} }) {
  const groups = statusTypeGroups(statuses);
  if (!groups.length) return <span style={{ color: 'var(--radar-text-secondary)' }}>暂无状态类型</span>;
  const selected = new Set(rulesToSelected(rules, statuses));
  // 级联规则已保证后续状态自动必填，因此列表只展示流程上最早的必填类型即可。
  const firstRequired = groups.find((group) => selected.has(group.key));
  return firstRequired
    ? <Tag color="red">{firstRequired.label} 必填</Tag>
    : <Tag>非必填</Tag>;
}

/**
 * 分区配置以详情页同款布局画布直接预览。原生拖拽同时表达全局顺序和布局，
 * 不引入额外拖拽依赖，便于后续在其他设置页复用。
 */
function SectionEditor({ open, config, messageApi, onClose, onSaved, isMobile }) {
  const [sections, setSections] = useState([]);
  const [fieldOrders, setFieldOrders] = useState({});
  const [dirtyFieldSectionIds, setDirtyFieldSectionIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const isSectionLayoutField = (field) => field.field_key !== config?.scope?.status_field;
  useEffect(() => {
    if (!open) return;
    const nextSections = (config?.sections || []).map((item) => ({
      ...item,
      client_key: `section_${item.id}`,
      collapsed: !!item.collapsed,
      show_title: item.show_title !== 0,
    }));
    const orders = Object.fromEntries(nextSections.map((section) => [section.id, []]));
    for (const field of [...(config?.fields || [])].filter(isSectionLayoutField).sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || Number(a.id || 0) - Number(b.id || 0))) {
      if (orders[field.section_id]) orders[field.section_id].push(field);
    }
    setSections(nextSections);
    setFieldOrders(orders);
    setDirtyFieldSectionIds(new Set());
  }, [open, config]);

  const resetSort = (items) => items.map((item, index) => ({ ...item, sort: (index + 1) * 10 }));
  const updateSection = (clientKey, patch) => setSections((old) => old.map((item) => item.client_key === clientKey ? { ...item, ...patch } : item));
  const moveSection = (dragKey, targetKey = null) => {
    setSections((old) => {
      const moving = old.find((item) => item.client_key === dragKey);
      if (!moving) return old;
      const rest = old.filter((item) => item.client_key !== dragKey);
      const targetIndex = targetKey ? rest.findIndex((item) => item.client_key === targetKey) : rest.length;
      rest.splice(targetIndex < 0 ? rest.length : targetIndex, 0, moving);
      return resetSort(rest);
    });
  };
  const changeLayout = (clientKey, layoutMode) => setSections((old) => resetSort(old.map((item) => (
    item.client_key === clientKey ? { ...item, layout_mode: layoutMode } : item
  ))));
  const addSection = () => {
    const stamp = Date.now();
    setSections((old) => resetSort([...old, {
    client_key: `new_${stamp}`,
    section_key: `extension_${stamp}`,
    title: '新分区',
    layout_mode: 'left',
    show_title: true,
    collapsed: false,
    is_builtin: 0,
    }]));
  };
  const removeSection = async (section) => {
    if (section.id) await apiDelete(`/settings/stage-content/${config.scope.scope_key}/sections/${section.id}`);
    setSections((old) => resetSort(old.filter((item) => item.client_key !== section.client_key)));
    setDirtyFieldSectionIds((old) => {
      const next = new Set(old);
      next.delete(section.id);
      return next;
    });
  };
  const markFieldSectionDirty = (sectionId) => setDirtyFieldSectionIds((old) => new Set(old).add(sectionId));
  const moveField = (sectionId, fieldId, targetId = null) => {
    if (!sectionId || !fieldId) return;
    const fields = fieldOrders[sectionId] || [];
    if (!fields.some((field) => field.id === fieldId)) return;
    setFieldOrders((old) => {
      const current = old[sectionId] || [];
      const moving = current.find((field) => field.id === fieldId);
      if (!moving) return old;
      const rest = current.filter((field) => field.id !== fieldId);
      const targetIndex = targetId ? rest.findIndex((field) => field.id === targetId) : rest.length;
      const next = [...rest];
      next.splice(targetIndex < 0 ? next.length : targetIndex, 0, moving);
      if (next.every((field, index) => field.id === current[index]?.id)) return old;
      return { ...old, [sectionId]: next };
    });
    markFieldSectionDirty(sectionId);
  };
  const moveFieldByOffset = (sectionId, fieldId, offset) => {
    const fields = fieldOrders[sectionId] || [];
    const index = fields.findIndex((field) => field.id === fieldId);
    const target = fields[index + offset];
    if (index < 0 || !target) return;
    setFieldOrders((old) => {
      const next = [...(old[sectionId] || [])];
      const [moving] = next.splice(index, 1);
      next.splice(index + offset, 0, moving);
      return { ...old, [sectionId]: next };
    });
    markFieldSectionDirty(sectionId);
  };
  const setFieldColumnSpan = (sectionId, fieldId, columnSpan) => {
    setFieldOrders((old) => ({
      ...old,
      [sectionId]: (old[sectionId] || []).map((field) => field.id === fieldId ? { ...field, column_span: columnSpan } : field),
    }));
    markFieldSectionDirty(sectionId);
  };
  const save = async () => {
    if (sections.some((section) => !String(section.title || '').trim())) {
      messageApi.warning('分区名称不能为空');
      return;
    }
    setSaving(true);
    try {
      for (const section of sections) {
        await apiPost(`/settings/stage-content/${config.scope.scope_key}/sections`, section);
      }
      for (const sectionId of dirtyFieldSectionIds) {
        const fields = fieldOrders[sectionId] || [];
        await apiPut(`/settings/stage-content/${config.scope.scope_key}/field-layout`, {
          section_id: sectionId,
          field_ids: fields.map((field) => field.id),
          column_spans: Object.fromEntries(fields.map((field) => [field.id, field.column_span === 24 ? 24 : 12])),
        });
      }
      messageApi.success('分区配置已保存');
      onSaved();
    } finally { setSaving(false); }
  };
  const previewPlan = buildStageSectionLayout(sections.map((section, index) => ({ ...section, key: section.client_key, index, order: section.sort })));
  const previewField = (section, field, index, fields) => <div key={field.id} draggable
    style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 6, rowGap: 6, minWidth: 0, padding: '6px 8px', border: '1px solid var(--radar-border-light)', background: 'var(--radar-surface)', cursor: 'grab', gridColumn: field.column_span === 24 ? '1 / -1' : 'auto' }}
    onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData('stage-field-id', String(field.id)); event.dataTransfer.effectAllowed = 'move'; }}
    onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
    onDrop={(event) => { event.preventDefault(); event.stopPropagation(); moveField(section.id, Number(event.dataTransfer.getData('stage-field-id')), field.id); }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
      <HolderOutlined style={{ flex: '0 0 auto', marginTop: 2, color: 'var(--radar-text-secondary)' }} aria-hidden />
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{field.label}</span>
    </div>
    <FieldKindTag kind={field.field_kind} />
    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
      <Space.Compact size="small">
        <Tooltip title="半行（50%）"><Button size="small" style={{ paddingInline: 5, fontSize: 11 }} type={field.column_span === 12 ? 'primary' : 'default'} onClick={() => setFieldColumnSpan(section.id, field.id, 12)} aria-label={`将${field.label}设为半行（50%）`}>50%</Button></Tooltip>
        <Tooltip title="整行（100%）"><Button size="small" style={{ paddingInline: 5, fontSize: 11 }} type={field.column_span === 24 ? 'primary' : 'default'} onClick={() => setFieldColumnSpan(section.id, field.id, 24)} aria-label={`将${field.label}设为整行（100%）`}>100%</Button></Tooltip>
      </Space.Compact>
      <Space size={0}>
        <Tooltip title="上移"><Button type="text" size="small" icon={<UpOutlined />} disabled={index === 0} onClick={() => moveFieldByOffset(section.id, field.id, -1)} aria-label={`上移${field.label}`} /></Tooltip>
        <Tooltip title="下移"><Button type="text" size="small" icon={<DownOutlined />} disabled={index === fields.length - 1} onClick={() => moveFieldByOffset(section.id, field.id, 1)} aria-label={`下移${field.label}`} /></Tooltip>
      </Space>
    </div>
  </div>;
  const previewCard = (section) => {
    const fields = fieldOrders[section.id] || [];
    return <div key={section.client_key} draggable className="form-section-card stage-section-preview-card"
        onDragStart={(event) => event.dataTransfer.setData('section-key', section.client_key)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault(); event.stopPropagation();
          const fieldId = Number(event.dataTransfer.getData('stage-field-id'));
          if (fieldId) moveField(section.id, fieldId);
          else moveSection(event.dataTransfer.getData('section-key'), section.client_key);
        }}>
        <div className="stage-section-preview-toolbar">
          <HolderOutlined className="stage-section-preview-handle" />
          <Input size="small" value={section.title} onChange={(event) => updateSection(section.client_key, { title: event.target.value })} aria-label="分区名称" />
          {section.is_builtin ? <Tag color="blue">内置</Tag> : <Popconfirm title="确认删除这个空分区？" onConfirm={() => removeSection(section)}><Button danger type="text" size="small" icon={<DeleteOutlined />} aria-label="删除分区" /></Popconfirm>}
        </div>
        <div className="stage-section-preview-options">
          <Space size={2} className="stage-section-preview-layouts">
            {[['left', '左侧'], ['right', '右侧'], ['full', '整行']].map(([value, text]) => <Button key={value} size="small" type={section.layout_mode === value ? 'primary' : 'default'} onClick={() => changeLayout(section.client_key, value)}>{text}</Button>)}
          </Space>
          <Checkbox checked={section.show_title} onChange={(event) => updateSection(section.client_key, { show_title: event.target.checked })}>显示分区名称</Checkbox>
          <Checkbox checked={section.collapsed} onChange={(event) => updateSection(section.client_key, { collapsed: event.target.checked })}>默认折叠</Checkbox>
        </div>
        <div className="stage-section-preview-body">
          {section.show_title && <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>{section.title || '未命名分区'}</div>}
          {section.collapsed && <div style={{ marginBottom: 8 }}>详情页默认折叠；以下字段用于配置预览。</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }} onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); moveField(section.id, Number(event.dataTransfer.getData('stage-field-id'))); }}>
            {fields.map((field, index) => previewField(section, field, index, fields))}
            {!fields.length && <div style={{ padding: '8px 0', color: 'var(--radar-text-secondary)' }}>暂无输入项，请在输入项详情中设置布局分区。</div>}
          </div>
        </div>
      </div>;
  };
  const previewSegment = (segment, index) => {
    if (segment.type === 'full') {
      return <div key={`full_${index}`} className="stage-section-preview-full-row">
        {segment.items.map(previewCard)}
      </div>;
    }
    const lane = (layout, label) => <div key={layout} className="stage-section-preview-lane"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); moveSection(event.dataTransfer.getData('section-key')); }}>
      <div className="stage-section-preview-lane-label">{label}</div>
      {segment.items.filter((item) => (item.layout_mode || 'left') === layout).map(previewCard)}
      {!segment.items.some((item) => (item.layout_mode || 'left') === layout) && <div className="stage-section-preview-lane-empty">拖拽模块到此处</div>}
    </div>;
    return <div key={`columns_${index}`} className="stage-section-preview-columns">
      {lane('left', '左侧')}
      {lane('right', '右侧')}
    </div>;
  };
  const unassignedFields = [...(config?.fields || [])]
    .filter((field) => isSectionLayoutField(field) && !sections.some((section) => section.id === field.section_id))
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || Number(a.id || 0) - Number(b.id || 0));
  return <Modal open={open} title="分区配置" width={isMobile ? 'calc(100vw - 16px)' : 980} onCancel={onClose} onOk={save} confirmLoading={saving} destroyOnHidden className="stage-config-editor-modal">
    <div className="stage-section-preview-hint">拖拽卡片调整分区布局；分区内可拖拽字段调整详情顺序，也可用上下按钮操作。阶段状态固定在详情页顶部，不参与分区配置；字段跨分区移动请在输入项详情中修改。</div>
    <div className="stage-section-preview-canvas"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => { event.preventDefault(); moveSection(event.dataTransfer.getData('section-key')); }}>
      {previewPlan.segments.map(previewSegment)}
      {!sections.length && <div className="stage-section-preview-empty">拖拽分区到此处</div>}
    </div>
    {!!unassignedFields.length && <div className="form-section-card" style={{ marginBottom: 12, padding: '10px 12px' }}>
      <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>未分区输入项</div>
      <div style={{ color: 'var(--radar-text-secondary)', marginBottom: 8 }}>请在输入项详情中选择布局分区后，才可在这里排序。</div>
      <Space size={[6, 6]} wrap>{unassignedFields.map((field) => <Tag key={field.id}>{field.label}</Tag>)}</Space>
    </div>}
    <Button type="dashed" block icon={<PlusOutlined />} onClick={addSection}>新增扩展分区</Button>
  </Modal>;
}

function FieldEditor({ open, field, config, sourceOptions, messageApi, onClose, onSaved, isMobile }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const isNew = !field || field.__new === true;
  const isExtension = isNew || field?.field_kind === 'extension';
  const isComponent = field?.input_type === 'component';
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (!isNew) {
      form.setFieldsValue({
        ...field,
        rulesSelected: rulesToSelected(field.rules, config?.statuses),
        multiple: !!field.multiple,
        visible: !!field.visible,
        list_visible: !!field.list_visible,
        filterable: !!field.filterable,
        dashboard_dimension: !!field.dashboard_dimension,
      });
      return;
    }
    const extensionSection = (config?.sections || []).find((item) => item.section_key === 'extension');
    form.setFieldsValue({
      field_kind: 'extension', input_type: 'text', source_key: '', multiple: false,
      // 新增字段默认仅显示在详情页；列表、筛选和仪表盘由管理员按实际口径主动启用。
      section_id: extensionSection?.id,
      column_span: 12, visible: true, list_visible: false, filterable: false, dashboard_dimension: false, sort: 0, rulesSelected: [],
    });
  }, [open, field, isNew, config?.sections, config?.statuses, form]);
  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const data = { ...values, rules: selectedToRules(values.rulesSelected, config?.statuses) };
      delete data.rulesSelected;
      if (isNew) await apiPost(`/settings/stage-content/${config.scope.scope_key}/fields`, data);
      else await apiPut(`/settings/stage-content/${config.scope.scope_key}/fields/${field.id}`, data);
      messageApi.success('输入项配置已保存');
      onSaved();
    } finally { setSaving(false); }
  };
  return (
    <Modal open={open} title={isNew ? '新增扩展输入项' : `输入项详情 · ${field.label}`} width={isMobile ? 'calc(100vw - 16px)' : 760} onCancel={onClose} destroyOnHidden className="stage-config-editor-modal"
      footer={<Space><Button onClick={onClose}>取消</Button><Button type="primary" loading={saving} onClick={save}>保存</Button></Space>}
      styles={{ body: { fontSize: 12, paddingTop: 14 } }}>
      <Form form={form} layout="vertical" className="editor-form stage-config-editor-form">
        <div className="form-section-card">
          <div className="form-section-title">基本信息</div>
          <Row gutter={[16, 0]}>
            <Col span={24}><Form.Item name="label" label="输入项名称" rules={[{ required: true }]}><Input /></Form.Item></Col>
            {isExtension && <Col span={12} xs={24}><Form.Item name="input_type" label="字段类型" rules={[{ required: true }]}><Select options={FIELD_TYPES} /></Form.Item></Col>}
            {isExtension && <Form.Item noStyle shouldUpdate={(prev, next) => prev.input_type !== next.input_type}>
              {({ getFieldValue }) => ['select', 'person', 'release_point'].includes(getFieldValue('input_type')) && (
                <Col span={12} xs={24}><Form.Item name="source_key" label="数据源" rules={[{ required: true }]}><Select options={sourceOptions.filter((item) => {
                  const inputType = getFieldValue('input_type');
                  if (inputType === 'person') return item.value === 'person';
                  if (inputType === 'release_point') return item.value === 'release_point';
                  return !!item.value && !['person', 'release_point'].includes(item.value);
                })} /></Form.Item></Col>
              )}
            </Form.Item>}
          </Row>
        </div>
        <div className="form-section-card">
          <div className="form-section-title">显示与布局</div>
          <Row gutter={[16, 0]}>
            <Col span={12} xs={24}><Form.Item name="section_id" label="布局分区"><Select allowClear options={(config.sections || []).map((item) => ({ value: item.id, label: item.title }))} /></Form.Item></Col>
            <Col span={6} xs={12}><Form.Item name="column_span" label="布局宽度"><Select options={[{ value: 12, label: '半行' }, { value: 24, label: '整行' }]} /></Form.Item></Col>
            <Col span={6} xs={12}><Form.Item name="sort" label="排序"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            {isExtension && <Col span={24}><Form.Item name="multiple" valuePropName="checked" style={{ marginBottom: 8 }}><Checkbox>允许多选（Excel 导入、导出以英文逗号分隔）</Checkbox></Form.Item></Col>}
            <Col span={24}><Space size={[18, 8]} wrap><Form.Item name="visible" valuePropName="checked" noStyle><Checkbox>详情页显示</Checkbox></Form.Item><Form.Item name="list_visible" valuePropName="checked" noStyle><Checkbox disabled={isComponent}>列表展示</Checkbox></Form.Item><Form.Item name="filterable" valuePropName="checked" noStyle><Checkbox disabled={isComponent}>作为筛选条件</Checkbox></Form.Item><Form.Item name="dashboard_dimension" valuePropName="checked" noStyle><Checkbox disabled={isComponent}>作为仪表盘维度</Checkbox></Form.Item>{isComponent && <span style={{ color: 'var(--radar-text-secondary)' }}>业务组件仅支持详情页显示</span>}</Space></Col>
          </Row>
        </div>
        <div className="form-section-card">
          <div className="form-section-title">必填控制</div>
          <Form.Item name="rulesSelected" label="在以下状态设为必填" style={{ marginBottom: 0 }}><RequiredControl statuses={config.statuses || []} /></Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

function DeliverableEditor({ open, deliverable, config, messageApi, onClose, onSaved, isMobile }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [removingTemplate, setRemovingTemplate] = useState(false);
  const isNew = !deliverable;
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(isNew
      ? { input_mode: 'both', visible: true, sort: 0, rulesSelected: [] }
      : { ...deliverable, visible: !!deliverable.visible, rulesSelected: rulesToSelected(deliverable.rules, config?.statuses) });
  }, [open, deliverable, isNew, config?.statuses, form]);
  const save = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const data = { ...values, rules: selectedToRules(values.rulesSelected, config?.statuses) };
      delete data.rulesSelected;
      if (isNew) await apiPost(`/settings/stage-deliverables/${config.scope.scope_key}`, data);
      else await apiPut(`/settings/stage-deliverables/${config.scope.scope_key}/${deliverable.id}`, data);
      messageApi.success('交付件配置已保存');
      onSaved();
    } finally { setSaving(false); }
  };
  const uploadTemplate = async ({ file, onSuccess, onError }) => {
    try {
      const data = new FormData();
      data.append('file', file);
      await rawClient.post(`/settings/stage-deliverables/${config.scope.scope_key}/${deliverable.id}/templates/upload`, data, { headers: { 'Content-Type': 'multipart/form-data' } });
      messageApi.success('静态模板已上传');
      onSuccess?.();
      onSaved();
    } catch (err) { onError?.(err); }
  };
  const removeTemplate = async () => {
    if (!deliverable?.template || deliverable.template.template_mode !== 'upload') return;
    setRemovingTemplate(true);
    try {
      await apiDelete(`/settings/stage-deliverables/${config.scope.scope_key}/${deliverable.id}/templates/${deliverable.template.id}`);
      messageApi.success('模板已删除');
      onSaved();
    } finally { setRemovingTemplate(false); }
  };
  const template = deliverable?.template;
  return (
    <Modal open={open} title={isNew ? '新增交付件' : `交付件详情 · ${deliverable.label}`} width={isMobile ? 'calc(100vw - 16px)' : 720} onCancel={onClose} destroyOnHidden className="stage-config-editor-modal"
      footer={<Space><Button onClick={onClose}>取消</Button><Button type="primary" loading={saving} onClick={save}>保存</Button></Space>}
      styles={{ body: { fontSize: 12, paddingTop: 14 } }}>
      <Form form={form} layout="vertical" className="editor-form stage-config-editor-form">
        <div className="form-section-card">
          <div className="form-section-title">基本信息</div>
          <Row gutter={[16, 0]}>
            <Col span={24} xs={24}><Form.Item name="label" label="交付件名称" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12} xs={24}><Form.Item name="input_mode" label="提交方式" rules={[{ required: true }]}><Select options={[{ value: 'file', label: '上传文件' }, { value: 'path', label: '填写路径' }, { value: 'both', label: '都可以' }]} /></Form.Item></Col>
            <Col span={6} xs={12}><Form.Item name="sort" label="排序"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={6} xs={12}><Form.Item name="visible" label="是否显示" valuePropName="checked"><Checkbox>显示</Checkbox></Form.Item></Col>
          </Row>
        </div>
        <div className="form-section-card">
          <div className="form-section-title">模板</div>
          <Form.Item label="当前模板" style={{ marginBottom: 0 }}><Space wrap><Tag>{template ? (template.template_mode === 'custom' ? '定制模板' : '上传模板') : '无'}</Tag>{template?.filename && <Tooltip title={template.filename}><span style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.filename}</span></Tooltip>}{template?.template_mode === 'upload' && <Popconfirm title="删除后该交付件将不再提供此上传模板，确认删除？" onConfirm={removeTemplate}><Button size="small" danger loading={removingTemplate}>删除模板</Button></Popconfirm>}{deliverable && template?.template_mode !== 'custom' && <Upload accept=".docx,.xlsx" showUploadList={false} customRequest={uploadTemplate}><Button size="small">{template?.template_mode === 'upload' ? '上传新模板' : '上传 DOCX/XLSX 模板'}</Button></Upload>}</Space><div style={{ marginTop: 6, color: 'var(--radar-text-secondary)', fontSize: 12 }}>{template?.template_mode === 'custom' ? '该模板由定制业务组件生成，请在业务详情页下载。' : '上传新模板会替换当前上传版本；复杂模板请通过定制业务组件下载。'}</div></Form.Item>
        </div>
        <div className="form-section-card">
          <div className="form-section-title">必填控制</div>
          <Form.Item name="rulesSelected" label="在以下状态设为必填" style={{ marginBottom: 0 }}><RequiredControl statuses={config.statuses || []} /></Form.Item>
        </div>
      </Form>
    </Modal>
  );
}

/** 阶段内容/交付件两种设置页面复用同一个菜单驱动 Tab 框架。 */
export default function StageConfiguration({ mode }) {
  // 使用 App 上下文中的 message，保证提示框跟随动态主题与全局配置。
  const { message: messageApi } = App.useApp();
  const { isMobile } = useResponsive();
  const [scopes, setScopes] = useState([]);
  const [activeScope, setActiveScope] = useState(null);
  const [configs, setConfigs] = useState({});
  const [sourceOptions, setSourceOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [columnWidths, setColumnWidths] = useState({});

  useEffect(() => {
    apiGet('/settings/stage-content/scopes').then((rows) => {
      const ordered = menuOrderedScopes(rows || []);
      setScopes(ordered);
      setActiveScope((old) => old || ordered[0]?.scope_key || null);
    }).catch(() => {});
  }, []);
  useEffect(() => { apiGet('/settings/stage-content/sources').then((rows) => setSourceOptions(rows || [])).catch(() => {}); }, []);

  const load = async (scopeKey = activeScope) => {
    if (!scopeKey) return;
    setLoading(true);
    try {
      const config = await apiGet(`/settings/stage-content/${scopeKey}`);
      setConfigs((prev) => ({ ...prev, [scopeKey]: config }));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [activeScope]);
  const config = configs[activeScope];
  const isContent = mode === 'content';
  const refreshActiveScope = () => {
    if (!activeScope) return;
    notifyStageContentConfigUpdated(activeScope);
    setEditing(null);
    load(activeScope);
  };

  const fieldColumns = useMemo(() => [
    { title: '输入项名称', dataIndex: 'label' },
    { title: '类型', dataIndex: 'field_kind', render: (kind) => <FieldKindTag kind={kind} /> },
    { title: '是否显示', dataIndex: 'visible', render: (v) => v ? '是' : '否' },
    { title: '必填控制', render: (_, row) => <RequiredRuleTags statuses={config?.statuses || []} rules={row.rules} /> },
    { title: '布局', render: (_, row) => `${config?.sections?.find((section) => section.id === row.section_id)?.title || '未分区'} / ${row.column_span === 24 ? '整行' : '半行'}` },
    { title: '是否列表展示', dataIndex: 'list_visible', render: (v) => v ? '是' : '否' },
    { title: '是否筛选', dataIndex: 'filterable', render: (v) => v ? '是' : '否' },
    { title: '是否仪表盘维度', dataIndex: 'dashboard_dimension', render: (v) => v ? '是' : '否' },
    { title: '排序', dataIndex: 'sort' },
    { title: '操作', render: (_, row) => <ConfigurationActions
      onEdit={() => setEditing(row)}
      disabledDelete={row.field_kind !== 'extension'}
      deleteTitle="删除后保留历史填写值和审计记录，确认删除？"
      onDelete={async () => { await apiDelete(`/settings/stage-content/${activeScope}/fields/${row.id}`); refreshActiveScope(); }}
    /> },
  ], [activeScope, config]);

  const deliverableColumns = useMemo(() => [
    { title: '交付件名称', dataIndex: 'label' },
    { title: '是否显示', dataIndex: 'visible', render: (v) => v ? '是' : '否' },
    { title: '提交方式', dataIndex: 'input_mode', render: (v) => ({ file: '上传文件', path: '填写路径', both: '都可以' }[v] || v) },
    { title: '模板', render: (_, row) => row.template ? (row.template.template_mode === 'custom' ? '定制模板' : `上传模板：${row.template.filename || '未命名文件'}`) : '无' },
    { title: '必填控制', render: (_, row) => <RequiredRuleTags statuses={config?.statuses || []} rules={row.rules} /> },
    { title: '排序', dataIndex: 'sort' },
    { title: '操作', render: (_, row) => <ConfigurationActions
      onEdit={() => setEditing(row)}
      deleteTitle="删除后保留已有凭证、模板和审计记录，确认删除？"
      onDelete={async () => { await apiDelete(`/settings/stage-deliverables/${activeScope}/${row.id}`); refreshActiveScope(); }}
    /> },
  ], [activeScope, config]);

  // 配置表是静态元数据列表，不走带分页请求的 DataTable；复用公共可拖拽表头，
  // 宽度按“配置页 + 阶段 + 列”隔离，切换阶段后不会覆盖其他表的阅读习惯。
  const tableColumns = useMemo(() => {
    const source = isContent ? fieldColumns : deliverableColumns;
    const prefix = `${mode}:${activeScope || ''}`;
    return source.map((column, index) => {
      const columnKey = column.key || column.dataIndex || `column_${index}`;
      const widthKey = `${prefix}:${columnKey}`;
      const width = columnWidths[widthKey] || column.width;
      return {
        ...column,
        key: columnKey,
        width,
        align: 'center',
        onHeaderCell: (col) => ({
          width: col.width,
          onResize: (nextWidth) => setColumnWidths((previous) => ({ ...previous, [widthKey]: nextWidth })),
        }),
      };
    });
  }, [activeScope, columnWidths, deliverableColumns, fieldColumns, isContent, mode]);
  const currentColumns = isContent ? fieldColumns : deliverableColumns;
  const currentRows = isContent ? (config?.fields || []) : (config?.deliverables || []);

  return (<>
    <Tabs activeKey={activeScope || undefined} onChange={setActiveScope} items={scopes.map((scope) => ({
      key: scope.scope_key,
      label: scope.label,
      children: <div className="compact-table stage-config-list">
        <Space wrap style={{ width: '100%', justifyContent: isMobile ? 'space-between' : 'flex-end', marginBottom: 12 }}>
          {isContent && <Button icon={<SettingOutlined />} onClick={() => setSectionOpen(true)}>分区配置</Button>}
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing({ __new: true })}>{isContent ? '新增输入项' : '新增交付件'}</Button>
        </Space>
        {isMobile ? <StageConfigurationMobileList rows={currentRows} columns={currentColumns} loading={loading} /> : <Table rowKey="id" loading={loading} size="small" scroll={{ x: 'max-content' }} pagination={false}
          components={{ header: { cell: ResizableTitle } }} columns={tableColumns} dataSource={currentRows} />}
      </div>,
    }))} />
    {isContent ? <FieldEditor open={!!editing} field={editing?.__new ? null : editing} config={config || {}} sourceOptions={sourceOptions} messageApi={messageApi} isMobile={isMobile} onClose={() => setEditing(null)} onSaved={refreshActiveScope} />
      : <DeliverableEditor open={!!editing} deliverable={editing?.__new ? null : editing} config={config || {}} messageApi={messageApi} isMobile={isMobile} onClose={() => setEditing(null)} onSaved={refreshActiveScope} />}
    {isContent && <SectionEditor open={sectionOpen} config={config || {}} messageApi={messageApi} isMobile={isMobile} onClose={() => setSectionOpen(false)} onSaved={() => { setSectionOpen(false); refreshActiveScope(); }} />}
  </>);
}

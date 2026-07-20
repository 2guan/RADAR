/**
 * 文件：components/dashboard/ChartEditor.jsx
 * 用途：分析图表配置弹窗。可设标题、数据源、图表类型、主维度、次维度（堆叠/透视/折线），
 *       局部过滤（多值/时间区间）、主/次维度分组归并（自定义标签+颜色+一键加载预设）、
 *       半宽全宽与高度。产出 {title,chart_type,col_span,height,config}。
 * 作者：hengguan
 * 说明：看板图表配置编辑器，支持用户在交互式界面中设定图表的维度、指标和展示过滤条件。
 */

import React, { useEffect, useState } from 'react';
import {
  Modal, Form, Input, Select, Radio, InputNumber, Divider, Button, Card, Space, DatePicker, App,
} from 'antd';
import { PlusOutlined, DeleteOutlined, CodeOutlined, CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ColorPickerField from './ColorPickerField.jsx';
import { ReleasePointOptionLabel } from '../ReleasePointText.jsx';
import { getScopedPopupContainer } from '../scopedPopup.js';

// 支持次维度（堆叠/横轴/透视）的图表类型
const X_TYPES = ['stacked_bar', 'stacked_bar_horizontal', 'line', 'area', 'table'];

export default function ChartEditor({ open, onClose, onSave, initialData, scope, meta }) {
  const [form] = Form.useForm();
  const [isDirty, setIsDirty] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeText, setCodeText] = useState('');
  const { message } = App.useApp();
  const chartType = Form.useWatch('chart_type', form);
  const dimension = Form.useWatch('dimension', form);
  const xAxisDimension = Form.useWatch('xAxisDimension', form);

  const dims = meta.dimsOf('analytics');
  const dimOptions = dims.map((d) => ({ value: d.key, label: d.label }));
  const supportsX = X_TYPES.includes(chartType);

  useEffect(() => {
    if (!open) return;
    setIsDirty(false);
    if (initialData) {
      const cfg = typeof initialData.config === 'string' ? JSON.parse(initialData.config) : (initialData.config || {});
      const filterList = Object.entries(cfg.filters || {}).map(([dim, val]) => {
        if (meta.dimMeta(dim)?.isDate && Array.isArray(val) && val.length === 2) {
          return { dim, val: [dayjs(val[0]), dayjs(val[1])] };
        }
        return { dim, val };
      });
      form.setFieldsValue({
        title: initialData.title,
        chart_type: initialData.chart_type,
        col_span: initialData.col_span || 12,
        height: initialData.height !== undefined && initialData.height !== null ? initialData.height : 320,
        statDimension: cfg.statDimension || ({ requirement: 'requirement', ticket: 'ticket' }[cfg.source] || 'all'),
        statStage: cfg.statStage || ({ requirement: 'analysis', ticket: 'analysis', dev: 'dev', sit: 'sit', uat: 'uat', nft: 'nft', sec: 'sec', releaseSystem: 'release' }[cfg.source] || 'all'),
        dimension: cfg.dimension,
        xAxisDimension: cfg.xAxisDimension,
        filterList,
        groups: cfg.groups || [],
        xAxisGroups: cfg.xAxisGroups || [],
      });
    } else {
      form.setFieldsValue({
        title: '新图表', chart_type: 'pie', col_span: 12, height: 320,
        statDimension: 'all', statStage: 'all', dimension: 'implementation_type', xAxisDimension: undefined,
        filterList: [], groups: [], xAxisGroups: [],
      });
    }
  }, [open, initialData]);

  // 维度取值选项（下拉/标签）
  const optionsOf = (dim) => meta.getOptions(dim);
  const isDate = (dim) => meta.dimMeta(dim)?.isDate;
  const optionText = (option) => String(option?.searchLabel ?? option?.label ?? '');
  const filterValueOption = (input, option) => optionText(option).toLowerCase().includes(input.toLowerCase());
  const renderValueOption = (option) => {
    const data = option?.data || {};
    if (!data.releaseDate) return option?.label;
    return <ReleasePointOptionLabel releaseDate={data.releaseDate} versionType={data.versionType} includeVersionType />;
  };

  // 一键加载预设：用某维度的全部选项生成分组
  const loadPresets = (dim, field) => {
    const opts = optionsOf(dim);
    if (!opts.length) { message.info('该维度无可加载的预设（时间/自由文本维度请手动添加）'); return; }
    form.setFieldValue(field, opts.map((o) => ({ label: o.searchLabel || o.label, values: [o.value] })));
    message.success(`已加载 ${opts.length} 条预设`);
  };

  const buildPayload = (v) => {
    const filters = {};
    (v.filterList || []).forEach((f) => {
      if (!f?.dim || f.val == null) return;
      if (isDate(f.dim) && Array.isArray(f.val) && f.val.length === 2) {
        filters[f.dim] = f.val.map((d) => (dayjs.isDayjs(d) ? d.format('YYYY-MM-DD') : d));
      } else if (Array.isArray(f.val) ? f.val.length : f.val !== '') {
        filters[f.dim] = f.val;
      }
    });
    const clean = (arr) => (arr || []).filter((g) => g?.label && g.values?.length)
      .map((g) => ({
        label: g.label, values: g.values, ...(g.color ? { color: g.color } : {}),
        ...(g.subDimension ? { subDimension: g.subDimension, subGroups: clean(g.subGroups) } : {}),
      }));
    const nextSupportsX = X_TYPES.includes(v.chart_type);
    const config = {
      source: 'analytics',
      statDimension: v.statDimension,
      statStage: v.statStage,
      dimension: v.dimension,
      xAxisDimension: nextSupportsX ? (v.xAxisDimension || undefined) : undefined,
      filters,
      groups: clean(v.groups),
      xAxisGroups: nextSupportsX ? clean(v.xAxisGroups) : [],
    };
    return { title: v.title, chart_type: v.chart_type, col_span: v.col_span, height: v.height, scope, config };
  };

  const handleOk = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    onSave(buildPayload(v));
  };

  const filtersToList = (filters = {}) => Object.entries(filters).map(([dim, val]) => {
    if (meta.dimMeta(dim)?.isDate && Array.isArray(val) && val.length === 2) {
      return { dim, val: [dayjs(val[0]), dayjs(val[1])] };
    }
    return { dim, val };
  });

  const openCodeEditor = () => {
    setCodeText(JSON.stringify(buildPayload(form.getFieldsValue(true)), null, 2));
    setCodeOpen(true);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(codeText);
    message.success('配置代码已复制');
  };

  const applyCode = () => {
    let parsed;
    try {
      parsed = JSON.parse(codeText);
    } catch {
      message.error('JSON 格式不正确，请检查后再应用');
      return;
    }
    const current = form.getFieldsValue(true);
    const cfg = parsed.config || parsed;
    form.setFieldsValue({
      title: parsed.title ?? current.title,
      chart_type: parsed.chart_type ?? current.chart_type,
      col_span: parsed.col_span ?? current.col_span,
      height: parsed.height ?? current.height,
      statDimension: cfg.statDimension ?? current.statDimension,
      statStage: cfg.statStage ?? current.statStage,
      dimension: cfg.dimension ?? current.dimension,
      xAxisDimension: cfg.xAxisDimension,
      filterList: filtersToList(cfg.filters),
      groups: cfg.groups || [],
      xAxisGroups: cfg.xAxisGroups || [],
    });
    setIsDirty(true);
    setCodeOpen(false);
    message.success('配置代码已应用到表单');
  };

  // PAMS 同款分组树：主/次维度各自的一级分组可设置二级维度，二级分组还能设置三级维度。
  const renderGroups = (name, dim, depth = 1, rootPath = null) => (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <>
          {fields.map(({ key, name: n, ...rest }) => (
            <Card key={key} size="small" style={{ marginBottom: 8 }} styles={{ body: { padding: '8px 10px' } }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <Form.Item {...rest} name={[n, 'label']} rules={[{ required: true, message: '标签' }]} style={{ flex: 1, marginBottom: 0 }}>
                  <Input placeholder="显示标签" size="small" />
                </Form.Item>
                <Form.Item {...rest} name={[n, 'color']} style={{ marginBottom: 0 }}>
                  <ColorPickerField />
                </Form.Item>
                <DeleteOutlined onClick={() => remove(n)} style={{ color: '#ff4d4f' }} />
              </div>
              <Form.Item {...rest} name={[n, 'values']} rules={[{ required: true, message: '请选择包含的值' }]} style={{ marginBottom: 0 }}>
                <Select mode="tags" size="small" placeholder="包含的原始值" options={optionsOf(dim)} maxTagCount="responsive" showSearch
                  optionFilterProp="searchLabel" optionRender={renderValueOption} filterOption={filterValueOption} />
              </Form.Item>
              {chartType === 'table' && depth < 3 && (
                <>
                  <Form.Item {...rest} name={[n, 'subDimension']} label={<span style={{ fontSize: 12, color: '#666' }}>{depth === 1 ? '二级维度' : '三级维度'}</span>}
                    style={{ margin: '8px 0 6px' }}>
                    <Select size="small" placeholder={`无${depth === 1 ? '二级' : '三级'}维度`} options={dimOptions} allowClear />
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate>
                    {() => {
                      const groupPath = rootPath ? [...rootPath, n] : [name, n];
                      const subDim = form.getFieldValue([...groupPath, 'subDimension']);
                      if (!subDim) return null;
                      return (
                        <div className="dash-group-children">
                          <div className="dash-group-child-head">
                            <span>{depth === 1 ? '二级维度分组归并（必填）' : '三级维度分组归并（必填）'}</span>
                            <Button type="link" size="small" onClick={() => loadPresets(subDim, [...groupPath, 'subGroups'])}>加载预设</Button>
                          </div>
                          {renderGroups([n, 'subGroups'], subDim, depth + 1, [...groupPath, 'subGroups'])}
                        </div>
                      );
                    }}
                  </Form.Item>
                </>
              )}
            </Card>
          ))}
          <Button type="dashed" size="small" block icon={<PlusOutlined />} onClick={() => add()}>{depth === 1 ? '添加分组' : `添加${depth === 2 ? '二级' : '三级'}分组`}</Button>
        </>
      )}
    </Form.List>
  );

  const handleCancel = (e) => {
    const isMaskClick = e?.target?.classList?.contains('ant-modal-wrap');
    if (isDirty && isMaskClick) {
      Modal.confirm({
        getContainer: getScopedPopupContainer,
        title: '确认取消',
        content: '检测到您已修改了内容，确认要取消并退出吗？未保存的内容将丢失。',
        okText: '确认取消',
        cancelText: '继续编辑',
        onOk: () => onClose(),
      });
    } else {
      onClose();
    }
  };

  return (
    <Modal title={(
      <div className="dash-chart-editor-titlebar">
        <span>{initialData ? '编辑图表' : '新增图表'}</span>
        <Button className="dash-chart-code-trigger" type="text" icon={<CodeOutlined />} onClick={openCodeEditor}
          aria-label="编辑代码" title="编辑代码" />
      </div>
    )} open={open} onOk={handleOk} onCancel={handleCancel}
      width={620} okText="保存" cancelText="取消" destroyOnHidden>
      <Form form={form} layout="vertical" onValuesChange={() => setIsDirty(true)}>
        <Form.Item name="title" label="图表标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="如 各机构需求分布" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="statDimension" label="统计维度" rules={[{ required: true }]}>
            <Select options={meta.statDimensions} />
          </Form.Item>
          <Form.Item name="statStage" label="统计阶段" rules={[{ required: true }]}>
            <Select options={meta.statStages} />
          </Form.Item>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Form.Item name="chart_type" label="图表类型" rules={[{ required: true }]}>
            <Select options={meta.chartTypes} onChange={(t) => { if (!X_TYPES.includes(t)) form.setFieldsValue({ xAxisDimension: undefined, xAxisGroups: [] }); }} />
          </Form.Item>
          <Form.Item name="dimension" label="主要维度（纵轴）" rules={[{ required: true }]}>
            <Select options={dimOptions} placeholder="主要维度" />
          </Form.Item>
        </div>

        {supportsX && (
          <Form.Item name="xAxisDimension" label="次要维度（横轴）" tooltip="用于堆叠柱、折线多系列或表格列">
            <Select options={dimOptions} placeholder="无（单一维度）" allowClear />
          </Form.Item>
        )}

        <Divider style={{ margin: '8px 0' }}>局部过滤</Divider>
        <Form.List name="filterList">
          {(fields, { add, remove }) => (
            <>
              {fields.map(({ key, name: n, ...rest }) => (
                <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                  <Form.Item {...rest} name={[n, 'dim']} rules={[{ required: true, message: '维度' }]} style={{ width: 150, marginBottom: 0 }}>
                    <Select options={dimOptions} placeholder="维度"
                      onChange={() => { const fl = form.getFieldValue('filterList'); fl[n].val = undefined; form.setFieldsValue({ filterList: fl }); }} />
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate={(p, c) => p.filterList?.[n]?.dim !== c.filterList?.[n]?.dim}>
                    {() => {
                      const dim = form.getFieldValue(['filterList', n, 'dim']);
                      if (isDate(dim)) {
                        return (
                          <Form.Item {...rest} name={[n, 'val']} rules={[{ required: true, message: '时间区间' }]} style={{ width: 260, marginBottom: 0 }}>
                            <DatePicker.RangePicker size="small" style={{ width: '100%' }} />
                          </Form.Item>
                        );
                      }
                      return (
                        <Form.Item {...rest} name={[n, 'val']} rules={[{ required: true, message: '值' }]} style={{ width: 260, marginBottom: 0 }}>
                          <Select mode="multiple" options={optionsOf(dim)} placeholder="一个或多个值" allowClear showSearch maxTagCount="responsive"
                            optionFilterProp="searchLabel" optionRender={renderValueOption} filterOption={filterValueOption} />
                        </Form.Item>
                      );
                    }}
                  </Form.Item>
                  <DeleteOutlined onClick={() => remove(n)} style={{ color: '#ff4d4f' }} />
                </Space>
              ))}
              <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()}>添加过滤条件</Button>
            </>
          )}
        </Form.List>

        <Divider style={{ margin: '12px 0 8px' }}>
          <Space>主要维度分组归并（纵轴）<Button type="link" size="small" onClick={() => loadPresets(dimension, 'groups')}>加载预设</Button></Space>
        </Divider>
        {renderGroups('groups', dimension)}

        {supportsX && xAxisDimension && (
          <>
            <Divider style={{ margin: '12px 0 8px' }}>
              <Space>次要维度分组归并（横轴）<Button type="link" size="small" onClick={() => loadPresets(xAxisDimension, 'xAxisGroups')}>加载预设</Button></Space>
            </Divider>
            {renderGroups('xAxisGroups', xAxisDimension)}
          </>
        )}

        <Divider style={{ margin: '12px 0' }} />
        <Space size="large">
          <Form.Item name="col_span" label="布局" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value={12}>半宽</Radio.Button>
              <Radio.Button value={18}>3/4宽</Radio.Button>
              <Radio.Button value={6}>1/4宽</Radio.Button>
              <Radio.Button value={24}>全宽</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="height" label="高度(px)" rules={[{ required: true }]} tooltip="表格可设 0 自适应">
            <InputNumber min={0} max={900} step={20} style={{ width: 120 }} />
          </Form.Item>
        </Space>
      </Form>

      <Modal title="编辑图表配置代码" open={codeOpen} onCancel={() => setCodeOpen(false)} onOk={applyCode}
        okText="应用到表单" cancelText="关闭" width={720}
        footer={(_, { OkBtn, CancelBtn }) => (
          <>
            <Button icon={<CopyOutlined />} onClick={copyCode}>复制代码</Button>
            <CancelBtn />
            <OkBtn />
          </>
        )}>
        <Input.TextArea value={codeText} onChange={(e) => setCodeText(e.target.value)}
          autoSize={{ minRows: 16, maxRows: 24 }} spellCheck={false}
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: 12 }} />
      </Modal>
    </Modal>
  );
}

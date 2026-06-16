/**
 * 文件：components/dashboard/ChartEditor.jsx
 * 用途：分析图表配置弹窗。可设标题、数据源、图表类型、主维度、次维度（堆叠/透视/折线），
 *       局部过滤（多值/时间区间）、主/次维度分组归并（自定义标签+颜色+一键加载预设）、
 *       半宽全宽与高度。产出 {title,chart_type,col_span,height,config}。
 * 作者：hengguan
 * 说明：看板图表配置编辑器，支持用户在交互式界面中设定图表的维度、指标和展示过滤条件。
 */

import React, { useEffect } from 'react';
import {
  Modal, Form, Input, Select, Radio, InputNumber, Divider, Button, Card, Space, DatePicker, App,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ColorPickerField from './ColorPickerField.jsx';

// 支持次维度（堆叠/横轴/透视）的图表类型
const X_TYPES = ['stacked_bar', 'stacked_bar_horizontal', 'line', 'area', 'table'];

export default function ChartEditor({ open, onClose, onSave, initialData, scope, meta }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const source = Form.useWatch('source', form);
  const chartType = Form.useWatch('chart_type', form);
  const dimension = Form.useWatch('dimension', form);
  const xAxisDimension = Form.useWatch('xAxisDimension', form);

  const dims = meta.dimsOf(source);
  const dimOptions = dims.map((d) => ({ value: d.key, label: d.label }));
  const supportsX = X_TYPES.includes(chartType);

  useEffect(() => {
    if (!open) return;
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
        source: cfg.source || 'requirement',
        dimension: cfg.dimension,
        xAxisDimension: cfg.xAxisDimension,
        filterList,
        groups: cfg.groups || [],
        xAxisGroups: cfg.xAxisGroups || [],
      });
    } else {
      form.setFieldsValue({
        title: '新图表', chart_type: 'pie', col_span: 12, height: 320,
        source: 'requirement', dimension: 'status', xAxisDimension: undefined,
        filterList: [], groups: [], xAxisGroups: [],
      });
    }
  }, [open, initialData]);

  // 维度取值选项（下拉/标签）
  const optionsOf = (dim) => meta.getOptions(dim);
  const isDate = (dim) => meta.dimMeta(dim)?.isDate;

  // 一键加载预设：用某维度的全部选项生成分组
  const loadPresets = (dim, field) => {
    const opts = optionsOf(dim);
    if (!opts.length) { message.info('该维度无可加载的预设（时间/自由文本维度请手动添加）'); return; }
    form.setFieldValue(field, opts.map((o) => ({ label: o.label, values: [o.value] })));
    message.success(`已加载 ${opts.length} 条预设`);
  };

  const handleOk = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const filters = {};
    (v.filterList || []).forEach((f) => {
      if (!f?.dim || f.val == null) return;
      if (isDate(f.dim) && Array.isArray(f.val) && f.val.length === 2) {
        filters[f.dim] = [f.val[0].format('YYYY-MM-DD'), f.val[1].format('YYYY-MM-DD')];
      } else if (Array.isArray(f.val) ? f.val.length : f.val !== '') {
        filters[f.dim] = f.val;
      }
    });
    const clean = (arr) => (arr || []).filter((g) => g?.label && g.values?.length)
      .map((g) => ({ label: g.label, values: g.values, ...(g.color ? { color: g.color } : {}) }));
    const config = {
      source: v.source,
      dimension: v.dimension,
      xAxisDimension: supportsX ? (v.xAxisDimension || undefined) : undefined,
      filters,
      groups: clean(v.groups),
      xAxisGroups: supportsX ? clean(v.xAxisGroups) : [],
    };
    onSave({ title: v.title, chart_type: v.chart_type, col_span: v.col_span, height: v.height, scope, config });
  };

  const handleCancel = () => {
    if (form.isFieldsTouched()) {
      Modal.confirm({
        title: '确认取消',
        content: '检测到您已修改了内容，确认要取消并退出吗？未保存的内容将丢失。',
        okText: '确认取消',
        cancelText: '保留修改',
        onOk: () => {
          onClose();
        }
      });
    } else {
      onClose();
    }
  };

  // 分组列表（主/次维度共用渲染）
  const renderGroups = (name, dim) => (
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
                  filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())} />
              </Form.Item>
            </Card>
          ))}
          <Button type="dashed" size="small" block icon={<PlusOutlined />} onClick={() => add()}>添加分组</Button>
        </>
      )}
    </Form.List>
  );

  return (
    <Modal title={initialData ? '编辑图表' : '新增图表'} open={open} onOk={handleOk} onCancel={handleCancel}
      width={620} okText="保存" cancelText="取消" destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="图表标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input placeholder="如 各机构需求分布" />
        </Form.Item>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Form.Item name="source" label="数据源" rules={[{ required: true }]}>
            <Select options={meta.sources} onChange={() => form.setFieldsValue({ dimension: undefined, xAxisDimension: undefined, filterList: [], groups: [], xAxisGroups: [] })} />
          </Form.Item>
          <Form.Item name="chart_type" label="图表类型" rules={[{ required: true }]}>
            <Select options={meta.chartTypes} onChange={(t) => { if (!X_TYPES.includes(t)) form.setFieldsValue({ xAxisDimension: undefined, xAxisGroups: [] }); }} />
          </Form.Item>
          <Form.Item name="dimension" label="主维度" rules={[{ required: true }]}>
            <Select options={dimOptions} placeholder="主维度" />
          </Form.Item>
        </div>

        {supportsX && (
          <Form.Item name="xAxisDimension" label="次维度（堆叠/表格列/横轴）" tooltip="用于堆叠柱、折线多系列或表格的列">
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
                            filterOption={(i, o) => String(o?.label ?? '').toLowerCase().includes(i.toLowerCase())} />
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
          <Space>主维度分组归并<Button type="link" size="small" onClick={() => loadPresets(dimension, 'groups')}>加载预设</Button></Space>
        </Divider>
        {renderGroups('groups', dimension)}

        {supportsX && xAxisDimension && (
          <>
            <Divider style={{ margin: '12px 0 8px' }}>
              <Space>次维度分组归并<Button type="link" size="small" onClick={() => loadPresets(xAxisDimension, 'xAxisGroups')}>加载预设</Button></Space>
            </Divider>
            {renderGroups('xAxisGroups', xAxisDimension)}
          </>
        )}

        <Divider style={{ margin: '12px 0' }} />
        <Space size="large">
          <Form.Item name="col_span" label="布局" rules={[{ required: true }]}>
            <Radio.Group>
              <Radio.Button value={12}>半宽</Radio.Button>
              <Radio.Button value={24}>全宽</Radio.Button>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="height" label="高度(px)" rules={[{ required: true }]} tooltip="表格可设 0 自适应">
            <InputNumber min={0} max={900} step={20} style={{ width: 120 }} />
          </Form.Item>
        </Space>
      </Form>
    </Modal>
  );
}

/**
 * 文件：pages/Dashboard.jsx
 * 用途：效能仪表盘。顶置 5 原子指标卡（终态计数）+ 用户自定义图表矩阵
 *       （柱状图/面积图/饼图/表格，颜色可配，按机构/板块/系统/状态等维度聚合）。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import {
  Card, Row, Col, Progress, Button, Modal, Form, Input, Select, ColorPicker, Table, Empty, Popconfirm, message, Space,
} from 'antd';
import {
  FileTextOutlined, CodeOutlined, ExperimentOutlined, UserOutlined, RocketOutlined, PlusOutlined, DeleteOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { apiGet, apiPost, apiDelete } from '../api/client.js';
import { useAppStore } from '../stores/app.js';
import { METRIC_COLORS } from '../theme/presets.js';

const SOURCE_OPTIONS = [
  { value: 'requirement', label: '业务需求' }, { value: 'dev', label: '开发任务' },
  { value: 'sit', label: '应用组装测试' }, { value: 'uat', label: '用户测试' },
  { value: 'nft', label: '非功能测试' }, { value: 'sec', label: '安全测试' },
];
const DIM_OPTIONS = [
  { value: 'status', label: '任务状态' }, { value: 'org', label: '实施机构' },
  { value: 'sector', label: '业务板块' }, { value: 'system', label: '所属系统' },
];
const TYPE_OPTIONS = [
  { value: 'bar', label: '柱状图' }, { value: 'area', label: '面积图' },
  { value: 'pie', label: '饼图' }, { value: 'table', label: '表格' },
];

/** 单个图表卡片：按配置拉取数据并渲染 */
function ChartCard({ chart, releasePointIds, theme, onDelete }) {
  const [data, setData] = useState([]);
  const cfg = typeof chart.config === 'string' ? JSON.parse(chart.config) : chart.config;
  const color = cfg.color || '#0E9F6E';

  useEffect(() => {
    apiPost('/dashboard/chart-data', { source: cfg.source, dimension: cfg.dimension, releasePointIds })
      .then((d) => setData(d.data || []));
  }, [chart.id, JSON.stringify(releasePointIds)]);

  const renderChart = () => {
    if (chart.chart_type === 'table') {
      return <Table size="small" pagination={false} rowKey="name"
        columns={[{ title: '维度', dataIndex: 'name' }, { title: '数量', dataIndex: 'value', align: 'right' }]}
        dataSource={data} />;
    }
    const base = {
      backgroundColor: 'transparent',
      tooltip: { trigger: chart.chart_type === 'pie' ? 'item' : 'axis' },
      grid: { left: 40, right: 16, top: 20, bottom: 40 },
    };
    let option;
    if (chart.chart_type === 'pie') {
      option = { ...base, series: [{ type: 'pie', radius: ['40%', '70%'], data, label: { color: theme === 'dark' ? '#ccc' : '#333' } }], color: [color, '#52c41a', '#13c2c2', '#faad14', '#eb2f96', '#722ed1'] };
    } else {
      option = {
        ...base,
        xAxis: { type: 'category', data: data.map((d) => d.name), axisLabel: { rotate: data.length > 6 ? 30 : 0 } },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar',
          data: data.map((d) => d.value),
          itemStyle: { color },
          ...(chart.chart_type === 'area' ? { type: 'line', areaStyle: { color }, smooth: true, lineStyle: { color } } : {}),
        }],
      };
    }
    return <ReactECharts option={option} style={{ height: 280 }} theme={theme === 'dark' ? 'dark' : undefined} />;
  };

  return (
    <Card
      size="small" title={chart.title}
      extra={<Popconfirm title="删除该图表？" onConfirm={() => onDelete(chart.id)}><Button type="text" size="small" danger icon={<DeleteOutlined />} /></Popconfirm>}
    >
      {data.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" /> : renderChart()}
    </Card>
  );
}

export default function Dashboard() {
  const { releasePointIds, theme } = useAppStore();
  const [metrics, setMetrics] = useState({});
  const [charts, setCharts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const loadMetrics = () => apiGet('/dashboard/metrics', { releasePointIds: (releasePointIds || []).join(',') }).then(setMetrics);
  const loadCharts = () => apiGet('/dashboard/charts').then(setCharts);

  useEffect(() => { loadMetrics(); }, [JSON.stringify(releasePointIds)]);
  useEffect(() => { loadCharts(); }, []);

  const addChart = async () => {
    const v = await form.validateFields();
    const color = v.color && typeof v.color === 'object' ? v.color.toHexString() : (v.color || '#0E9F6E');
    await apiPost('/dashboard/charts', {
      title: v.title, chart_type: v.chart_type,
      config: { source: v.source, dimension: v.dimension, color },
    });
    message.success('已添加图表');
    setOpen(false);
    form.resetFields();
    loadCharts();
  };

  const delChart = async (id) => { await apiDelete(`/dashboard/charts/${id}`); loadCharts(); };

  const cards = [
    { key: 'requirement', title: '业务需求', icon: <FileTextOutlined />, color: METRIC_COLORS.requirement },
    { key: 'dev', title: '开发任务', icon: <CodeOutlined />, color: METRIC_COLORS.dev },
    { key: 'sit', title: 'SIT测试任务', icon: <ExperimentOutlined />, color: METRIC_COLORS.sit },
    { key: 'uat', title: 'UAT测试任务', icon: <UserOutlined />, color: METRIC_COLORS.uat },
    { key: 'releaseSystem', title: '投产系统', icon: <RocketOutlined />, color: METRIC_COLORS.releaseSystem },
  ];

  return (
    <div>
      {/* 5 原子指标卡：等分铺满整行，展示 终态完成数 / 总数 */}
      <Row gutter={[16, 16]} wrap>
        {cards.map((c) => {
          const m = metrics[c.key] || { total: 0, terminal: 0 };
          const pct = m.total ? Math.round((m.terminal / m.total) * 100) : 0;
          return (
            <Col key={c.key} style={{ flex: '1 1 170px', minWidth: 0 }}>
              <div className="stat-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span className="label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
                  <span className="icon" style={{ background: c.color + '1f', color: c.color }}>{c.icon}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span className="value" style={{ color: 'var(--radar-ink)' }}>{m.total}</span>
                </div>
                <Progress percent={pct} showInfo={false} strokeColor={c.color} trailColor="var(--radar-border)" strokeWidth={6} style={{ marginTop: 12, marginBottom: 2 }} />
                <div className="done-text"><b style={{ color: c.color }}>{m.terminal}/{m.total}</b> 已完成</div>
              </div>
            </Col>
          );
        })}
      </Row>

      {/* 自定义图表 */}
      <Card
        title="分析图表" variant="borderless" style={{ marginTop: 16 }}
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新增图表</Button>}
      >
        {charts.length === 0 ? <Empty description="点击右上角新增自定义分析图表" /> : (
          <Row gutter={[16, 16]}>
            {charts.map((ch) => (
              <Col key={ch.id} xs={24} sm={24} md={12} lg={12} xl={8}>
                <ChartCard chart={ch} releasePointIds={releasePointIds} theme={theme} onDelete={delChart} />
              </Col>
            ))}
          </Row>
        )}
      </Card>

      <Modal open={open} title="新增分析图表" onCancel={() => setOpen(false)} onOk={addChart} okText="保存">
        <Form form={form} layout="vertical">
          <Form.Item name="title" label="图表标题" rules={[{ required: true }]}><Input placeholder="如 各机构需求分布" /></Form.Item>
          <Form.Item name="chart_type" label="图表类型" rules={[{ required: true }]} initialValue="bar">
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="source" label="数据源" rules={[{ required: true }]} initialValue="requirement">
            <Select options={SOURCE_OPTIONS} />
          </Form.Item>
          <Form.Item name="dimension" label="统计维度" rules={[{ required: true }]} initialValue="status">
            <Select options={DIM_OPTIONS} />
          </Form.Item>
          <Form.Item name="color" label="主色" initialValue="#0E9F6E"><ColorPicker showText /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

/**
 * 文件：pages/pams/PamsDashboard.jsx
 * 用途：PAMS 统计仪表盘迁移页。提供轮次/机构筛选、问题数据看板、图表和下钻明细。
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card, Row, Col, Select, Space, Button, Spin, Statistic, Table, Modal, Drawer,
  Descriptions, Tag, Typography, Empty, message,
} from 'antd';
import {
  ReloadOutlined, FileTextOutlined, CheckCircleOutlined, ClockCircleOutlined,
  ExclamationCircleOutlined, BankOutlined, TeamOutlined, BulbOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { apiGet, apiPost } from '../../api/client.js';

const { Text, Title } = Typography;

const BOARD_COLUMNS = [
  { id: 'total', label: '问题总数', values: ['__ALL__'], color: '#1677ff', icon: <FileTextOutlined /> },
  { id: 'jinke', label: '金科', values: ['金科技术'], color: '#1677ff', icon: <BankOutlined /> },
  { id: 'nongxin', label: '农信', values: ['农信技术', '农信业务'], color: '#ff4d4f', icon: <TeamOutlined /> },
  { id: 'demand', label: '需求', values: ['新增需求'], color: '#fa8c16', icon: <BulbOutlined /> },
  { id: 'other', label: '其它', values: ['其它'], color: '#8c8c8c', icon: <AppstoreOutlined /> },
];

const BOARD_ROWS = [
  { id: 'total', label: '总数', values: ['__ALL__'], color: '#1677ff' },
  { id: 'resolved', label: '已解决', values: ['已解决'], color: '#52c41a' },
  { id: 'unresolved', label: '未解决', values: ['提出', '处理中', '待验证', '重现', '已查明原因'], color: '#faad14' },
];

const CHARTS = [
  { key: 'byCategoryGroup', title: '问题分类概况', type: 'pie', dimension: 'category_group', span: 12 },
  { key: 'byCombinedDetailedClass', title: '问题详细分类', type: 'barH', dimension: 'detailed_classification', span: 12 },
  { key: 'byStatus', title: '问题状态分布', type: 'bar', dimension: 'status', span: 12 },
  { key: 'byBusinessGroup', title: '实施机构分布', type: 'barH', dimension: 'business_group', span: 12 },
  { key: 'byUrgency', title: '紧急程度', type: 'pie', dimension: 'urgency', span: 8 },
  { key: 'byHandlingMethod', title: '处理方式', type: 'pie', dimension: 'handling_method', span: 8 },
  { key: 'byRound', title: '轮次分布', type: 'bar', dimension: 'round', span: 8 },
];

function groupForCategory(category) {
  if (category === '金科技术') return '金科';
  if (category === '农信技术' || category === '农信业务') return '农信';
  if (category === '新增需求') return '需求';
  return '其它';
}

function buildOptions(rows, code) {
  return (rows || [])
    .filter((item) => item.dict_code === code)
    .map((item) => ({ value: item.item_key, label: item.item_value, raw: item }));
}

function labelOf(dicts, code, value) {
  if (!value) return value;
  return dicts[code]?.find((item) => item.value === value)?.label || value;
}

function chartOption(chart, data, dicts) {
  const colors = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#13c2c2', '#722ed1', '#8c8c8c', '#eb2f96'];
  const mapped = (data || []).map((item) => ({
    ...item,
    name: labelOf(dicts, dimensionToDict(chart.dimension), item.name),
  }));
  if (chart.type === 'pie') {
    return {
      color: colors,
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, type: 'scroll', itemGap: 8, textStyle: { fontSize: 11 } },
      series: [{
        type: 'pie',
        radius: ['48%', '76%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 0, borderColor: '#fff', borderWidth: 1 },
        label: { formatter: '{b}: {c}', fontSize: 11 },
        data: mapped,
      }],
    };
  }
  const horizontal = chart.type === 'barH';
  const sorted = horizontal ? [...mapped].reverse() : mapped;
  return {
    color: colors,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 12, right: 24, top: 12, bottom: 16, containLabel: true },
    xAxis: horizontal ? { type: 'value' } : { type: 'category', data: sorted.map((i) => i.name), axisLabel: { interval: 0, rotate: sorted.length > 6 ? 30 : 0 } },
    yAxis: horizontal ? { type: 'category', data: sorted.map((i) => i.name), axisLabel: { fontSize: 11 } } : { type: 'value' },
    series: [{
      type: 'bar',
      barMaxWidth: 32,
      data: sorted.map((i) => ({ value: i.value, originalName: i.name })),
      label: { show: true, position: horizontal ? 'right' : 'top', fontSize: 11 },
      itemStyle: { borderRadius: 0 },
    }],
  };
}

function dimensionToDict(dimension) {
  return {
    status: 'issue_status',
    category: 'issue_category',
    detailed_classification: 'issue_detailed_classification',
    business_group: 'business_group',
    module: 'module',
    system: 'system',
    round: 'issue_round',
    urgency: 'issue_urgency',
    handling_method: 'issue_handling_method',
  }[dimension];
}

export default function PamsDashboard() {
  const [dictRows, setDictRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRound, setSelectedRound] = useState([]);
  const [selectedBusinessGroup, setSelectedBusinessGroup] = useState([]);
  const [modal, setModal] = useState({ open: false, title: '', filters: {}, page: 1, pageSize: 10, rows: [], total: 0, loading: false });
  const [detail, setDetail] = useState({ open: false, data: null, loading: false });

  const dicts = useMemo(() => ({
    issue_round: buildOptions(dictRows, 'issue_round'),
    business_group: buildOptions(dictRows, 'business_group'),
    issue_status: buildOptions(dictRows, 'issue_status'),
    issue_category: buildOptions(dictRows, 'issue_category'),
    issue_detailed_classification: buildOptions(dictRows, 'issue_detailed_classification'),
    issue_urgency: buildOptions(dictRows, 'issue_urgency'),
    issue_handling_method: buildOptions(dictRows, 'issue_handling_method'),
  }), [dictRows]);

  const queryBase = useMemo(() => {
    const q = {};
    if (selectedRound.length) q.round = selectedRound.join(',');
    if (selectedBusinessGroup.length) q.businessGroup = selectedBusinessGroup.join(',');
    return q;
  }, [selectedRound, selectedBusinessGroup]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet('/pams/stats', {
        ...queryBase,
        boardColDim: 'category',
        boardRowDim: 'status',
      });
      setStats(data);
    } finally {
      setLoading(false);
    }
  }, [queryBase]);

  useEffect(() => {
    apiGet('/pams/dicts').then((rows) => {
      setDictRows(rows || []);
      const defaultRound = rows?.find((r) => r.dict_code === 'issue_round' && r.is_default_val === 1);
      if (defaultRound) setSelectedRound([defaultRound.item_key]);
    }).catch((err) => message.error(err.message || '加载字典失败'));
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const boardValue = (column, row) => {
    if (!stats) return 0;
    if (column.id === 'total' && row.id === 'total') return stats.total || 0;
    if (column.id === 'total' && row.id === 'resolved') return stats.resolved || 0;
    if (column.id === 'total' && row.id === 'unresolved') return stats.pending || 0;
    const group = column.label;
    const groupStats = stats.categoryGroups?.[group] || { total: 0, resolved: 0, unresolved: 0 };
    if (row.id === 'total') return groupStats.total || 0;
    if (row.id === 'resolved') return groupStats.resolved || 0;
    if (row.id === 'unresolved') return groupStats.unresolved || 0;
    return 0;
  };

  const modalFiltersToQuery = (filters) => {
    const q = {};
    for (const [key, value] of Object.entries(filters || {})) {
      if (Array.isArray(value)) {
        if (value.length) q[key] = value.join(',');
      } else if (value !== undefined && value !== null && value !== '') {
        q[key] = value;
      }
    }
    if (selectedRound.length) q.round = selectedRound.join(',');
    if (selectedBusinessGroup.length) q.business_group = selectedBusinessGroup.join(',');
    return q;
  };

  const openIssueModal = async (title, filters, page = 1, pageSize = modal.pageSize || 10) => {
    setModal((prev) => ({ ...prev, open: true, title, filters, page, pageSize, loading: true }));
    try {
      const data = await apiGet('/pams/issues', { ...modalFiltersToQuery(filters), page, pageSize });
      setModal((prev) => ({
        ...prev,
        rows: data.items || [],
        total: data.total || 0,
        page,
        pageSize,
        loading: false,
      }));
    } catch (err) {
      setModal((prev) => ({ ...prev, loading: false }));
      message.error(err.message || '加载问题列表失败');
    }
  };

  const openBoardCell = (column, row) => {
    const filters = {};
    if (!column.values.includes('__ALL__')) {
      if (column.id === 'other') filters.category_group = ['其它'];
      else filters.category = column.values;
    }
    if (!row.values.includes('__ALL__')) filters.status = row.values;
    openIssueModal(`${column.label} - ${row.label}`, filters);
  };

  const openChart = (chart, params) => {
    const rawName = params?.name;
    const filters = {};
    if (chart.dimension === 'category_group') {
      if (rawName === '金科') filters.category = ['金科技术'];
      else if (rawName === '农信') filters.category = ['农信技术', '农信业务'];
      else if (rawName === '需求') filters.category = ['新增需求'];
      else filters.category_group = ['其它'];
    } else {
      const dictCode = dimensionToDict(chart.dimension);
      const rawValue = dictCode ? dicts[dictCode]?.find((item) => item.label === rawName)?.value || rawName : rawName;
      filters[chart.dimension] = rawValue;
    }
    openIssueModal(chart.title + (rawName ? ` - ${rawName}` : ''), filters);
  };

  const openDetail = async (record) => {
    setDetail({ open: true, data: null, loading: true });
    try {
      const data = await apiGet(`/pams/issues/${record.issue_id}`);
      setDetail({ open: true, data, loading: false });
    } catch (err) {
      setDetail({ open: false, data: null, loading: false });
      message.error(err.message || '加载详情失败');
    }
  };

  const chartData = (chart) => stats?.[chart.key] || [];

  return (
    <div className="pams-dashboard">
      <Card variant="borderless" className="pams-toolbar-card">
        <Space wrap size={12}>
          <Text strong>统计仪表盘</Text>
          <Select
            mode="multiple"
            allowClear
            placeholder="问题轮次"
            value={selectedRound}
            options={dicts.issue_round}
            onChange={setSelectedRound}
            style={{ width: 240 }}
            maxTagCount="responsive"
          />
          <Select
            mode="multiple"
            allowClear
            placeholder="实施机构"
            value={selectedBusinessGroup}
            options={dicts.business_group}
            onChange={setSelectedBusinessGroup}
            style={{ width: 260 }}
            maxTagCount="responsive"
          />
          <Button icon={<ReloadOutlined />} onClick={loadStats}>刷新</Button>
        </Space>
      </Card>

      <Spin spinning={loading}>
        <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
          <Col xs={12} md={6}><MetricCard title="问题总数" value={stats?.total || 0} color="#1677ff" icon={<FileTextOutlined />} /></Col>
          <Col xs={12} md={6}><MetricCard title="已解决" value={stats?.resolved || 0} color="#52c41a" icon={<CheckCircleOutlined />} /></Col>
          <Col xs={12} md={6}><MetricCard title="未解决" value={stats?.pending || 0} color="#faad14" icon={<ClockCircleOutlined />} /></Col>
          <Col xs={12} md={6}><MetricCard title="重大问题" value={stats?.major || 0} color="#ff4d4f" icon={<ExclamationCircleOutlined />} /></Col>
        </Row>

        <Card title="问题数据看板" variant="borderless" className="pams-board-card">
          <div className="pams-board">
            <div className="pams-board-head pams-board-corner">分类 / 状态</div>
            {BOARD_COLUMNS.map((col) => (
              <div key={col.id} className="pams-board-head">
                <span style={{ color: col.color }}>{col.icon}</span>
                <span>{col.label}</span>
              </div>
            ))}
            {BOARD_ROWS.map((row) => (
              <React.Fragment key={row.id}>
                <div className="pams-board-row-title" style={{ borderLeftColor: row.color }}>{row.label}</div>
                {BOARD_COLUMNS.map((col) => {
                  const value = boardValue(col, row);
                  return (
                    <button
                      key={`${row.id}-${col.id}`}
                      className="pams-board-cell"
                      type="button"
                      onClick={() => value > 0 && openBoardCell(col, row)}
                    >
                      <span style={{ color: col.color }}>{value}</span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </Card>

        <Row gutter={[12, 12]}>
          {CHARTS.map((chart) => (
            <Col key={chart.key} xs={24} lg={chart.span}>
              <Card size="small" title={chart.title} variant="borderless" className="pams-chart-card">
                {chartData(chart).length ? (
                  <ReactECharts
                    option={chartOption(chart, chartData(chart), dicts)}
                    style={{ height: chart.span === 8 ? 280 : 340 }}
                    opts={{ renderer: 'svg' }}
                    onEvents={{ click: (params) => openChart(chart, params) }}
                  />
                ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无数据" />}
              </Card>
            </Col>
          ))}
        </Row>
      </Spin>

      <Modal
        title={modal.title}
        open={modal.open}
        onCancel={() => setModal((prev) => ({ ...prev, open: false }))}
        footer={null}
        width={980}
        destroyOnHidden
      >
        <Table
          size="small"
          rowKey="issue_id"
          loading={modal.loading}
          dataSource={modal.rows}
          pagination={{
            current: modal.page,
            pageSize: modal.pageSize,
            total: modal.total,
            showSizeChanger: true,
            onChange: (page, pageSize) => openIssueModal(modal.title, modal.filters, page, pageSize),
          }}
          onRow={(record) => ({ onClick: () => openDetail(record) })}
          columns={[
            { title: '问题编号', dataIndex: 'issue_id', width: 150, render: (v) => <Text code>{v}</Text> },
            { title: '状态', dataIndex: 'status', width: 100, render: (v) => <Tag style={{ borderRadius: 0 }}>{v}</Tag> },
            { title: '分类', dataIndex: 'category', width: 110 },
            { title: '详细分类', dataIndex: 'detailed_classification', width: 150 },
            { title: '所属系统', dataIndex: 'system', width: 170, ellipsis: true },
            { title: '问题概述', dataIndex: 'summary', ellipsis: true },
          ]}
        />
      </Modal>

      <Drawer
        title={detail.data?.issue_id || '问题详情'}
        open={detail.open}
        width={720}
        onClose={() => setDetail({ open: false, data: null, loading: false })}
      >
        <Spin spinning={detail.loading}>
          {detail.data ? <IssueDescriptions issue={detail.data} /> : null}
        </Spin>
      </Drawer>
    </div>
  );
}

function MetricCard({ title, value, color, icon }) {
  return (
    <Card variant="borderless" className="pams-metric-card">
      <div className="pams-metric-icon" style={{ color, borderColor: color }}>{icon}</div>
      <Statistic title={title} value={value} valueStyle={{ color, fontSize: 28 }} />
    </Card>
  );
}

function IssueDescriptions({ issue }) {
  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Descriptions bordered size="small" column={1}>
        <Descriptions.Item label="状态"><Tag style={{ borderRadius: 0 }}>{issue.status}</Tag></Descriptions.Item>
        <Descriptions.Item label="问题概述">{issue.summary}</Descriptions.Item>
        <Descriptions.Item label="问题详情"><div style={{ whiteSpace: 'pre-wrap' }}>{issue.details || '-'}</div></Descriptions.Item>
        <Descriptions.Item label="分类">{[issue.category, issue.detailed_classification, issue.urgency, issue.handling_method].filter(Boolean).join(' / ')}</Descriptions.Item>
        <Descriptions.Item label="归属">{[issue.business_group, issue.module, issue.system].filter(Boolean).join(' / ')}</Descriptions.Item>
        <Descriptions.Item label="跟踪人">{[issue.tracker_name, issue.tracker_org, issue.tracker_contact].filter(Boolean).join(' / ')}</Descriptions.Item>
        <Descriptions.Item label="报障人">{[issue.reporter_name, issue.reporter_org, issue.reporter_contact].filter(Boolean).join(' / ') || '-'}</Descriptions.Item>
        <Descriptions.Item label="处理人">{[issue.handler_name, issue.handler_org, issue.handler_contact].filter(Boolean).join(' / ') || '-'}</Descriptions.Item>
        <Descriptions.Item label="原因分析"><div style={{ whiteSpace: 'pre-wrap' }}>{issue.root_cause || '-'}</div></Descriptions.Item>
        <Descriptions.Item label="解决方案"><div style={{ whiteSpace: 'pre-wrap' }}>{issue.solution || '-'}</div></Descriptions.Item>
      </Descriptions>
      {issue.analysis_log?.length ? (
        <Card size="small" title="分析记录" variant="borderless">
          <Space direction="vertical" style={{ width: '100%' }}>
            {issue.analysis_log.map((item, index) => (
              <div key={index} className="pams-analysis-log">
                <Text type="secondary">{item.time || item.operation_time || ''}</Text>
                <div>{item.content || item.text || JSON.stringify(item)}</div>
              </div>
            ))}
          </Space>
        </Card>
      ) : null}
    </Space>
  );
}

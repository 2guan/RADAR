/**
 * 文件：pages/Dashboard.jsx
 * 用途：效能仪表盘。顶置原子指标卡（终态计数）+ 「系统图表」「我的图表」两分区的
 *       自定义分析图表（多维度组合/分组归并/局部过滤/透视/钻取，颜色与布局可配）。
 * 作者：hengguan
 * 说明：投产度量大屏和多维图表展示面板，汇总需求开发时效、投产通过率及任务分布等度量指标。
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Card, Row, Col, Progress, Button, Empty, message, Modal, Table, Grid, Spin, List,
} from 'antd';
import {
  FileTextOutlined, CodeOutlined, ExperimentOutlined, UserOutlined, RocketOutlined, PlusOutlined,
} from '@ant-design/icons';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client.js';
import { useAppStore } from '../stores/app.js';
import { getPreset } from '../theme/presets.js';
import { useDimensionMeta } from '../components/dashboard/useDimensionMeta.js';
import { useResponsive } from '../hooks/useResponsive.js';
import ChartEditor from '../components/dashboard/ChartEditor.jsx';
import DashboardChart from '../components/dashboard/DashboardChart.jsx';
import { VersionOverviewWorkItemDetail } from './Overview.jsx';

const { useBreakpoint } = Grid;

/** 按 col_span 累加分行，返回 chartId → 该行最大高度（用于同行对齐；表格 height=0 保持自适应） */
function rowHeights(charts) {
  const map = {}; let span = 0; let cur = [];
  const flush = () => {
    const hs = cur.filter((c) => c.height !== 0).map((c) => c.height || 320);
    const max = hs.length ? Math.max(...hs) : 320;
    cur.forEach((c) => { map[c.id] = c.height === 0 ? 0 : max; });
  };
  charts.forEach((c) => {
    const s = c.col_span || 12;
    if (span + s > 24) { flush(); cur = [c]; span = s; } else { cur.push(c); span += s; }
  });
  if (cur.length) flush();
  return map;
}

export default function Dashboard() {
  const { releasePointIds, theme, preset, can } = useAppStore();
  const currentPreset = getPreset(preset);
  const activeColors = theme === 'dark' ? currentPreset.dark : currentPreset.light;
  const meta = useDimensionMeta();
  const screens = useBreakpoint();
  const { isMobile } = useResponsive();
  const [metrics, setMetrics] = useState({});
  const [charts, setCharts] = useState([]);
  const [chartData, setChartData] = useState({});   // chartId → 聚合数据
  const [chartLoading, setChartLoading] = useState(true);
  const [editor, setEditor] = useState({ open: false, chart: null, scope: 'user' });
  const [drill, setDrill] = useState({ open: false, title: '', rows: [], loading: false });
  const [overviewDetail, setOverviewDetail] = useState({ open: false, code: '', systemName: '', data: null, loading: false });

  const canManage = can('dashboard', 'manage');

  const loadMetrics = () => apiGet('/dashboard/metrics', { releasePointIds: (releasePointIds || []).join(',') }).then(setMetrics);
  const loadCharts = () => apiGet('/dashboard/charts').then((rows) => setCharts(rows || []));

  useEffect(() => { loadMetrics(); }, [JSON.stringify(releasePointIds)]);
  useEffect(() => { loadCharts(); }, []);

  // 所有图表数据一次性批量拉取：图表集合或投产窗口变化时重算，避免每图一请求
  const chartSig = useMemo(
    () => JSON.stringify(charts.map((c) => [c.id, c.config])),
    [charts],
  );
  useEffect(() => {
    if (!charts.length) { setChartData({}); setChartLoading(false); return undefined; }
    let alive = true;
    setChartLoading(true);
    const payload = charts.map((c) => ({
      id: c.id,
      config: typeof c.config === 'string' ? JSON.parse(c.config) : (c.config || {}),
    }));
    apiPost('/dashboard/chart-data-batch', { charts: payload, releasePointIds })
      .then((d) => { if (alive) { setChartData(d?.data || {}); setChartLoading(false); } })
      .catch(() => { if (alive) setChartLoading(false); });
    return () => { alive = false; };
  }, [chartSig, JSON.stringify(releasePointIds)]);

  const sysCharts = useMemo(() => charts.filter((c) => c.scope === 'system'), [charts]);
  const myCharts = useMemo(() => charts.filter((c) => c.scope === 'user'), [charts]);

  // ---- 增删改 ----
  const saveChart = async (payload) => {
    if (editor.chart) await apiPut(`/dashboard/charts/${editor.chart.id}`, payload);
    else await apiPost('/dashboard/charts', { ...payload, sort: charts.filter((c) => c.scope === payload.scope).length });
    message.success(editor.chart ? '已更新' : '已添加');
    setEditor({ open: false, chart: null, scope: 'user' });
    loadCharts();
  };
  const deleteChart = async (id) => { await apiDelete(`/dashboard/charts/${id}`); loadCharts(); };
  const moveChart = async (list, chart, dir) => {
    const idx = list.findIndex((c) => c.id === chart.id);
    const swap = dir === 'left' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= list.length) return;
    const reordered = [...list];
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    await Promise.all(reordered.map((c, i) => (c.sort !== i
      ? apiPut(`/dashboard/charts/${c.id}`, { sort: i }) : null)).filter(Boolean));
    loadCharts();
  };

  // ---- 钻取 ----
  const onDrill = async (config, filters, title, dimensionLabel) => {
    setDrill({ open: true, title: `${title}-${dimensionLabel || '统计'}维度明细`, rows: [], loading: true });
    const d = await apiPost('/dashboard/chart-drilldown', { ...config, filters, releasePointIds });
    setDrill((current) => ({ ...current, rows: d?.data || [], loading: false }));
  };

  // 仪表盘内直接打开版本概览的同一套生命周期详情内容。
  const openOverviewDetail = async (row) => {
    const code = row.req_code || row.code;
    if (!code) return;
    setOverviewDetail({ open: true, code, systemName: row.system, data: null, loading: true });
    try {
      const data = await apiGet(`/overview/${code}/detail`);
      setOverviewDetail((current) => ({ ...current, data: { entityType: data.entityType || 'requirement', ...data }, loading: false }));
    } catch {
      setOverviewDetail((current) => ({ ...current, loading: false }));
    }
  };

  const cards = [
    { key: 'requirement', title: '业务需求', icon: <FileTextOutlined />, color: activeColors.statusInitial },
    { key: 'ticket', title: '生产工单', icon: <FileTextOutlined />, color: activeColors.statusInProgress },
    { key: 'dev', title: '开发任务', icon: <CodeOutlined />, color: activeColors.primaryDeep },
    { key: 'sit', title: 'SIT测试任务', icon: <ExperimentOutlined />, color: activeColors.highlight },
    { key: 'uat', title: 'UAT测试任务', icon: <UserOutlined />, color: activeColors.accent },
    { key: 'releaseSystem', title: '投产系统', icon: <RocketOutlined />, color: activeColors.statusFinal },
  ];

  const renderSection = (title, list, scope, editable) => {
    const heights = rowHeights(list);
    return (
      <div key={scope}>
        <div className="dash-section-head">
          <span className="title">{title}</span>
          {editable && (
            <Button type="primary" ghost size="small" icon={<PlusOutlined />}
              onClick={() => setEditor({ open: true, chart: null, scope })}>新增图表</Button>
          )}
        </div>
        {list.length === 0 ? (
          // 我的图表为空时不显示占位区（仅保留标题与"新增图表"入口）
          scope === 'user' ? null : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={editable ? '点击右上角新增分析图表' : '管理员暂未配置系统图表'} style={{ padding: '24px 0' }} />
          )
        ) : (
          <Row gutter={[16, 16]}>
            {list.map((ch, i) => (
              <Col key={ch.id} xs={24} lg={ch.col_span || 12}>
                <DashboardChart
                  chart={ch} data={chartData[ch.id] || []} loading={chartLoading} theme={theme}
                  activeColors={activeColors}
                  editable={editable} isFirst={i === 0} isLast={i === list.length - 1}
                  forcedHeight={screens.lg ? heights[ch.id] : undefined}
                  onEdit={() => setEditor({ open: true, chart: ch, scope })}
                  onDelete={() => deleteChart(ch.id)}
                  onMove={(dir) => moveChart(list, ch, dir)}
                  onDrill={onDrill} labelOf={meta.labelOf} dimName={(d) => meta.dimMeta(d)?.label || d} />
              </Col>
            ))}
          </Row>
        )}
      </div>
    );
  };

  return (
    // overflowX:hidden 吸收各 Row 栅格槽（gutter 16 → 负 -8 外边距）造成的 8px 横向溢出，
    // 消除仪表盘底部的横向滚动条；根容器高度自适应，不会引入纵向滚动条。
    <div style={{ overflowX: 'hidden' }}>
      {/* 原子指标卡 */}
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

      {/* 分析图表分区 */}
      {!meta.ready ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}><Spin /></div>
      ) : (
        <>
          {renderSection('我的图表', myCharts, 'user', true)}
          {renderSection('系统图表', sysCharts, 'system', canManage)}
        </>
      )}

      {/* 配置弹窗 */}
      {meta.ready && (
        <ChartEditor open={editor.open} initialData={editor.chart} scope={editor.scope} meta={meta}
          onClose={() => setEditor({ open: false, chart: null, scope: 'user' })} onSave={saveChart} />
      )}

      {/* 钻取记录列表 */}
      <Modal open={drill.open} title={`钻取明细 · ${drill.title}`} footer={null} width={900}
        onCancel={() => setDrill({ ...drill, open: false })}>
        {isMobile ? (
          // 手机端：钻取明细改用卡片列表，避免表格横向滚动
          <List
            loading={drill.loading}
            dataSource={drill.rows}
            rowKey={(r, i) => `${r.code}_${i}`}
            locale={{ emptyText: <Empty description="暂无数据" /> }}
            pagination={{ pageSize: 8, size: 'small', showSizeChanger: false }}
            renderItem={(r) => (
              <Card size="small" hoverable style={{ marginBottom: 10, cursor: 'pointer' }} onClick={() => openOverviewDetail(r)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontWeight: 600, fontSize: 12 }}>{r.code || '—'}</span>
                  {r.status && <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)', whiteSpace: 'nowrap' }}>{r.status}</span>}
                </div>
                {r.name && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{r.name}</div>}
                <div className="crud-card-row"><span className="crud-card-label">系统</span><span className="crud-card-value">{r.system || '—'}</span></div>
                <div className="crud-card-row"><span className="crud-card-label">机构</span><span className="crud-card-value">{r.org || '—'}</span></div>
                <div className="crud-card-row"><span className="crud-card-label">负责人</span><span className="crud-card-value">{r.owner || '—'}</span></div>
              </Card>
            )}
          />
        ) : (
          <Table size="small" rowKey={(r, i) => `${r.code}_${i}`} loading={drill.loading} dataSource={drill.rows}
            onRow={(r) => ({ onClick: () => openOverviewDetail(r), style: { cursor: 'pointer' } })}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            columns={[
              { title: '编号', dataIndex: 'code', width: 160 },
              { title: '名称', dataIndex: 'name', ellipsis: true },
              { title: '状态', dataIndex: 'status', width: 96 },
              { title: '系统', dataIndex: 'system', ellipsis: true },
              { title: '机构', dataIndex: 'org', width: 120 },
              { title: '负责人', dataIndex: 'owner', width: 90 },
            ]} />
        )}
      </Modal>

      <Modal
        open={overviewDetail.open}
        width={screens.xl ? '96%' : '86%'}
        footer={null}
        onCancel={() => setOverviewDetail((current) => ({ ...current, open: false }))}
        style={{ top: 20, maxWidth: screens.xl ? '1700px' : '1000px' }}
        styles={{ body: { minHeight: 360, overflowX: 'hidden' } }}
        title={overviewDetail.data && (
          <div className="lc-modal-title" style={{ paddingRight: 24 }}>
            <span className="lc-id big">{overviewDetail.data.requirement.req_code}</span>
            <span className="lc-modal-name">{overviewDetail.data.requirement.title}</span>
            {overviewDetail.systemName && overviewDetail.systemName !== '—' && <span className="tag-system">{overviewDetail.systemName}</span>}
          </div>
        )}
      >
        {overviewDetail.loading || !overviewDetail.data ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 360 }}><Spin size="large" /></div>
        ) : (
          <VersionOverviewWorkItemDetail
            detail={overviewDetail.data}
            isTabMode={!screens.xl}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * 文件：components/editors/IssueDetail.jsx
 * 用途：问题详情查看弹窗（只读）。展示问题全字段信息，分组呈现基本信息、归属、人员、
 *       内容文本与「分析修改记录」时间线。无任何编辑能力。
 * 作者：hengguan
 * 说明：数据来源于 GET /issues/:id，analysis_log 已由后端解析为对象数组；is_major/is_common 为布尔。
 */

import React, { useEffect, useState } from 'react';
import { Modal, Tag, Timeline, Empty, Spin, Typography, Button, message } from 'antd';
import { CloudSyncOutlined } from '@ant-design/icons';
import StatusBadge from '../StatusBadge.jsx';
import Can from '../Can.jsx';
import { apiGet, apiPost } from '../../api/client.js';
import './IssueDetail.css';

const { Text } = Typography;

/** 多行长文本展示（保留换行），空值占位 */
function LongText({ value }) {
  if (!value) return <Text type="secondary">—</Text>;
  return <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</span>;
}

/** 布尔标签 */
function BoolTag({ value }) {
  return (
    <Tag className="status-tag" color={value ? 'red' : 'default'} style={{ borderRadius: 2, margin: 0 }}>
      {value ? '是' : '否'}
    </Tag>
  );
}

export default function IssueDetail({ open, issueId, onClose, onSynced }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // 拉取问题详情（同步后可复用以刷新弹窗内容）
  const load = () => {
    if (!issueId) return;
    setLoading(true);
    apiGet(`/issues/${issueId}`)
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open || !issueId) return;
    setData(null);
    load();
  }, [open, issueId]);

  // 同步当前问题详情：仅按本问题编号拉取并更新明细
  const onSyncOne = async () => {
    if (!data?.issue_code) return;
    setSyncing(true);
    try {
      const r = await apiPost('/issues/sync-detail', { codes: [data.issue_code] });
      if (r.failed?.length) {
        message.warning(`同步失败：${r.failed[0]?.error || '未知错误'}`);
      } else {
        message.success('已同步该问题详情');
      }
      load();
      onSynced?.();
    } finally {
      setSyncing(false);
    }
  };

  const log = Array.isArray(data?.analysis_log) ? data.analysis_log : [];

  return (
    <Modal
      open={open}
      width={980}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      styles={{ body: { fontSize: 12, maxHeight: '78vh', overflowY: 'auto' } }}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, paddingRight: 40 }}>
          <span className="lc-id big" style={{ margin: 0, fontFamily: 'SFMono-Regular, Consolas, monospace' }}>
            {data?.issue_code || '问题详情'}
          </span>
          {data?.status && <StatusBadge status={data.status} />}
          {data?.round && (
            <span className="round-badge">
              {data.round}
            </span>
          )}
          {data?.issue_code && (
            <Can module="issue" action="sync">
              <Button size="small" icon={<CloudSyncOutlined />} loading={syncing} onClick={onSyncOne}>
                同步问题详情
              </Button>
            </Can>
          )}
        </div>
      )}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin /></div>
      ) : !data ? (
        <Empty description="暂无数据" />
      ) : (
        <div className="issue-detail-wrapper">
          {/* People Grid */}
          <div className="grid-3">
            <div className="person-card">
              <div className="person-header">
                <span className="person-role-tag role-tracker">跟踪人</span>
                <span className="person-name">{data.tracker_name || '—'}</span>
              </div>
              <div className="person-details">
                <span className="org-tag">{data.tracker_org || '—'}</span>
                <span className="contact-text">{data.tracker_contact || '—'}</span>
              </div>
            </div>

            <div className="person-card">
              <div className="person-header">
                <span className="person-role-tag role-reporter">报障人</span>
                <span className="person-name">{data.reporter_name || '—'}</span>
              </div>
              <div className="person-details">
                <span className="org-tag">{data.reporter_org || '—'}</span>
                <span className="contact-text">{data.reporter_contact || '—'}</span>
              </div>
            </div>

            <div className="person-card">
              <div className="person-header">
                <span className="person-role-tag role-handler">处理人</span>
                <span className="person-name">{data.handler_name || '—'}</span>
              </div>
              <div className="person-details">
                <span className="org-tag">{data.handler_org || '—'}</span>
                <span className="contact-text">{data.handler_contact || '—'}</span>
              </div>
            </div>
          </div>

          {/* Info Grid */}
          <div className="grid-3">
            <div className="info-card">
              <span className="label-text">问题分类</span>
              <div className="value-primary">
                {data.category ? <Tag color="blue" style={{ margin: '0 4px 0 0', borderRadius: 2 }}>{data.category}</Tag> : null}
                {data.detailed_classification || '—'}
              </div>
            </div>

            <div className="info-card">
              <span className="label-text">所属系统</span>
              <div className="value-primary" style={{ fontWeight: 'bold' }}>
                {data.system || '—'}
                {data.business_group && <span className="org-tag" style={{ marginLeft: 4 }}>{data.business_group}</span>}
                {data.module && <span className="org-tag" style={{ marginLeft: 4 }}>{data.module}</span>}
              </div>
            </div>

            <div className="info-card">
              <span className="label-text">工单编号</span>
              <div className="value-primary" style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontWeight: 600 }}>
                {data.work_order_no || '—'}
              </div>
            </div>
          </div>

          {/* Time & Case Grid */}
          <div className="grid-4">
            <div className="info-card">
              <span className="label-text">提出时间</span>
              <div className="value-primary">
                {data.create_time || '—'}
              </div>
            </div>

            <div className="info-card">
              <span className="label-text">计划解决时间</span>
              <div className="value-primary">
                {data.plan_resolve_time || '—'}
              </div>
            </div>

            <div className="info-card">
              <span className="label-text">同步时间</span>
              <div className="value-primary">
                {data.synced_at || '—'}
              </div>
            </div>

            <div className="info-card">
              <span className="label-text">关联案例</span>
              <div className="value-primary" style={{ fontSize: '11px' }}>
                {data.linked_case_code ? (
                  <div>
                    <span style={{ fontWeight: 500 }}>{data.linked_case_code}</span>
                    {data.linked_case_name && (
                      <div
                        style={{ color: 'var(--radar-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={data.linked_case_name}
                      >
                        {data.linked_case_name}
                      </div>
                    )}
                  </div>
                ) : '—'}
              </div>
            </div>
          </div>

          {/* Additional attributes Grid */}
          <div className="grid-4">
            <div className="info-card">
              <span className="label-text">紧急程度</span>
              <div className="value-primary">
                {data.urgency ? (
                  <Tag color={data.urgency === '高' ? 'red' : data.urgency === '中' ? 'orange' : 'green'} style={{ margin: 0, borderRadius: 2 }}>
                    {data.urgency}
                  </Tag>
                ) : '—'}
              </div>
            </div>

            <div className="info-card">
              <span className="label-text">处理方式</span>
              <div className="value-primary">
                {data.handling_method ? (
                  <Tag color="cyan" style={{ margin: 0, borderRadius: 2 }}>
                    {data.handling_method}
                  </Tag>
                ) : '—'}
              </div>
            </div>

            <div className="info-card">
              <span className="label-text">版本编号</span>
              <div className="value-primary">
                {data.version_codes || '—'}
              </div>
            </div>

            <div className="info-card">
              <span className="label-text">发版情况</span>
              <div className="value-primary">
                {data.release_status || '—'}
              </div>
            </div>
          </div>

          <div className="grid-4" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <div className="info-card" style={{ minHeight: 'auto', padding: '6px 12px' }}>
              <span className="label-text" style={{ margin: '0 0 4px 0' }}>是否重大问题</span>
              <BoolTag value={data.is_major} />
            </div>

            <div className="info-card" style={{ minHeight: 'auto', padding: '6px 12px' }}>
              <span className="label-text" style={{ margin: '0 0 4px 0' }}>是否常见问题</span>
              <BoolTag value={data.is_common} />
            </div>
          </div>

          {/* Description & Timeline columns */}
          <div className="content-columns">
            <div className="content-section">
              <div className="detail-box">
                <div className="box-title-row">
                  <span className="box-label">问题概述</span>
                </div>
                <div className="box-content" style={{ fontWeight: 'bold' }}>
                  {data.summary || '—'}
                </div>
              </div>

              <div className="detail-box">
                <div className="box-title-row">
                  <span className="box-label">问题详细描述</span>
                </div>
                <div className="box-content">
                  <LongText value={data.details} />
                </div>
              </div>
            </div>

            <div className="content-section">
              <div className="timeline-card" style={{ marginTop: 0, height: '100%' }}>
                <div className="timeline-title">分析修改记录</div>
                {log.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无记录" />
                ) : (
                  <Timeline
                    items={log.map((e, i) => ({
                      key: i,
                      children: (
                        <div>
                          <div style={{ color: 'var(--radar-text-secondary)', fontSize: 11, marginBottom: 2 }}>
                            {[e.handler_name, e.handler_org, e.handler_contact].filter(Boolean).join(' · ')}
                            {e.time ? `  ${e.time}` : ''}
                          </div>
                          <LongText value={e.content} />
                        </div>
                      ),
                    }))}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Bottom Section: Cause Analysis & Solution */}
          <div className="content-columns">
            <div className="detail-box">
              <div className="box-title-row">
                <span className="box-label">问题原因分析</span>
              </div>
              <div className="box-content">
                <LongText value={data.root_cause} />
              </div>
            </div>

            <div className="detail-box">
              <div className="box-title-row">
                <span className="box-label">解决方案</span>
              </div>
              <div className="box-content">
                <LongText value={data.solution} />
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

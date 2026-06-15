/**
 * 文件：components/editors/IssueDetail.jsx
 * 用途：问题详情查看弹窗（只读）。展示问题全字段信息，分组呈现基本信息、归属、人员、
 *       内容文本与「分析修改记录」时间线。无任何编辑能力。
 * 作者：hengguan
 * 说明：数据来源于 GET /issues/:id，analysis_log 已由后端解析为对象数组；is_major/is_common 为布尔。
 */

import React, { useEffect, useState } from 'react';
import { Modal, Descriptions, Tag, Timeline, Empty, Spin, Typography } from 'antd';
import StatusBadge from '../StatusBadge.jsx';
import { apiGet } from '../../api/client.js';
import { useResponsive } from '../../hooks/useResponsive.js';

const { Paragraph, Text } = Typography;

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

export default function IssueDetail({ open, issueId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const { isMobile } = useResponsive();

  useEffect(() => {
    if (!open || !issueId) return;
    setLoading(true);
    setData(null);
    apiGet(`/issues/${issueId}`)
      .then(setData)
      .finally(() => setLoading(false));
  }, [open, issueId]);

  const cols = isMobile ? 1 : 2;
  const log = Array.isArray(data?.analysis_log) ? data.analysis_log : [];

  return (
    <Modal
      open={open}
      width={980}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      styles={{ body: { fontSize: 12, maxHeight: '72vh', overflowY: 'auto' } }}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, paddingRight: 40 }}>
          <span className="lc-id big" style={{ margin: 0, fontFamily: 'SFMono-Regular, Consolas, monospace' }}>
            {data?.issue_code || '问题详情'}
          </span>
          {data?.status && <StatusBadge status={data.status} />}
        </div>
      )}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spin /></div>
      ) : !data ? (
        <Empty description="暂无数据" />
      ) : (
        <div style={{ marginTop: 8 }}>
          {/* 基本信息 */}
          <Descriptions title="基本信息" bordered size="small" column={cols} styles={{ label: { width: 110 } }}>
            <Descriptions.Item label="问题编号">{data.issue_code || '—'}</Descriptions.Item>
            <Descriptions.Item label="状态"><StatusBadge status={data.status} /></Descriptions.Item>
            <Descriptions.Item label="问题轮次">{data.round || '—'}</Descriptions.Item>
            <Descriptions.Item label="紧急程度">{data.urgency || '—'}</Descriptions.Item>
            <Descriptions.Item label="处理方式">{data.handling_method || '—'}</Descriptions.Item>
            <Descriptions.Item label="工单编号">{data.work_order_no || '—'}</Descriptions.Item>
            <Descriptions.Item label="分类">{data.category || '—'}</Descriptions.Item>
            <Descriptions.Item label="详细分类">{data.detailed_classification || '—'}</Descriptions.Item>
            <Descriptions.Item label="是否重大问题"><BoolTag value={data.is_major} /></Descriptions.Item>
            <Descriptions.Item label="是否常见问题"><BoolTag value={data.is_common} /></Descriptions.Item>
          </Descriptions>

          {/* 归属与时间 */}
          <Descriptions title="归属与时间" bordered size="small" column={cols} style={{ marginTop: 16 }} styles={{ label: { width: 110 } }}>
            <Descriptions.Item label="所属实施机构">{data.business_group || '—'}</Descriptions.Item>
            <Descriptions.Item label="所属板块">{data.module || '—'}</Descriptions.Item>
            <Descriptions.Item label="所属系统">{data.system || '—'}</Descriptions.Item>
            <Descriptions.Item label="发版情况">{data.release_status || '—'}</Descriptions.Item>
            <Descriptions.Item label="版本编号" span={cols}><LongText value={data.version_codes} /></Descriptions.Item>
            <Descriptions.Item label="提出时间">{data.create_time || '—'}</Descriptions.Item>
            <Descriptions.Item label="计划解决时间">{data.plan_resolve_time || '—'}</Descriptions.Item>
            <Descriptions.Item label="关联案例编号">{data.linked_case_code || '—'}</Descriptions.Item>
            <Descriptions.Item label="关联案例名称">{data.linked_case_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="同步时间">{data.synced_at || '—'}</Descriptions.Item>
          </Descriptions>

          {/* 相关人员 */}
          <Descriptions title="相关人员" bordered size="small" column={cols} style={{ marginTop: 16 }} styles={{ label: { width: 110 } }}>
            <Descriptions.Item label="跟踪人">{data.tracker_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="跟踪人机构">{data.tracker_org || '—'}</Descriptions.Item>
            <Descriptions.Item label="跟踪人联系方式">{data.tracker_contact || '—'}</Descriptions.Item>
            <Descriptions.Item label="报障人">{data.reporter_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="报障人机构">{data.reporter_org || '—'}</Descriptions.Item>
            <Descriptions.Item label="报障人联系方式">{data.reporter_contact || '—'}</Descriptions.Item>
            <Descriptions.Item label="处理人">{data.handler_name || '—'}</Descriptions.Item>
            <Descriptions.Item label="处理机构">{data.handler_org || '—'}</Descriptions.Item>
            <Descriptions.Item label="处理人联系方式">{data.handler_contact || '—'}</Descriptions.Item>
          </Descriptions>

          {/* 问题内容 */}
          <Descriptions title="问题内容" bordered size="small" column={1} style={{ marginTop: 16 }} styles={{ label: { width: 110 } }}>
            <Descriptions.Item label="问题概述"><LongText value={data.summary} /></Descriptions.Item>
            <Descriptions.Item label="问题详情"><LongText value={data.details} /></Descriptions.Item>
            <Descriptions.Item label="问题原因分析"><LongText value={data.root_cause} /></Descriptions.Item>
            <Descriptions.Item label="解决方案"><LongText value={data.solution} /></Descriptions.Item>
          </Descriptions>

          {/* 分析修改记录 */}
          <div style={{ marginTop: 16 }}>
            <div className="form-section-title" style={{ marginBottom: 12 }}>分析修改记录</div>
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
      )}
    </Modal>
  );
}

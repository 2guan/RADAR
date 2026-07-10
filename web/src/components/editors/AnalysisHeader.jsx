/**
 * 文件：components/editors/AnalysisHeader.jsx
 * 用途：影响性分析 / 测试覆盖性分析弹窗的公共头部，展示需求/工单编号、名称、主责系统、协同系统。
 *       风格与详情页 meta-bar 一致。
 * 作者：hengguan
 */

import React from 'react';
import { Tag } from 'antd';

function SysTags({ names }) {
  if (!names?.length) return <span style={{ color: 'var(--radar-text-secondary)' }}>—</span>;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }}>
      {names.map((n) => <Tag key={n} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{n}</Tag>)}
    </span>
  );
}

export default function AnalysisHeader({ header }) {
  if (!header) return null;
  const label = header.entity_label || '需求';
  return (
    <div className="meta-bar" style={{ marginBottom: 12 }}>
      <span className="meta-item">
        <span className="meta-label">{label}编号</span>
        <b style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{header.req_code}</b>
      </span>
      <span className="meta-item">
        <span className="meta-label">{label}名称</span>
        <span>{header.title || '—'}</span>
      </span>
      <span className="meta-item">
        <span className="meta-label">主责系统</span>
        <SysTags names={header.main_system_names} />
      </span>
      {header.collab_system_names?.length > 0 && (
        <span className="meta-item">
          <span className="meta-label">协同系统</span>
          <SysTags names={header.collab_system_names} />
        </span>
      )}
    </div>
  );
}

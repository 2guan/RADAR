/**
 * 文件：components/ChainBar.jsx
 * 用途：全流程进度条。横向连续连线（dot 到 dot）的细线时间轴，按状态着色；
 *       节点下方显示阶段名称，并用状态标签标记该阶段当前状态。
 * 作者：hengguan
 * 说明：每个阶段为一个 step，连线由 step::before 绘制并连续相接（见 styles.css）。
 */

import React from 'react';
import StatusBadge from './StatusBadge.jsx';

export default function ChainBar({ nodes }) {
  return (
    <div className="chain-bar">
      {nodes.map((n, i) => (
        <div key={n.key} className={`chain-step ${n.state}`} data-last={i === nodes.length - 1 ? '1' : '0'}>
          <div className={`chain-dot ${n.state}`} />
          <div className={`chain-label ${n.state === 'doing' ? 'doing' : ''}`}>{n.label}</div>
          <div className="chain-status">
            {n.status ? <StatusBadge status={n.status} /> : <span className="chain-status-none">未开始</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 文件：components/StatusBadge.jsx
 * 用途：流程状态徽章。根据状态类型（初始态、进行中、终态）关联对应的 CSS 主题变量类名。
 * 作者：hengguan
 * 说明：带有特定底色和圆点标识的实体状态徽章，支持需求、开发任务和测试任务的状态渲染。
 */

import React from 'react';
import { Tag } from 'antd';
import { getStatusType } from '../utils/status.js';

export { getStatusType };

// 内联状态下拉（status-select）的宽度估算：按当前文字实际像素宽度自适应，
// 避免「字符数 × 固定值」估算造成的前后空白或文字被截断为省略号；额外预留左右内边距与下拉箭头位置。
let _measureCanvas;
export function statusSelectWidth(text, placeholder = '状态') {
  const label = String(text || placeholder || '');
  let textWidth;
  try {
    if (!_measureCanvas) _measureCanvas = document.createElement('canvas');
    const ctx = _measureCanvas.getContext('2d');
    ctx.font = '600 14px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif';
    textWidth = ctx.measureText(label).width;
  } catch {
    textWidth = label.length * 14; // 退化方案：按字符数估算
  }
  // 文字宽度 + 左右内边距(16) + 下拉箭头占位(18)
  return Math.ceil(textWidth) + 34;
}

export default function StatusBadge({ status, style }) {
  if (!status) return <Tag className="status-tag status-tag-not-started" style={{ ...style, marginInlineEnd: 0 }}>—</Tag>;
  const type = getStatusType(status);
  return (
    <Tag className={`status-tag status-tag-${type}`} style={{ marginInlineEnd: 0, ...style }}>
      {status}
    </Tag>
  );
}

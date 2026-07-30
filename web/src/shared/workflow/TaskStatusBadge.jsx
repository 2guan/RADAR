/**
 * 文件：web/src/shared/workflow/TaskStatusBadge.jsx
 * 说明：以紧凑阶段简称展示全链路任务状态，并基于原始状态保持既有颜色语义。
 * 用途：跨模块复用的只读任务状态展示组件；不请求接口、不拥有业务数据。
 * 作者：hengguan
 */

import { Tag, Tooltip } from 'antd';
import { getStatusType } from '../../platform/status/catalog.js';

/** 中文按一个字宽、半角字符按约半字宽估算，用固定标签宽度动态缩小字号而不截断状态。 */
const STATUS_TAG_FONT_SIZE = 12;

function visualLength(text) {
  return Array.from(String(text || '')).reduce((total, char) => (
    total + (/[^\x00-\xff]/.test(char) ? 1 : (char === ' ' ? 0.25 : 0.55))
  ), 0);
}

/** 默认容纳 6.5 个汉字内容宽度，并额外预留标签左右留白；完整阶段-状态仅在悬停时展示。 */
export default function TaskStatusBadge({ shortStatus, status, fullStatus, style }) {
  const label = shortStatus || '需求 · 未开始';
  const type = getStatusType(status || '未开始');
  const length = visualLength(label);
  // 与 Ant Design 紧凑状态标签（fontSizeSM，12px）保持一致；超出默认宽度时再等比缩小。
  const fontSize = length > 6.5 ? `${Math.max(7, Math.floor((STATUS_TAG_FONT_SIZE * 6.5) / length))}px` : undefined;
  return (
    <Tooltip title={fullStatus || label}>
      <Tag className={`status-tag status-tag-${type}`} style={{ width: '96px', overflow: 'visible', whiteSpace: 'nowrap', textAlign: 'center', fontSize, marginInlineEnd: 0, ...style }}>
        {label}
      </Tag>
    </Tooltip>
  );
}

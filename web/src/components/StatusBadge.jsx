/**
 * 文件：components/StatusBadge.jsx
 * 用途：流程状态徽章。根据状态类型（初始态、进行中、终态）关联对应的 CSS 主题变量类名。
 * 作者：hengguan
 */

import React from 'react';
import { Tag } from 'antd';

// 预设的标准状态映射
const STATIC_MAP = {
  // 初始态
  '需求登记': 'initial',
  '开发承接': 'initial',
  '测试承接': 'initial',
  '开发登记': 'initial',
  '测试登记': 'initial',

  // 过程中
  '需求分析': 'in-progress',
  '开发设计': 'in-progress',
  '开发实施': 'in-progress',
  '单元测试': 'in-progress',
  '测试方案': 'in-progress',
  '测试实施': 'in-progress',
  '测试报告': 'in-progress',
  '待评审': 'in-progress',
  '待投产': 'in-progress',

  // 终态
  '需求完成': 'final',
  '开发完成': 'final',
  '测试完成': 'final',
  '已上线': 'final',
  '已签署': 'final',
  '已投产': 'final',
  '评审通过': 'final',
  '已就绪': 'final',

  // 异常
  '已驳回': 'error',
  '已取消': 'error',

  // 未开始
  '未发起': 'not-started',
  '未签署': 'not-started',
  '未就绪': 'not-started',
  '未开始': 'not-started',
};

/**
 * 启发式获取状态对应的语义类别（初始态、进行中、终态、未开始、异常）
 */
export function getStatusType(status) {
  if (!status) return 'not-started';
  const val = String(status).trim();
  if (STATIC_MAP[val]) return STATIC_MAP[val];

  // 启发式匹配，适配自定义状态
  if (val.includes('未') || val.includes('开始') || val === '—') return 'not-started';
  if (val.includes('驳回') || val.includes('取消') || val.includes('失败') || val.includes('拒绝') || val.includes('驳')) return 'error';
  if (val.includes('登记') || val.includes('承接') || val.includes('初始') || val.includes('新建') || val.includes('起')) return 'initial';
  if (val.includes('完成') || val.includes('上线') || val.includes('签署') || val.includes('投产') || val.includes('就绪') || val.includes('通过') || val.includes('签')) return 'final';

  return 'in-progress';
}

export default function StatusBadge({ status }) {
  if (!status) return <Tag className="status-tag status-tag-not-started">—</Tag>;
  const type = getStatusType(status);
  return (
    <Tag className={`status-tag status-tag-${type}`} style={{ marginInlineEnd: 0 }}>
      {status}
    </Tag>
  );
}

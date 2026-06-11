/**
 * 文件：components/StatusBadge.jsx
 * 用途：流程状态徽章。根据状态语义映射颜色，统一全平台状态展示风格。
 * 作者：hengguan
 */

import React from 'react';
import { Tag } from 'antd';

// 状态 -> 颜色（语义化，避开蓝色主调与主题色冲突）
const COLOR_MAP = {
  // 终态：绿色
  需求完成: 'success', 开发完成: 'success', 测试完成: 'success', 已上线: 'success',
  已签署: 'success', 已投产: 'success', 评审通过: 'success',
  // 进行中：青色/橙色
  需求登记: 'default', 需求分析: 'processing', 开发承接: 'default', 开发设计: 'processing',
  开发实施: 'processing', 单元测试: 'processing', 测试承接: 'default', 测试方案: 'processing',
  测试实施: 'processing', 测试报告: 'processing', 待评审: 'warning', 待投产: 'warning',
  未签署: 'default', 未发起: 'default',
  // 异常：红色
  已驳回: 'error', 已取消: 'error',
};

export default function StatusBadge({ status }) {
  if (!status) return <Tag className="status-tag">—</Tag>;
  return <Tag className="status-tag" color={COLOR_MAP[status] || 'default'} style={{ marginInlineEnd: 0 }}>{status}</Tag>;
}

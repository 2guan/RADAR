/**
 * 文件：components/CodeLink.jsx
 * 用途：可点击复制详情单页链接的「编号」展示组件。复用于各详情弹窗标题栏的编号位置：
 *       点击即把该编号对应的详情单页完整链接写入剪贴板，便于分享直达。
 * 作者：hengguan
 * 说明：module 取值见 router/detailLinks.js；无 code 时回退为纯文本占位，不可点击。
 */

import React from 'react';
import { Tooltip, message } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { detailUrl } from '../router/detailLinks.js';

export default function CodeLink({ module, code, fallback = '—', big = true, style }) {
  const cls = big ? 'lc-id big' : 'lc-id';

  // 无编号：纯文本占位
  if (!code) {
    return <span className={cls} style={{ margin: 0, ...style }}>{fallback}</span>;
  }

  // 退化方案：临时输入框 + execCommand（用于 clipboard API 不可用或被拒时）
  const legacyCopy = (text) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const copy = async (e) => {
    e?.stopPropagation?.();
    const url = detailUrl(module, code);
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else if (!legacyCopy(url)) {
        throw new Error('copy failed');
      }
      message.success('详情链接已复制');
    } catch {
      // clipboard API 被拒时再尝试一次退化方案
      if (legacyCopy(url)) message.success('详情链接已复制');
      else message.error('复制失败，请手动复制');
    }
  };

  return (
    <Tooltip title="点击复制详情单页链接">
      <span
        className={cls}
        onClick={copy}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') copy(e); }}
        style={{ margin: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}
      >
        {code}
        <LinkOutlined style={{ fontSize: 11, opacity: 0.7 }} />
      </span>
    </Tooltip>
  );
}

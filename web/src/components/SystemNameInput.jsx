/**
 * 文件：components/SystemNameInput.jsx
 * 用途：系统名称录入。风格与「主责系统」选择器一致——检索下拉、选中项以标签展示，
 *       同时允许手动填写自由文本。
 *       SystemNameInput：单选（值为系统名称字符串）；SystemNamesSelect：多选（值为字符串数组）。
 * 作者：hengguan
 * 说明：数据源复用 /systems/all 缓存；采用 tags 模式以兼容“库内检索 + 手动输入”。
 */

import React, { useEffect, useState } from 'react';
import { Select } from 'antd';
import { apiGet } from '../api/client.js';

let _cache = null;

function useSystemOptions() {
  const [systems, setSystems] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!_cache) _cache = await apiGet('/systems/all');
      if (alive) setSystems(_cache || []);
    })();
    return () => { alive = false; };
  }, []);
  return (systems || []).map((s) => ({ value: s.sys_name, label: `${s.sys_name}（${s.sys_code}）` }));
}

/** 单个系统名称（tags 模式限 1 个，值为字符串） */
export default function SystemNameInput({ value, onChange, size = 'small', style, placeholder, disabled }) {
  const options = useSystemOptions();
  const arr = value ? [value] : [];
  return (
    <Select
      mode="tags"
      maxCount={1}
      value={arr}
      onChange={(vals) => onChange?.(vals.slice(-1)[0] || '')}
      options={options}
      size={size}
      allowClear
      disabled={disabled}
      style={{ width: '100%', ...style }}
      placeholder={placeholder || '检索或手动填写系统'}
      filterOption={(input, opt) => (opt.label || '').toLowerCase().includes((input || '').toLowerCase())}
    />
  );
}

/** 多个系统名称（tags 模式，值为字符串数组） */
export function SystemNamesSelect({ value, onChange, size = 'small', style, placeholder, disabled }) {
  const options = useSystemOptions();
  return (
    <Select
      mode="tags"
      value={value || []}
      onChange={onChange}
      options={options}
      size={size}
      allowClear
      disabled={disabled}
      style={{ width: '100%', ...style }}
      placeholder={placeholder || '检索或手动填写，可多个'}
      maxTagCount="responsive"
      filterOption={(input, opt) => (opt.label || '').toLowerCase().includes((input || '').toLowerCase())}
    />
  );
}

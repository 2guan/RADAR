/**
 * 文件：components/SystemNameInput.jsx
 * 用途：系统名称录入。既可在系统库中检索下拉选择，也可手动填写自由文本。
 *       值为系统名称字符串（选择库内系统时取其 sys_name）。
 * 作者：hengguan
 * 说明：用于影响性分析「系统名称」字段，默认可预填主责系统。数据源复用 /systems/all 缓存。
 */

import React, { useEffect, useState } from 'react';
import { AutoComplete, Select } from 'antd';
import { apiGet } from '../api/client.js';

let _cache = null;

/**
 * 多个系统名称录入（tags 模式）：可在系统库中多选，也可手动输入自由文本。
 * 值为系统名称字符串数组。
 */
export function SystemNamesSelect({ value, onChange, size = 'small', style, placeholder, disabled }) {
  const [systems, setSystems] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!_cache) _cache = await apiGet('/systems/all');
      if (alive) setSystems(_cache || []);
    })();
    return () => { alive = false; };
  }, []);
  const options = (systems || []).map((s) => ({ value: s.sys_name, label: `${s.sys_name}（${s.sys_code}）` }));
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

export default function SystemNameInput({ value, onChange, size = 'small', style, placeholder, disabled }) {
  const [systems, setSystems] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!_cache) _cache = await apiGet('/systems/all');
      if (alive) setSystems(_cache || []);
    })();
    return () => { alive = false; };
  }, []);

  const options = systems.map((s) => ({
    value: s.sys_name,
    label: `${s.sys_name}（${s.sys_code}）`,
  }));

  return (
    <AutoComplete
      value={value}
      onChange={onChange}
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

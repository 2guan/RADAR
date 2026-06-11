/**
 * 文件：components/SystemSelect.jsx
 * 用途：所属系统选择器。加载全部系统，按"系统名称(编号)"展示，支持跨机构/系统名称模糊检索，
 *       支持单选/多选。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import { Select } from 'antd';
import { apiGet } from '../api/client.js';

let _cache = null;

export default function SystemSelect({ value, onChange, mode = 'multiple', style, placeholder, maxTagCount = 'responsive', maxCount }) {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!_cache) _cache = await apiGet('/systems/all');
      if (alive) {
        setOptions((_cache || []).map((s) => ({
          value: s.sys_code,
          label: `${s.sys_name}（${s.sys_code}）`,
          org: s.org,
        })));
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Select
      mode={mode} value={value} onChange={onChange} allowClear
      placeholder={placeholder || '选择系统（支持模糊搜索）'} style={{ minWidth: 200, ...style }}
      showSearch
      filterOption={(input, opt) => (opt.label + opt.org).toLowerCase().includes(input.toLowerCase())}
      options={options}
      maxTagCount={maxTagCount}
      maxCount={maxCount}
    />
  );
}

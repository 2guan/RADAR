/**
 * 文件：components/SystemSelect.jsx
 * 用途：所属系统选择器。加载全部系统，按"系统名称(编号)"展示，支持跨机构/系统名称模糊检索，
 *       支持单选/多选。
 * 作者：hengguan
 * 说明：用于主责系统或关联系统选择的自定义下拉框，支持多选、模糊过滤，并自动绑定系统字典数据。
 */

import React, { useEffect, useState } from 'react';
import { Select } from 'antd';
import { apiGet } from '../api/client.js';

let _cache = null;

export default function SystemSelect({ value, onChange, mode = 'multiple', single, style, placeholder, maxTagCount = 'responsive', maxCount, size }) {
  // single=true 时为单选（Ant 单选模式 mode=undefined）
  const realMode = single ? undefined : mode;
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
      mode={realMode} value={value} onChange={onChange} allowClear size={size}
      placeholder={placeholder || '系统检索'} style={{ minWidth: 200, ...style }}
      showSearch
      filterOption={(input, opt) => (opt.label + opt.org).toLowerCase().includes(input.toLowerCase())}
      options={options}
      maxTagCount={maxTagCount}
      maxCount={maxCount}
    />
  );
}

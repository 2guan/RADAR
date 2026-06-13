/**
 * 文件：components/DictSelect.jsx
 * 用途：字典下拉选择器。按字典分类异步加载选项，支持输入即搜、按流程阶段过滤。
 * 作者：hengguan
 * 说明：category 为字典分类；stage 可选，用于流程状态按阶段（需求/开发/测试/投产）过滤。
 */

import React, { useEffect, useState } from 'react';
import { Select } from 'antd';
import { apiGet } from '../api/client.js';

// 简单的进程内缓存，避免重复请求
const cache = {};

export default function DictSelect({ category, stage, value, onChange, placeholder, style, mode, allowClear = true, size, showSearch = true, popupClassName }) {
  const [options, setOptions] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!cache[category]) cache[category] = await apiGet(`/dict/by-category/${category}`);
      let items = cache[category] || [];
      if (stage) items = items.filter((i) => i.extra?.stage === stage);
      if (alive) setOptions(items.map((i) => ({ value: i.attr_value, label: i.display_value })));
    };
    load();
    return () => { alive = false; };
  }, [category, stage]);

  return (
    <Select
      value={value} onChange={onChange} mode={mode} allowClear={allowClear} size={size}
      placeholder={placeholder || '请选择'} style={{ minWidth: 140, ...style }}
      classNames={popupClassName ? { popup: { root: popupClassName } } : undefined}
      showSearch={showSearch} optionFilterProp="label" options={options}
    />
  );
}

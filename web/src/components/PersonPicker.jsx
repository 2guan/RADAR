/**
 * 文件：components/PersonPicker.jsx
 * 用途：人员选择器。从人员表模糊搜索（输入即搜），按姓名存值，供负责人/提出人等字段使用。
 * 作者：hengguan
 * 说明：自定义人员选择器组件，绑定系统用户数据源，支持按姓名检索、拼音筛选和多选，常用作表单项。
 */

import React, { useEffect, useState } from 'react';
import { Select, Spin } from 'antd';
import { apiGet } from '../api/client.js';

export default function PersonPicker({ value, onChange, style, placeholder, size, mode }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  // 初始加载默认人员；输入时按关键字搜索
  const search = async (kw) => {
    setLoading(true);
    try {
      const rows = await apiGet('/users/search', { keyword: kw || '' });
      setOptions(rows.map((u) => ({ value: u.name, label: `${u.name}（${u.org || '—'}）` })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { search(''); }, []);

  return (
    <Select
      value={value} onChange={onChange} allowClear showSearch size={size} mode={mode}
      placeholder={placeholder || '搜索并选择人员'} style={{ minWidth: 160, ...style }}
      filterOption={false} onSearch={search}
      notFoundContent={loading ? <Spin size="small" /> : '无匹配人员'}
      options={options}
    />
  );
}

/**
 * 文件：components/FilterPanel.jsx
 * 用途：通用高级筛选面板。直角直边风格，支持主条件和折叠次要条件，支持多选、清空和重置。
 * 作者：hengguan
 */

import React, { useState, useEffect, useRef } from 'react';
import { Input, Select, DatePicker, Button, Badge, Space, Tooltip } from 'antd';
import { SearchOutlined, DownOutlined, UpOutlined, UndoOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

export default function FilterPanel({ configs, onChange, actions }) {
  const [expanded, setExpanded] = useState(false);
  const [localValues, setLocalValues] = useState({});
  const debounceRef = useRef({});

  // 区分主次要配置
  const primaryConfigs = configs.filter((c) => c.isPrimary);
  const secondaryConfigs = configs.filter((c) => !c.isPrimary);

  // 计算当前生效的次要筛选条件数量（不为空的）
  const activeCount = Object.keys(localValues).reduce((acc, key) => {
    const conf = configs.find((c) => c.field === key);
    if (!conf || conf.isPrimary) return acc;
    const val = localValues[key];
    if (val === undefined || val === null || val === '') return acc;
    if (Array.isArray(val) && val.length === 0) return acc;
    return acc + 1;
  }, 0);

  // 触发向父级组件报告变化（针对 text 输入有防抖，针对下拉选择无延迟）
  const emitChange = (newValues, isDebounced = false, field = null) => {
    if (isDebounced && field) {
      if (debounceRef.current[field]) {
        clearTimeout(debounceRef.current[field]);
      }
      debounceRef.current[field] = setTimeout(() => {
        onChange(newValues);
      }, 350);
    } else {
      onChange(newValues);
    }
  };

  const handleValueChange = (field, val, type) => {
    const nextValues = { ...localValues, [field]: val };
    setLocalValues(nextValues);
    
    const isInput = type === 'input';
    emitChange(nextValues, isInput, field);
  };

  const handleReset = () => {
    // 清理所有防抖计时器
    Object.values(debounceRef.current).forEach((t) => clearTimeout(t));
    debounceRef.current = {};
    
    setLocalValues({});
    onChange({});
  };

  const renderField = (c) => {
    const val = localValues[c.field];
    
    if (c.type === 'select') {
      return (
        <Select
          key={c.field}
          mode="multiple"
          maxTagCount="responsive"
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder={c.placeholder || c.label}
          options={c.options || []}
          value={val || []}
          onChange={(v) => handleValueChange(c.field, v, 'select')}
          style={{ width: '100%' }}
          dropdownStyle={{ borderRadius: 0 }}
        />
      );
    }
    
    if (c.type === 'date') {
      return (
        <DatePicker
          key={c.field}
          placeholder={c.placeholder || c.label}
          value={val ? dayjs(val) : null}
          onChange={(date, dateStr) => handleValueChange(c.field, dateStr, 'date')}
          style={{ width: '100%' }}
        />
      );
    }
    
    // 默认 input
    return (
      <Input
        key={c.field}
        allowClear
        placeholder={c.placeholder || c.label}
        value={val || ''}
        onChange={(e) => handleValueChange(c.field, e.target.value, 'input')}
        style={{ width: '100%' }}
      />
    );
  };

  return (
    <div className="radar-filter-bar">
      <div className="radar-filter-main">
        <Space style={{ color: 'var(--radar-primary)', marginRight: 4 }}>
          <SearchOutlined style={{ fontSize: 16 }} />
        </Space>
        
        <div className="radar-filter-inputs">
          {primaryConfigs.map((c) => (
            <div key={c.field} style={{ flex: 1, minWidth: 150 }}>
              {renderField(c)}
            </div>
          ))}
        </div>
        
        <Space wrap>
          <Tooltip title="重置">
            <Button 
              icon={<UndoOutlined />} 
              onClick={handleReset}
            />
          </Tooltip>
          
          {secondaryConfigs.length > 0 && (
            <Button 
              type="text" 
              onClick={() => setExpanded(!expanded)}
              icon={expanded ? <UpOutlined /> : <DownOutlined />}
              style={{ color: 'var(--radar-primary)', fontWeight: 500 }}
            >
              更多筛选 
              {activeCount > 0 && (
                <Badge 
                  count={activeCount} 
                  style={{ 
                    backgroundColor: 'var(--radar-primary)', 
                    marginLeft: 6,
                    borderRadius: 10,
                    boxShadow: 'none'
                  }} 
                />
              )}
            </Button>
          )}
          
          {actions}
        </Space>
      </div>

      {expanded && secondaryConfigs.length > 0 && (
        <div className="radar-filter-collapsible">
          {secondaryConfigs.map((c) => (
            <div key={c.field} style={{ width: '100%' }}>
              <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 4, fontWeight: 600 }}>
                {c.label}
              </div>
              {renderField(c)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * @file CustomColorPicker.tsx
 * @description PAMS 系统功能页面 / 提供 [dashboard/CustomColorPicker.tsx] 相关的业务操作 UI 界面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Popover, Input, Divider, Tooltip } from 'antd';
import { HexColorPicker } from 'react-colorful';
import { CloseCircleFilled } from '@ant-design/icons';

interface Props {
  value?: string;
  onChange?: (color: string) => void;
  size?: 'small' | 'middle' | 'large';
  allowClear?: boolean;
  disabled?: boolean;
}

const PRESET_COLORS = [
  '#1890ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#eb2f96',
  '#2f54eb', '#fa8c16', '#a0a0a0', '#000000', '#ffffff', '#fa541c',
  '#13c2c2', '#b37feb', '#006d75', '#d4380d', '#595959', '#1d39c4'
];

export default function CustomColorPicker({ value, onChange, size = 'middle', allowClear, disabled }: Props) {
  const [internalColor, setInternalColor] = useState(value || '#1890ff');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (value) {
      // Basic normalization - if it's RGB, it might need conversion, but hex-color-picker handles hex.
      // However, ChartEditor saves as RGB. react-colorful has HexColorPicker.
      // Let's use a simple hex converter if needed or just use HexColorPicker if we can normalize the input.
      setInternalColor(value);
    }
  }, [value]);

  const handleColorChange = (newColor: string) => {
    setInternalColor(newColor);
    onChange?.(newColor);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.('');
  };

  const triggerSize = size === 'small' ? 24 : size === 'large' ? 40 : 32;

  const content = (
    <div style={{ padding: '12px' }}>
      <HexColorPicker 
        color={internalColor.startsWith('#') ? internalColor : '#1890ff'} 
        onChange={handleColorChange} 
        style={{ width: '200px', height: '160px' }} 
      />
      
      <Divider style={{ margin: '12px 0' }} />
      
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#595959', marginBottom: 6 }}>HEX 值</div>
        <Input 
          size="small" 
          value={internalColor.toUpperCase()} 
          onChange={(e) => handleColorChange(e.target.value)} 
          placeholder="#FFFFFF"
          style={{ fontFamily: 'monospace' }}
        />
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#595959', marginBottom: 8 }}>精选调色盘</div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(6, 1fr)', 
          gap: '8px',
          maxHeight: '100px',
          overflowY: 'auto',
          padding: '2px'
        }}>
          {PRESET_COLORS.map(color => (
            <Tooltip title={color} key={color} mouseEnterDelay={0.5}>
              <div 
                onClick={() => handleColorChange(color)}
                style={{
                  width: '24px',
                  height: '24px',
                  backgroundColor: color,
                  borderRadius: 0,
                  cursor: 'pointer',
                  border: internalColor.toLowerCase() === color.toLowerCase() ? '2px solid #1890ff' : '1px solid #d9d9d9',
                  boxShadow: internalColor.toLowerCase() === color.toLowerCase() ? '0 0 0 2px rgba(24,144,255,0.2)' : 'none',
                  transition: 'transform 0.1s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              />
            </Tooltip>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      open={disabled ? false : open}
      onOpenChange={setOpen}
      styles={{ body: { padding: 0, borderRadius: 0 } }}
      placement="bottomLeft"
    >
      <div 
        className="custom-color-picker-trigger"
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          cursor: disabled ? 'not-allowed' : 'pointer',
          position: 'relative'
        }}
      >
        <div style={{
          width: triggerSize,
          height: triggerSize,
          borderRadius: 0,
          backgroundColor: value || 'transparent',
          border: '2.5px solid #fff',
          boxShadow: '0 0 0 1px #d9d9d9, 0 2px 4px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transition: 'all 0.2s ease',
          opacity: disabled ? 0.6 : 1
        }}>
          {!value && (
            <div style={{ 
              width: '100%', 
              height: '100%', 
              background: '#fff url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADohAmeAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+/Pll6v90AAAAKSURBVHjaYmBgYAAAAAYAASByZ6MAAAAASUVORK5CYII=") repeat' 
            }} />
          )}
        </div>
        
        {allowClear && value && !disabled && (
          <CloseCircleFilled 
            className="clear-icon"
            onClick={handleClear}
            style={{
              position: 'absolute',
              top: -8,
              right: -8,
              fontSize: '14px',
              color: '#bfbfbf',
              backgroundColor: '#fff',
              borderRadius: 0,
              display: 'none',
              zIndex: 1
            }}
          />
        )}
      </div>
    </Popover>
  );
}

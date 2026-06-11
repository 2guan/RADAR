/**
 * 文件：components/ThemeSwitcher.jsx
 * 用途：外观快捷切换器（顶栏）。下拉仅展示 8 个颜色方块供快速切换配色。
 * 作者：hengguan
 */

import React from 'react';
import { Dropdown, Button, Tooltip } from 'antd';
import { BgColorsOutlined, CheckOutlined } from '@ant-design/icons';
import { useAppStore } from '../stores/app.js';
import { PRESET_LIST } from '../theme/presets.js';

export default function ThemeSwitcher() {
  const { preset, setPreset, theme } = useAppStore();
  const isDark = theme === 'dark';

  const dropdownRender = () => (
    <div style={{
      padding: 12,
      borderRadius: 0,
      width: 156,
      background: 'var(--radar-surface)',
      border: '1px solid var(--radar-border)',
      boxShadow: 'var(--radar-card-shadow)',
    }}>
      <div style={{ fontSize: 12, color: 'var(--radar-text-secondary)', marginBottom: 10, fontWeight: 600, textAlign: 'center' }}>配色方案</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, justifyItems: 'center' }}>
        {PRESET_LIST.map((p) => {
          const colors = isDark ? p.dark : p.light;
          const isSelected = preset === p.key;
          return (
            <Tooltip key={p.key} title={p.name} placement="top">
              <div
                onClick={() => setPreset(p.key)}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: `linear-gradient(135deg, ${colors.primary}, ${colors.highlight})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isSelected
                    ? '0 0 0 2px var(--radar-surface), 0 0 0 4px var(--radar-primary)'
                    : '0 0 0 1px rgba(0,0,0,0.1)',
                  transition: 'all 0.15s ease',
                  transform: isSelected ? 'scale(1.05)' : 'none',
                }}
              >
                {isSelected && (
                  <CheckOutlined style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }} />
                )}
              </div>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );

  return (
    <Dropdown trigger={['click']} dropdownRender={dropdownRender} placement="bottomRight">
      <Tooltip title="外观主题">
        <Button type="text" shape="circle" icon={<BgColorsOutlined />} />
      </Tooltip>
    </Dropdown>
  );
}

/**
 * 文件：components/ThemeSwitcher.jsx
 * 用途：外观快捷切换器（顶栏）。下拉选择配色预设。
 * 作者：hengguan
 * 说明：偏好保存在本地（覆盖平台默认）；预设清单见 theme/presets.js。
 */

import React from 'react';
import { Dropdown, Button, Tooltip } from 'antd';
import { BgColorsOutlined, CheckOutlined } from '@ant-design/icons';
import { useAppStore } from '../stores/app.js';
import { PRESET_LIST } from '../theme/presets.js';

export default function ThemeSwitcher() {
  const { preset, setPreset } = useAppStore();

  const dropdownRender = () => (
    <div style={{ padding: 14, borderRadius: 0, width: 230, background: 'var(--radar-surface)', border: '1px solid var(--radar-border)', boxShadow: 'var(--radar-card-shadow)' }}>
      <div style={{ fontSize: 12, color: 'var(--radar-text-secondary)', marginBottom: 8, fontWeight: 600 }}>配色方案</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {PRESET_LIST.map((p) => (
          <div
            key={p.key}
            onClick={() => setPreset(p.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 2, cursor: 'pointer',
              background: preset === p.key ? 'var(--radar-primary-soft)' : 'transparent',
              border: `1px solid ${preset === p.key ? p.primary : 'transparent'}`,
            }}
          >
            <span style={{ width: 18, height: 18, borderRadius: 6, background: p.primary, flexShrink: 0, boxShadow: '0 0 0 1px rgba(0,0,0,0.06)' }} />
            <span style={{ fontSize: 13, flex: 1 }}>{p.name}</span>
            {preset === p.key && <CheckOutlined style={{ color: p.primary, fontSize: 12 }} />}
          </div>
        ))}
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

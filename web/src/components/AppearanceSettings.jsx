/**
 * 文件：components/AppearanceSettings.jsx
 * 用途：外观主题设置（系统设置内）。管理员设定平台默认配色预设；
 *       同时即时应用到当前界面预览。保存写入 app_config（对所有未本地覆盖的用户生效）。
 * 作者：hengguan
 * 说明：前端界面风格偏好配置面板，允许用户通过 UI 切换平台的配色方案（靛蓝、翡翠、晚霞等）。
 */

import React, { useState } from 'react';
import { Button, Space, Card, message, Typography } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { apiPut } from '../api/client.js';
import { useAppStore } from '../stores/app.js';
import { PRESET_LIST } from '../theme/presets.js';

export default function AppearanceSettings() {
  const { preset, setPreset, theme } = useAppStore();
  const [saving, setSaving] = useState(false);
  const isDark = theme === 'dark';

  const saveDefault = async () => {
    setSaving(true);
    try {
      await apiPut('/settings/app-config', { items: { 'appearance.preset': preset } });
      message.success('已保存为平台默认外观');
    } finally { setSaving(false); }
  };

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 760 }}>
      <div>
        <div className="form-section-title">配色方案（点击即预览）</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
          {PRESET_LIST.map((p) => {
            const colors = isDark ? p.dark : p.light;
            return (
              <Card key={p.key} size="small" hoverable onClick={() => setPreset(p.key)}
                styles={{ body: { padding: 12 } }}
                style={{ cursor: 'pointer', outline: preset === p.key ? `2px solid ${colors.primary}` : 'none' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg, ${colors.primary}, ${colors.highlight})`, display: 'inline-block' }} />
                    <span style={{ fontWeight: 600 }}>{p.name}</span>
                  </Space>
                  {preset === p.key && <CheckCircleFilled style={{ color: colors.primary }} />}
                </Space>
              </Card>
            );
          })}
        </div>
      </div>

      <Space>
        <Button type="primary" loading={saving} onClick={saveDefault}>保存为平台默认</Button>
        <Typography.Text type="secondary">（用户也可在顶栏自行切换，本地偏好优先）</Typography.Text>
      </Space>
    </Space>
  );
}

/**
 * 文件：components/AppearanceSettings.jsx
 * 用途：外观主题设置（系统设置内）。管理员设定平台默认配色预设；
 *       同时即时应用到当前界面预览。保存写入 app_config（对所有未本地覆盖的用户生效）。
 * 作者：hengguan
 * 说明：前端界面风格偏好配置面板，允许用户通过 UI 切换平台的配色方案（靛蓝、翡翠、晚霞等）。
 */

import React, { useState } from 'react';
import { Button, Space, Card, message, Typography, Row, Col } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import { apiPut } from '../api/client.js';
import { useAppStore } from '../stores/app.js';
import { PRESETS, PRESET_LIST } from '../theme/presets.js';

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

  const selectedPreset = PRESETS[preset] || PRESETS.sky;
  const activeColors = isDark ? selectedPreset.dark : selectedPreset.light;

  return (
    <Row gutter={[24, 24]}>
      {/* 左侧配置区 */}
      <Col xs={24} lg={15}>
        <div className="form-section-title">选择系统配色预设</div>
        <div className="form-section-card" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 24 }}>
            {PRESET_LIST.map((p) => {
              const colors = isDark ? p.dark : p.light;
              const isSelected = preset === p.key;
              return (
                <div
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className="clickable"
                  style={{
                    border: isSelected ? `2px solid ${colors.primary}` : '1px solid var(--radar-border)',
                    background: 'var(--radar-surface)',
                    padding: '12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'all 0.2s',
                    boxShadow: isSelected ? '0 4px 12px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--radar-ink)' }}>{p.name}</span>
                    {isSelected && <CheckCircleFilled style={{ color: colors.primary, fontSize: 14 }} />}
                  </div>
                  
                  {/* 配色色盘展示 */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: colors.primary, display: 'inline-block' }} title="主色" />
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: colors.highlight, display: 'inline-block' }} title="亮色" />
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: colors.accent, display: 'inline-block' }} title="强调色" />
                  </div>
                </div>
              );
            })}
          </div>

          <Space size="middle" wrap>
            <Button type="primary" loading={saving} onClick={saveDefault}>保存为平台默认</Button>
          </Space>
        </div>
      </Col>

      {/* 右侧实时预览区 */}
      <Col xs={24} lg={9}>
        <div className="form-section-title">主题组件效果实时预览</div>
        <Card
          styles={{ body: { padding: 16 } }}
          style={{
            background: 'var(--radar-primary-soft)',
            borderColor: 'var(--radar-primary-fade)',
            borderRadius: 8
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. 按钮预览 */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 6, fontFamily: 'monospace' }}>
                // 按钮样式
              </div>
              <div style={{
                background: 'var(--radar-surface)',
                border: '1px solid var(--radar-border)',
                padding: '12px 14px',
                borderRadius: 6,
                display: 'flex',
                gap: 10
              }}>
                <button style={{
                  backgroundColor: activeColors.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                  主按钮
                </button>
                <button style={{
                  backgroundColor: 'transparent',
                  color: activeColors.primary,
                  border: `1px solid ${activeColors.primary}`,
                  borderRadius: 4,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}>
                  次级按钮
                </button>
              </div>
            </div>

            {/* 2. 状态标签预览 */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 6, fontFamily: 'monospace' }}>
                // 状态语义标签
              </div>
              <div style={{
                background: 'var(--radar-surface)',
                border: '1px solid var(--radar-border)',
                padding: '12px 14px',
                borderRadius: 6,
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8
              }}>
                <span style={{
                  border: `1px solid ${activeColors.statusInitial}`,
                  color: activeColors.statusInitial,
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 2,
                  fontWeight: 600
                }}>
                  登记 / 初始态
                </span>
                <span style={{
                  border: `1px solid ${activeColors.statusInProgress}`,
                  color: activeColors.statusInProgress,
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 2,
                  fontWeight: 600
                }}>
                  进行中 / 活跃态
                </span>
                <span style={{
                  border: `1px solid ${activeColors.statusFinal}`,
                  color: activeColors.statusFinal,
                  background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 2,
                  fontWeight: 600
                }}>
                  已投产 / 终态
                </span>
              </div>
            </div>

            {/* 3. 全流程进度条 */}
            <div>
              <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 6, fontFamily: 'monospace' }}>
                // 全流程进度条
              </div>
              <div style={{
                background: 'var(--radar-surface)',
                border: '1px solid var(--radar-border)',
                padding: '16px 14px',
                borderRadius: 6,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', position: 'relative' }}>
                  {/* 连接线 */}
                  <div style={{
                    position: 'absolute',
                    top: 7,
                    left: 10,
                    right: 10,
                    height: 2,
                    background: `linear-gradient(to right, ${activeColors.primary} 50%, var(--radar-border) 50%)`,
                    transform: 'translateY(-50%)',
                    zIndex: 0
                  }} />
                  
                  {/* 节点 1 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, flex: 1 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: activeColors.primary,
                      border: '3px solid var(--radar-surface)',
                      boxShadow: `0 0 0 2px ${activeColors.primary}`
                    }} />
                    <span style={{ fontSize: 9, color: 'var(--radar-text-secondary)', marginTop: 4 }}>需求分析</span>
                  </div>
                  
                  {/* 节点 2 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, flex: 1 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: activeColors.statusInProgress,
                      border: '3px solid var(--radar-surface)',
                      boxShadow: `0 0 0 2px ${activeColors.statusInProgress}`
                    }} />
                    <span style={{ fontSize: 9, color: activeColors.statusInProgress, marginTop: 4, fontWeight: 600 }}>开发设计</span>
                  </div>

                  {/* 节点 3 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, flex: 1 }}>
                    <span style={{
                      width: 14, height: 14, borderRadius: '50%',
                      background: 'var(--radar-surface)',
                      border: '3px solid var(--radar-border)',
                    }} />
                    <span style={{ fontSize: 9, color: 'var(--radar-text-secondary)', marginTop: 4 }}>应用测试</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </Col>
    </Row>
  );
}

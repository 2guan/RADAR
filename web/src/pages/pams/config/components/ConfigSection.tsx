/**
 * @file ConfigSection.tsx
 * @description PAMS 系统功能页面 / 提供 [config/components/ConfigSection.tsx] 相关的业务操作 UI 界面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React from 'react';
import { Segmented, Select, Grid, Space, Typography, ConfigProvider } from 'antd';

const { useBreakpoint } = Grid;
const { Text } = Typography;

interface ConfigSectionItem {
    key: string;
    label: string | React.ReactNode;
    children: React.ReactNode;
}

interface ConfigSectionProps {
    items: ConfigSectionItem[];
    activeKey: string;
    onChange: (key: string) => void;
}

export default function ConfigSection({ items, activeKey, onChange }: ConfigSectionProps) {
    const screens = useBreakpoint();
    const isMobile = !screens.md;

    const activeItem = items.find(item => item.key === activeKey) || items[0];

    return (
        <ConfigProvider
            theme={{
                components: {
                    Segmented: {
                        itemSelectedBg: 'var(--radar-primary)',
                        itemSelectedColor: '#fff',
                        trackBg: 'var(--radar-bg)',
                    }
                }
            }}
        >
            <div className="config-section">
                <div style={{ marginBottom: 24 }}>
                    {isMobile ? (
                        <div style={{ padding: '0 4px' }}>
                            <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>当前子项目：</Text>
                            <Select
                                value={activeKey}
                                onChange={onChange}
                                style={{ width: '100%' }}
                                options={items.map(item => ({
                                    label: item.label,
                                    value: item.key
                                }))}
                                size="large"
                            />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <Segmented
                                value={activeKey}
                                onChange={(val) => onChange(val as string)}
                                options={items.map(item => ({
                                    label: item.label,
                                    value: item.key
                                }))}
                                size="large"
                                style={{ padding: 4, borderRadius: 0 }}
                            />
                        </div>
                    )}
                </div>

                <div className="config-section-content animate-fade-in" key={activeKey}>
                    {activeItem.children}
                </div>

                <style>{`
                    .animate-fade-in {
                        animation: fadeIn 0.3s ease-in-out;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(4px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}</style>
            </div>
        </ConfigProvider>
    );
}

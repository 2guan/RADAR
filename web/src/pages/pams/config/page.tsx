/**
 * @file page.tsx
 * @description RADAR 内 PAMS 系统配置中心。
 */

'use client';

import React, { useState } from 'react';
import { Button, ConfigProvider, Drawer, Grid, Menu, Space, Tabs, Typography } from 'antd';
import {
    AppstoreOutlined,
    ControlOutlined,
    MenuOutlined,
    RobotOutlined,
    SettingOutlined,
    TeamOutlined,
} from '@ant-design/icons';

import BasicConfig from './components/BasicConfig';
import PersonnelConfig from './components/PersonnelConfig';
import LLMConfig from './components/LLMConfig';
import OtherConfig from './components/OtherConfig';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

type ConfigModule = 'basic' | 'personnel' | 'llm' | 'other';

export default function ConfigPage() {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const [activeModule, setActiveModule] = useState<ConfigModule>('basic');
    const [drawerVisible, setDrawerVisible] = useState(false);

    const modules = [
        {
            key: 'basic',
            label: '基础配置',
            icon: <AppstoreOutlined />,
            children: <BasicConfig />,
        },
        {
            key: 'personnel',
            label: '人员配置',
            icon: <TeamOutlined />,
            children: <PersonnelConfig />,
        },
        {
            key: 'llm',
            label: '大模型设置',
            icon: <RobotOutlined />,
            children: <LLMConfig />,
        },
        {
            key: 'other',
            label: '其它设置',
            icon: <SettingOutlined />,
            children: <OtherConfig />,
        },
    ];

    const currentModule = modules.find(m => m.key === activeModule) || modules[0];

    const handleModuleChange = (key: ConfigModule) => {
        setActiveModule(key);
        setDrawerVisible(false);
    };

    const renderMobileHeader = () => (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'var(--radar-surface)',
            borderBottom: '1px solid var(--radar-border)',
            marginBottom: 16,
            borderRadius: 0,
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}>
            <Space>
                <div style={{
                    width: 28,
                    height: 28,
                    background: 'var(--radar-primary)',
                    borderRadius: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff'
                }}>
                    {currentModule.icon}
                </div>
                <Title level={5} style={{ margin: 0 }}>{currentModule.label}</Title>
            </Space>
            <Button
                type="text"
                icon={<MenuOutlined style={{ fontSize: 20 }} />}
                onClick={() => setDrawerVisible(true)}
            />
        </div>
    );

    return (
        <ConfigProvider
            theme={{
                token: { borderRadius: 0 },
                components: {
                    Tabs: {
                        itemSelectedColor: 'var(--radar-primary)',
                        inkBarColor: 'var(--radar-primary)',
                        titleFontSizeLG: 14,
                    }
                }
            }}
        >
            <div style={{ minHeight: '100vh', background: 'transparent', display: 'flex', flexDirection: 'column' }}>
                {isMobile ? renderMobileHeader() : (
                    <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--radar-border)', background: 'var(--radar-surface)' }}>
                        <Space size="middle">
                            <div style={{
                                width: 32,
                                height: 32,
                                background: 'var(--radar-primary)',
                                borderRadius: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#fff'
                            }}>
                                <ControlOutlined style={{ fontSize: 16 }} />
                            </div>
                            <div>
                                <Title level={5} style={{ margin: 0, fontWeight: 600 }}>系统配置</Title>
                                <Text type="secondary" style={{ fontSize: 12 }}>管理 PAMS 基础字典、RADAR 角色映射、AI 模型接口和问题编号规则</Text>
                            </div>
                        </Space>
                    </div>
                )}

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {!isMobile ? (
                        <Tabs
                            activeKey={activeModule}
                            onChange={(key) => setActiveModule(key as ConfigModule)}
                            tabPosition="left"
                            className="config-main-tabs pams-config-page"
                            style={{ flex: 1 }}
                            items={modules.map(m => ({
                                key: m.key,
                                label: (
                                    <div style={{ padding: '10px 16px' }}>
                                        <Space size={10}>
                                            <span style={{ fontSize: 16 }}>{m.icon}</span>
                                            <span style={{ fontWeight: activeModule === m.key ? 600 : 400 }}>{m.label}</span>
                                        </Space>
                                    </div>
                                ),
                                children: (
                                    <div style={{
                                        padding: '24px 32px',
                                        background: 'var(--radar-surface)',
                                        minHeight: 'calc(100vh - 80px)',
                                        overflow: 'auto'
                                    }}>
                                        {m.children}
                                    </div>
                                )
                            }))}
                        />
                    ) : (
                        <div style={{ padding: '0 12px 24px 12px' }}>
                            {currentModule.children}
                        </div>
                    )}
                </div>

                <Drawer
                    title={<Space><SettingOutlined /> 功能模块导航</Space>}
                    placement="left"
                    onClose={() => setDrawerVisible(false)}
                    open={drawerVisible}
                    styles={{ body: { padding: 0 }, wrapper: { width: 260 } }}
                >
                    <Menu
                        mode="inline"
                        selectedKeys={[activeModule]}
                        items={modules.map(m => ({
                            key: m.key,
                            icon: m.icon,
                            label: m.label,
                            onClick: () => handleModuleChange(m.key as ConfigModule)
                        }))}
                        style={{ borderRight: 'none' }}
                    />
                </Drawer>

                <style>{`
                    .pams-config-page .ant-tabs-nav {
                        background: var(--radar-surface) !important;
                        border-right: 1px solid var(--radar-border) !important;
                        width: 220px !important;
                    }
                    .pams-config-page .ant-tabs-tab {
                        margin: 8px 12px !important;
                        padding: 0 !important;
                        border-radius: 0 !important;
                    }
                    .pams-config-page .ant-tabs-tab-active {
                        background: var(--radar-primary-soft) !important;
                    }
                    .pams-config-page .ant-tabs-ink-bar {
                        left: 0 !important;
                        width: 3px !important;
                        background: var(--radar-primary) !important;
                        border-radius: 0 !important;
                    }
                    .pams-config-page .ant-tabs-tabpane {
                        background: var(--radar-surface) !important;
                    }
                `}</style>
            </div>
        </ConfigProvider>
    );
}

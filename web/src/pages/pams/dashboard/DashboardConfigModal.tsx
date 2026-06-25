/**
 * @file DashboardConfigModal.tsx
 * @description PAMS 系统功能页面 / 提供 [dashboard/DashboardConfigModal.tsx] 相关的业务操作 UI 界面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useState } from 'react';
import {
    Modal, Button, Input, Select, Card, Space,
    message, Popconfirm, Tooltip, Row, Col, Divider, Popover
} from 'antd';
import {
    PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined,
    UndoOutlined, FileTextOutlined, BankOutlined, TeamOutlined,
    BulbOutlined, AppstoreOutlined, CheckCircleOutlined,
    ClockCircleOutlined, ExclamationCircleOutlined, StarOutlined,
    ThunderboltOutlined, SettingOutlined, UserOutlined, ProjectOutlined,
    NotificationOutlined, SafetyCertificateOutlined, DashboardOutlined,
    LineChartOutlined, BarChartOutlined, PieChartOutlined, BugOutlined,
    QuestionCircleOutlined, InfoCircleOutlined, MessageOutlined,
    MailOutlined, SafetyOutlined, LockOutlined, UnlockOutlined,
    DatabaseOutlined, CloudOutlined, WifiOutlined, GlobalOutlined,
    HeartOutlined, FlagOutlined, TagOutlined, RocketOutlined,
    ExperimentOutlined, MedicineBoxOutlined, GiftOutlined, ShoppingOutlined,
    ShopOutlined, HistoryOutlined, HourglassOutlined, ToolOutlined,
    BuildOutlined, ControlOutlined, CommentOutlined, CustomerServiceOutlined,
    SolutionOutlined, ReadOutlined, BookOutlined, HddOutlined,
    PayCircleOutlined, MoneyCollectOutlined, AccountBookOutlined, InsuranceOutlined,
    AuditOutlined, InteractionOutlined, PullRequestOutlined, PartitionOutlined,
    DeploymentUnitOutlined, BranchesOutlined, DesktopOutlined, LaptopOutlined,
    MobileOutlined, TabletOutlined, CameraOutlined, VideoCameraOutlined,
    PictureOutlined, CompassOutlined, EnvironmentOutlined, PushpinOutlined,
    CoffeeOutlined, SkinOutlined, CrownOutlined, TrophyOutlined,
    SafetyOutlined as SecuritySafeOutlined, FireOutlined, SoundOutlined,
    SearchOutlined, SettingFilled
} from '@ant-design/icons';
import type { DashboardConfig, BoardCellDef, ChartDimension } from './dashboardConfig';
import {
    DEFAULT_DASHBOARD_CONFIG,
    DIMENSION_OPTIONS
} from './dashboardConfig';
import type { DictItem } from '@/types';
import CustomColorPicker from './CustomColorPicker';

// Icon map for rendering in dropdown
const ICON_COMPONENTS: Record<string, React.ReactNode> = {
    FileTextOutlined: <FileTextOutlined />,
    BankOutlined: <BankOutlined />,
    TeamOutlined: <TeamOutlined />,
    BulbOutlined: <BulbOutlined />,
    AppstoreOutlined: <AppstoreOutlined />,
    CheckCircleOutlined: <CheckCircleOutlined />,
    ClockCircleOutlined: <ClockCircleOutlined />,
    ExclamationCircleOutlined: <ExclamationCircleOutlined />,
    StarOutlined: <StarOutlined />,
    ThunderboltOutlined: <ThunderboltOutlined />,
    UserOutlined: <UserOutlined />,
    ProjectOutlined: <ProjectOutlined />,
    NotificationOutlined: <NotificationOutlined />,
    SafetyCertificateOutlined: <SafetyCertificateOutlined />,
    DashboardOutlined: <DashboardOutlined />,
    LineChartOutlined: <LineChartOutlined />,
    BarChartOutlined: <BarChartOutlined />,
    PieChartOutlined: <PieChartOutlined />,
    BugOutlined: <BugOutlined />,
    QuestionCircleOutlined: <QuestionCircleOutlined />,
    InfoCircleOutlined: <InfoCircleOutlined />,
    MessageOutlined: <MessageOutlined />,
    MailOutlined: <MailOutlined />,
    SafetyOutlined: <SafetyOutlined />,
    LockOutlined: <LockOutlined />,
    UnlockOutlined: <UnlockOutlined />,
    DatabaseOutlined: <DatabaseOutlined />,
    CloudOutlined: <CloudOutlined />,
    WifiOutlined: <WifiOutlined />,
    GlobalOutlined: <GlobalOutlined />,
    HeartOutlined: <HeartOutlined />,
    FlagOutlined: <FlagOutlined />,
    TagOutlined: <TagOutlined />,
    RocketOutlined: <RocketOutlined />,
    ExperimentOutlined: <ExperimentOutlined />,
    MedicineBoxOutlined: <MedicineBoxOutlined />,
    GiftOutlined: <GiftOutlined />,
    ShoppingOutlined: <ShoppingOutlined />,
    ShopOutlined: <ShopOutlined />,
    HistoryOutlined: <HistoryOutlined />,
    HourglassOutlined: <HourglassOutlined />,
    ToolOutlined: <ToolOutlined />,
    BuildOutlined: <BuildOutlined />,
    ControlOutlined: <ControlOutlined />,
    CommentOutlined: <CommentOutlined />,
    CustomerServiceOutlined: <CustomerServiceOutlined />,
    SolutionOutlined: <SolutionOutlined />,
    ReadOutlined: <ReadOutlined />,
    BookOutlined: <BookOutlined />,
    HddOutlined: <HddOutlined />,
    PayCircleOutlined: <PayCircleOutlined />,
    MoneyCollectOutlined: <MoneyCollectOutlined />,
    AccountBookOutlined: <AccountBookOutlined />,
    InsuranceOutlined: <InsuranceOutlined />,
    AuditOutlined: <AuditOutlined />,
    InteractionOutlined: <InteractionOutlined />,
    PullRequestOutlined: <PullRequestOutlined />,
    PartitionOutlined: <PartitionOutlined />,
    DeploymentUnitOutlined: <DeploymentUnitOutlined />,
    BranchesOutlined: <BranchesOutlined />,
    DesktopOutlined: <DesktopOutlined />,
    LaptopOutlined: <LaptopOutlined />,
    MobileOutlined: <MobileOutlined />,
    TabletOutlined: <TabletOutlined />,
    CameraOutlined: <CameraOutlined />,
    VideoCameraOutlined: <VideoCameraOutlined />,
    PictureOutlined: <PictureOutlined />,
    CompassOutlined: <CompassOutlined />,
    EnvironmentOutlined: <EnvironmentOutlined />,
    PushpinOutlined: <PushpinOutlined />,
    CoffeeOutlined: <CoffeeOutlined />,
    SkinOutlined: <SkinOutlined />,
    CrownOutlined: <CrownOutlined />,
    TrophyOutlined: <TrophyOutlined />,
    FireOutlined: <FireOutlined />,
    SoundOutlined: <SoundOutlined />,
    SearchOutlined: <SearchOutlined />,
};

const IconPicker = ({ value, onChange }: { value: string, onChange: (v: string) => void }) => {
    return (
        <Popover
            content={
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(8, 1fr)', 
                    gap: 4, 
                    maxHeight: 250, 
                    overflowY: 'auto',
                    padding: 8,
                    width: 300
                }}>
                    {Object.keys(ICON_COMPONENTS).map(key => (
                        <Tooltip key={key} title={key.replace('Outlined', '')}>
                            <div 
                                onClick={() => onChange(key)}
                                style={{
                                    padding: '8px 4px',
                                    border: `1px solid ${value === key ? '#1677ff' : 'transparent'}`,
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    fontSize: 20,
                                    background: value === key ? '#e6f4ff' : 'transparent',
                                    transition: 'all 0.2s',
                                    hover: { background: '#f5f5f5' }
                                }}
                            >
                                {ICON_COMPONENTS[key]}
                            </div>
                        </Tooltip>
                    ))}
                </div>
            }
            trigger="click"
            placement="bottom"
            overlayInnerStyle={{ padding: 0 }}
        >
            <div style={{
                width: 32,
                height: 32,
                border: '1px solid #d9d9d9',
                borderRadius: 4,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                cursor: 'pointer',
                fontSize: 18,
                background: '#fff',
                transition: 'all 0.3s'
            }}>
                {ICON_COMPONENTS[value] || <FileTextOutlined />}
            </div>
        </Popover>
    );
};

interface Props {
    open: boolean;
    onClose: () => void;
    config: DashboardConfig;
    onSave: (config: DashboardConfig) => void;
    dicts: Record<string, DictItem[]>;
}

export default function DashboardConfigModal({ open, onClose, config, onSave, dicts }: Props) {
    const [editConfig, setEditConfig] = useState<DashboardConfig>(JSON.parse(JSON.stringify(config)));
    const [saving, setSaving] = useState(false);

    // Reset editConfig when modal opens with new config prop
    React.useEffect(() => {
        if (open) {
            setEditConfig(JSON.parse(JSON.stringify(config)));
        }
    }, [open, config]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(editConfig);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    const handleReset = () => {
        setEditConfig(JSON.parse(JSON.stringify(DEFAULT_DASHBOARD_CONFIG)));
        message.info('已恢复默认配置（需点击保存生效）');
    };

    const getOptionsForDimension = (dim: ChartDimension) => {
        const options = [
            { value: '__ALL__', label: '🔢 合计（所有项）' },
        ];

        // Add '其它' for specific dimensions
        if (['category', 'detailed_classification', 'module', 'system'].includes(dim)) {
            options.push({ value: '其它', label: '其它（未匹配/未分类）' });
        }

        const dictKeyMap: Partial<Record<ChartDimension, string>> = {
            status: 'issue_status',
            category: 'issue_category',
            detailed_classification: 'issue_detailed_classification',
            module: 'module',
            system: 'system',
            business_group: 'business_group',
            round: 'issue_round',
            urgency: 'issue_urgency',
            handling_method: 'issue_handling_method'
        };

        const dictKey = dictKeyMap[dim];
        if (dictKey && dicts[dictKey]) {
            options.push(...dicts[dictKey].map(d => ({
                value: d.item_key,
                label: d.item_value || d.item_key,
            })));
        }

        return options;
    };

    // Build icon options with actual icons (no labels as requested)
    const iconOptions = Object.entries(ICON_COMPONENTS).map(([key]) => ({
        value: key,
        label: (
            <div style={{ display: 'flex', justifyContent: 'center', fontSize: 18, padding: '4px 0' }}>
                {ICON_COMPONENTS[key]}
            </div>
        ),
    }));

    // ---- 看板项操作 (通用) ----
    const updateItem = (type: 'column' | 'row', index: number, updates: Partial<BoardCellDef>) => {
        const newConfig = { ...editConfig };
        const target = type === 'column' ? 'columnConfig' : 'rowConfig';
        const items = [...newConfig.board[target].items];
        items[index] = { ...items[index], ...updates };
        newConfig.board[target] = { ...newConfig.board[target], items };
        setEditConfig(newConfig);
    };

    const addItem = (type: 'column' | 'row') => {
        const newConfig = { ...editConfig };
        const target = type === 'column' ? 'columnConfig' : 'rowConfig';
        const items = [...newConfig.board[target].items];
        items.push({
            id: `${type}_${Date.now()}`,
            label: `新${type === 'column' ? '列' : '行'}`,
            values: ['__ALL__'],
            color: 'rgba(100, 100, 100, 0.85)',
            ...(type === 'column' ? { icon: 'AppstoreOutlined' } : { bgColor: 'rgba(240, 240, 240, 0.6)' })
        });
        newConfig.board[target] = { ...newConfig.board[target], items };
        setEditConfig(newConfig);
    };

    const removeItem = (type: 'column' | 'row', index: number) => {
        const newConfig = { ...editConfig };
        const target = type === 'column' ? 'columnConfig' : 'rowConfig';
        const items = [...newConfig.board[target].items];
        items.splice(index, 1);
        newConfig.board[target] = { ...newConfig.board[target], items };
        setEditConfig(newConfig);
    };

    const moveItem = (type: 'column' | 'row', index: number, direction: -1 | 1) => {
        const target = type === 'column' ? 'columnConfig' : 'rowConfig';
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= editConfig.board[target].items.length) return;
        
        const newConfig = { ...editConfig };
        const items = [...newConfig.board[target].items];
        const [removed] = items.splice(index, 1);
        items.splice(newIndex, 0, removed);
        newConfig.board[target] = { ...newConfig.board[target], items };
        setEditConfig(newConfig);
    };

    // ---- 样式 ----
    const itemCardStyle: React.CSSProperties = {
        marginBottom: 8,
        border: '1px solid #f0f0f0',
        borderRadius: 8,
    };

    const fieldRowStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
        flexWrap: 'wrap',
    };

    const labelStyle: React.CSSProperties = {
        fontSize: 12,
        color: '#888',
        minWidth: 48,
        flexShrink: 0,
    };

    const renderCellEditor = (type: 'column' | 'row', item: BoardCellDef, idx: number, dimension: ChartDimension) => {
        const options = getOptionsForDimension(dimension);

        return (
            <Card key={item.id} size="small" style={itemCardStyle}
                styles={{ body: { padding: '8px 12px' } }}
            >
                <div style={fieldRowStyle}>
                    <span style={labelStyle}>显示标题</span>
                    <Input
                        size="small"
                        value={item.label}
                        placeholder="名称"
                        onChange={e => updateItem(type, idx, { label: e.target.value })}
                        style={{ flex: 1, minWidth: 80 }}
                    />
                    {type === 'column' && (
                        <>
                            <span style={labelStyle}>图标</span>
                            <IconPicker 
                                value={item.icon || 'AppstoreOutlined'} 
                                onChange={v => updateItem(type, idx, { icon: v })} 
                            />
                        </>
                    )}
                </div>
                <div style={fieldRowStyle}>
                    <span style={labelStyle}>包含项</span>
                    <Select
                        size="small"
                        mode="multiple"
                        value={item.values}
                        placeholder="选择统计哪些项"
                        onChange={v => updateItem(type, idx, { values: v })}
                        style={{ flex: 1, minWidth: 150 }}
                        options={options}
                        maxTagCount="responsive"
                    />
                    <span style={labelStyle}>主色调</span>
                    <CustomColorPicker
                        size="small"
                        allowClear
                        value={item.color}
                        onChange={(color) => updateItem(type, idx, { color: color })}
                    />
                    {type === 'row' && (
                        <>
                            <span style={labelStyle}>背景色</span>
                            <CustomColorPicker
                                size="small"
                                allowClear
                                value={item.bgColor}
                                onChange={(color) => updateItem(type, idx, { bgColor: color })}
                            />
                        </>
                    )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 4 }}>
                    <Tooltip title="上移"><Button size="small" icon={<ArrowUpOutlined />} disabled={idx === 0} onClick={() => moveItem(type, idx, -1)} /></Tooltip>
                    <Tooltip title="下移"><Button size="small" icon={<ArrowDownOutlined />} disabled={idx === (type === 'column' ? editConfig.board.columnConfig.items.length : editConfig.board.rowConfig.items.length) - 1} onClick={() => moveItem(type, idx, 1)} /></Tooltip>
                    <Popconfirm title="确定删除？" onConfirm={() => removeItem(type, idx)}>
                        <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </div>
            </Card>
        );
    };

    return (
        <Modal
            title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><SettingOutlined style={{ color: '#1677ff' }} /> 问题数据看板全局配置</div>}
            open={open}
            onCancel={onClose}
            width={800}
            footer={[
                <Popconfirm key="reset" title="确定恢复默认配置？" onConfirm={handleReset}>
                    <Button icon={<UndoOutlined />}>恢复默认</Button>
                </Popconfirm>,
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="save" type="primary" onClick={handleSave} loading={saving}>
                    保存并应用
                </Button>
            ]}
        >
            <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '0 8px' }}>
                <Row gutter={24}>
                    <Col span={12}>
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <strong style={{ fontSize: 15 }}>列维度配置</strong>
                                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => addItem('column')}>增加列</Button>
                            </div>
                            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, color: '#666' }}>统计维度:</span>
                                <Select
                                    style={{ flex: 1 }}
                                    value={editConfig.board.columnConfig.dimension}
                                    onChange={val => {
                                        const newConfig = { ...editConfig };
                                        newConfig.board.columnConfig = { ...newConfig.board.columnConfig, dimension: val };
                                        setEditConfig(newConfig);
                                    }}
                                    options={DIMENSION_OPTIONS}
                                />
                            </div>
                            {editConfig.board.columnConfig.items.map((item, idx) => 
                                renderCellEditor('column', item, idx, editConfig.board.columnConfig.dimension)
                            )}
                        </div>
                    </Col>

                    <Col span={12}>
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <strong style={{ fontSize: 15 }}>行维度配置</strong>
                                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => addItem('row')}>增加行</Button>
                            </div>
                            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 13, color: '#666' }}>统计维度:</span>
                                <Select
                                    style={{ flex: 1 }}
                                    value={editConfig.board.rowConfig.dimension}
                                    onChange={val => {
                                        const newConfig = { ...editConfig };
                                        newConfig.board.rowConfig = { ...newConfig.board.rowConfig, dimension: val };
                                        setEditConfig(newConfig);
                                    }}
                                    options={DIMENSION_OPTIONS}
                                />
                            </div>
                            {editConfig.board.rowConfig.items.map((item, idx) => 
                                renderCellEditor('row', item, idx, editConfig.board.rowConfig.dimension)
                            )}
                        </div>
                    </Col>
                </Row>
            </div>
        </Modal>
    );
}

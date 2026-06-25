/**
 * @file PersonnelConfig.tsx
 * @description RADAR 内 PAMS 人员配置：RADAR 角色映射与 PAMS 权限配置。
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Col, Divider, Form, Grid, message, Row, Select, Space, Table, Tooltip, Typography } from 'antd';
import { ReloadOutlined, SafetyCertificateOutlined, SaveOutlined, SolutionOutlined, TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ConfigSection from './ConfigSection';
import { pamsFetch } from '@/lib/api-client';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const fetch = pamsFetch;

const MENU_DICTIONARY: Record<string, string> = {
    dashboard: '统计仪表盘',
    report: '问题上报-报障人',
    'report-tracker': '问题上报-跟踪人',
    'report-ticket': '问题上报-工单',
    'my-issues': '我的问题',
    issues: '问题管理',
    'major-issues': '重大问题',
    faq: '常见问题',
    'business-ticket': '业务工单',
    kongming: '孔明工单',
    itsm: 'ITSM工单',
    'problem-report': '问题快报',
    analyst: '分析报告',
    config: '系统配置',
};

const PAGE_DICTIONARY: Record<string, string> = {
    '/pams/issues/': '问题详情页',
    '/pams/business-ticketdetail/': '业务工单详情页',
    '/pams/kongmingdetail/': '孔明工单详情页',
    '/pams/itsmdetail/': 'ITSM工单详情页',
};

const FEATURE_DICTIONARY: Record<string, string> = {
    'issues:batch': '问题管理-批量操作',
    'issues:export': '问题管理-导出数据',
    'major-issues:batch': '重大问题-批量操作',
    'major-issues:export': '重大问题-导出数据',
    'business-ticket:batch': '业务工单-批量操作',
    'business-ticket:export': '业务工单-导出数据',
    'kongming:batch': '孔明工单-批量操作',
    'kongming:export': '孔明工单-导出数据',
    'itsm:batch': 'ITSM工单-批量操作',
    'itsm:export': 'ITSM工单-导出数据',
    'detailed_classification': '问题管理-详细分类',
    'config:permissions:edit': '系统配置-权限修改',
};

interface RadarRole {
    id: number;
    code: string;
    name: string;
}

interface PamsRole {
    item_key: string;
    item_value: string;
}

interface RoleMapping {
    radar_role_code: string;
    pams_role_key: string;
}

type PermType = 'menus' | 'pages' | 'features';

function ensurePermConfig(config: any, pamsRoles: PamsRole[]) {
    const next = config && typeof config === 'object' ? { ...config } : {};
    for (const type of ['menus', 'pages', 'features'] as PermType[]) {
        if (!next[type]) next[type] = {};
    }
    const ensure = (type: PermType, dict: Record<string, string>) => {
        Object.keys(dict).forEach((key) => {
            if (!next[type][key]) next[type][key] = {};
            pamsRoles.forEach((role) => {
                if (next[type][key][role.item_key] === undefined) {
                    next[type][key][role.item_key] = ['SUPER_ADMIN', 'ADMIN'].includes(role.item_key);
                }
            });
        });
    };
    ensure('menus', MENU_DICTIONARY);
    ensure('pages', PAGE_DICTIONARY);
    ensure('features', FEATURE_DICTIONARY);
    if (!next.allowedDetailedCategories) next.allowedDetailedCategories = {};
    return next;
}

export default function PersonnelConfig() {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    const [activeKey, setActiveKey] = useState('mapping');
    const [loading, setLoading] = useState(true);
    const [savingMapping, setSavingMapping] = useState(false);
    const [savingPerms, setSavingPerms] = useState(false);
    const [radarRoles, setRadarRoles] = useState<RadarRole[]>([]);
    const [pamsRoles, setPamsRoles] = useState<PamsRole[]>([]);
    const [mappings, setMappings] = useState<Record<string, string>>({});
    const [permConfig, setPermConfig] = useState<any>(null);
    const [origPermConfig, setOrigPermConfig] = useState<any>(null);
    const [currentRole, setCurrentRole] = useState('');

    const permissionChanged = JSON.stringify(permConfig) !== JSON.stringify(origPermConfig);

    useEffect(() => {
        fetchAll();
    }, []);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [mappingRes, permRes] = await Promise.all([
                fetch('/PAMS/api/roles/mapping'),
                fetch('/PAMS/api/permissions/config'),
            ]);
            const mappingJson = await mappingRes.json();
            const permJson = await permRes.json();
            if (mappingJson.success) {
                const nextRadar = mappingJson.data.radarRoles || [];
                const nextPams = mappingJson.data.pamsRoles || [];
                const nextMappings: Record<string, string> = {};
                (mappingJson.data.mappings || []).forEach((item: RoleMapping) => {
                    nextMappings[item.radar_role_code] = item.pams_role_key;
                });
                nextRadar.forEach((role: RadarRole) => {
                    if (!nextMappings[role.code]) {
                        const sameName = nextPams.find((p: PamsRole) => p.item_value === role.name || p.item_key === role.code);
                        nextMappings[role.code] = sameName?.item_key || 'ISSUE_MANAGER';
                    }
                });
                setRadarRoles(nextRadar);
                setPamsRoles(nextPams);
                setMappings(nextMappings);
                if (!currentRole && nextPams.length) setCurrentRole(nextPams[0].item_key);
                const ensured = ensurePermConfig(permJson.data || {}, nextPams);
                setPermConfig(ensured);
                setOrigPermConfig(JSON.parse(JSON.stringify(ensured)));
            } else {
                message.error(mappingJson.error || '加载角色映射失败');
            }
        } catch {
            message.error('加载人员配置失败');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveMapping = async () => {
        setSavingMapping(true);
        try {
            const payload = radarRoles.map((role) => ({
                radar_role_code: role.code,
                pams_role_key: mappings[role.code],
            }));
            const res = await fetch('/PAMS/api/roles/mapping', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mappings: payload }),
            });
            const data = await res.json();
            if (data.success) {
                message.success('角色映射已保存');
                fetchAll();
            } else {
                message.error(data.error || '保存失败');
            }
        } catch {
            message.error('保存失败');
        } finally {
            setSavingMapping(false);
        }
    };

    const handlePermChange = (type: PermType, key: string, role: string, checked: boolean) => {
        setPermConfig((prev: any) => {
            const next = JSON.parse(JSON.stringify(prev || {}));
            if (!next[type]) next[type] = {};
            if (!next[type][key]) next[type][key] = {};
            next[type][key][role] = checked;
            return next;
        });
    };

    const handleSavePerms = async () => {
        setSavingPerms(true);
        try {
            const res = await fetch('/PAMS/api/permissions/config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: permConfig }),
            });
            const data = await res.json();
            if (data.success) {
                message.success('权限配置已保存');
                setOrigPermConfig(JSON.parse(JSON.stringify(permConfig)));
            } else {
                message.error(data.error || '保存失败');
            }
        } catch {
            message.error('保存失败');
        } finally {
            setSavingPerms(false);
        }
    };

    const mappingColumns: ColumnsType<RadarRole> = [
        { title: 'RADAR角色', dataIndex: 'name', key: 'name', width: 180 },
        { title: '角色标识', dataIndex: 'code', key: 'code', width: 180 },
        {
            title: '对应PAMS角色',
            key: 'pams_role',
            render: (_, role) => (
                <Select
                    style={{ width: '100%' }}
                    value={mappings[role.code]}
                    options={pamsRoles.map((p) => ({ label: p.item_value, value: p.item_key }))}
                    onChange={(value) => setMappings((prev) => ({ ...prev, [role.code]: value }))}
                />
            ),
        },
    ];

    const permColumns = (type: PermType, dict: Record<string, string>): ColumnsType<any> => [
        {
            title: '功能项',
            dataIndex: 'key',
            key: 'key',
            fixed: 'left',
            width: 180,
            render: (key) => <Text strong>{dict[key] || key}</Text>,
        },
        ...pamsRoles.map((role) => ({
            title: <div style={{ fontSize: 12 }}>{role.item_value}</div>,
            dataIndex: role.item_key,
            key: role.item_key,
            width: 110,
            align: 'center' as const,
            render: (_: any, record: any) => (
                <Checkbox
                    checked={!!permConfig?.[type]?.[record.key]?.[role.item_key]}
                    onChange={(event) => handlePermChange(type, record.key, role.item_key, event.target.checked)}
                />
            ),
        })),
    ];

    const permData = (dict: Record<string, string>) => Object.keys(dict).map((key) => ({ key }));

    const renderPermTable = (type: PermType, dict: Record<string, string>) => isMobile ? (
        <Card size="small" style={{ marginBottom: 16 }}>
            <Space direction="vertical" style={{ width: '100%' }}>
                <Select
                    value={currentRole}
                    onChange={setCurrentRole}
                    options={pamsRoles.map((role) => ({ label: role.item_value, value: role.item_key }))}
                    style={{ width: '100%' }}
                />
                {Object.keys(dict).map((key) => (
                    <Row key={key} justify="space-between" align="middle">
                        <Col><Text>{dict[key]}</Text></Col>
                        <Col>
                            <Checkbox
                                checked={!!permConfig?.[type]?.[key]?.[currentRole]}
                                onChange={(event) => handlePermChange(type, key, currentRole, event.target.checked)}
                            />
                        </Col>
                    </Row>
                ))}
            </Space>
        </Card>
    ) : (
        <Table
            columns={permColumns(type, dict)}
            dataSource={permData(dict)}
            rowKey="key"
            size="small"
            bordered
            pagination={false}
            scroll={{ x: 180 + pamsRoles.length * 110 }}
            style={{ marginBottom: 16 }}
        />
    );

    const items = useMemo(() => [
        {
            key: 'mapping',
            label: <Space><TeamOutlined />角色映射</Space>,
            children: (
                <Card
                    title={<Space><SolutionOutlined />RADAR角色与PAMS角色对应关系</Space>}
                    size="small"
                    loading={loading}
                    extra={
                        <Space>
                            <Tooltip title="重新加载">
                                <Button icon={<ReloadOutlined />} onClick={fetchAll} />
                            </Tooltip>
                            <Button type="primary" icon={<SaveOutlined />} loading={savingMapping} onClick={handleSaveMapping}>保存映射</Button>
                        </Space>
                    }
                >
                    <Table columns={mappingColumns} dataSource={radarRoles} rowKey="code" size="small" pagination={false} />
                </Card>
            ),
        },
        {
            key: 'permissions',
            label: <Space><SafetyCertificateOutlined />角色权限</Space>,
            children: (
                <Card
                    title={<Space><SafetyCertificateOutlined />PAMS角色权限配置</Space>}
                    size="small"
                    loading={loading}
                    extra={
                        <Space>
                            <Button icon={<ReloadOutlined />} disabled={!permissionChanged} onClick={() => setPermConfig(JSON.parse(JSON.stringify(origPermConfig)))}>重置</Button>
                            <Button type="primary" icon={<SaveOutlined />} loading={savingPerms} disabled={!permissionChanged} onClick={handleSavePerms}>保存权限</Button>
                        </Space>
                    }
                >
                    <Title level={5} style={{ fontSize: 13, color: 'var(--radar-primary)' }}>1. 菜单权限</Title>
                    {renderPermTable('menus', MENU_DICTIONARY)}
                    <Divider />
                    <Title level={5} style={{ fontSize: 13, color: 'var(--radar-primary)' }}>2. 页面权限</Title>
                    {renderPermTable('pages', PAGE_DICTIONARY)}
                    <Divider />
                    <Title level={5} style={{ fontSize: 13, color: 'var(--radar-primary)' }}>3. 功能权限</Title>
                    {renderPermTable('features', FEATURE_DICTIONARY)}
                </Card>
            ),
        },
    ], [loading, savingMapping, savingPerms, radarRoles, pamsRoles, mappings, permConfig, origPermConfig, currentRole]);

    return <ConfigSection items={items} activeKey={activeKey} onChange={setActiveKey} />;
}

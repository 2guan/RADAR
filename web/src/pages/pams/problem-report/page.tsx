/**
 * @file page.tsx
 * @description PAMS 系统一键快报生成与管理操作页面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Button, message, Spin, Input, Row, Col, Table, Select, Modal, Drawer, Space as AntSpace, Button as AntButton, Grid, List, Typography } from 'antd';
import styles from '../issue-table.module.css';
import { toBeijingTime } from '@/lib/timezone';
import { FileTextOutlined, ReloadOutlined, SaveOutlined, ShareAltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAuth } from '@/components/AuthProvider';
import { IssueDetailView } from '@/components/IssueDetailView';
import type { Issue, DictItem } from '@/types';
import { pamsFetch } from '@/lib/api-client';
import './problem-report.css';

const { TextArea } = Input;
const fetch = pamsFetch;

interface StatRow {
    group_name: string;
    total: number;
    resolved: number;
    analysis: number;
    verifying: number;
    major: number;
}

interface CategoryStats {
    items: StatRow[];
    summary: {
        total: number;
        resolved: number;
        analysis: number;
        verifying: number;
        major: number;
    };
    type?: 'grouped';
    categories?: {
        category_name: string;
        category_key: string;
        items: StatRow[];
        summary: {
            total: number;
            resolved: number;
            analysis: number;
            verifying: number;
            major: number;
        };
    }[];
}

const { useBreakpoint } = Grid;
export default function ProblemReportPage() {
    const screens = useBreakpoint();
    const [loading, setLoading] = useState(false);
    const [statsLoading, setStatsLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [generatingQuick, setGeneratingQuick] = useState(false);
    const [report, setReport] = useState('');
    const { Text } = Typography;

    // Category stats
    const [jinkeStats, setJinkeStats] = useState<CategoryStats | null>(null);
    const [nongxinStats, setNongxinStats] = useState<CategoryStats | null>(null);
    const [otherStats, setOtherStats] = useState<CategoryStats | null>(null);
    const [combinedStats, setCombinedStats] = useState<CategoryStats | null>(null);

    // Round stats
    const [selectedRound, setSelectedRound] = useState<string | undefined>(undefined);
    const [roundInitialized, setRoundInitialized] = useState(false);

    // Filter state
    const [filters, setFilters] = useState({
        business_group: [] as string[],
        status: [] as string[],
    });
    const [filteredStats, setFilteredStats] = useState<any>(null);
    const [dicts, setDicts] = useState<Record<string, any[]>>({
        business_group: [],
        issue_status: [],
        issue_category: [],
        issue_detailed_classification: [],
        issue_round: [],
        module: [],
        system: [],
        organization: [],
        issue_urgency: [],
        issue_handling_method: [],
    });

    // Modal and detail state
    const [modalVisible, setModalVisible] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalIssues, setModalIssues] = useState<any[]>([]);
    const [modalTitle, setModalTitle] = useState('');
    const [detailVisible, setDetailVisible] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
    const { user } = useAuth();

    // Prompt state
    const [isPromptModalVisible, setIsPromptModalVisible] = useState(false);
    const [customPrompt, setCustomPrompt] = useState('');
    const [defaultQuickReportPrompt, setDefaultQuickReportPrompt] = useState('');

    useEffect(() => {
        // fetchStats(); // Moved to selectedRound effect
        fetchDicts();
        fetchPrompts();
    }, []);

    const fetchPrompts = async () => {
        try {
            const res = await fetch('/PAMS/api/analyst/prompts');
            const data = await res.json();
            if (data.success) {
                setDefaultQuickReportPrompt(data.data.quick_report);
                setCustomPrompt(data.data.quick_report);
            }
        } catch (error) {
            console.error('Failed to fetch prompts', error);
        }
    };


    // Initialize default round
    useEffect(() => {
        if (!roundInitialized && dicts.issue_round.length > 0) {
            const defaultItem = dicts.issue_round.find(d => d.is_default_val === 1);
            if (defaultItem) {
                setSelectedRound(defaultItem.item_key);
            }
            setRoundInitialized(true);
        }
    }, [dicts.issue_round, roundInitialized]);

    // Fetch stats when round changes
    useEffect(() => {
        fetchStats();
    }, [selectedRound]);

    // Fetch filtered statistics when filters change
    useEffect(() => {
        fetchFilteredStats();
    }, [filters.business_group, filters.status, selectedRound]);

    const fetchDicts = async () => {
        try {
            const res = await fetch('/PAMS/api/dicts');
            const data = await res.json();

            if (data.success && Array.isArray(data.data)) {
                const newDicts: Record<string, DictItem[]> = {
                    issue_status: [],
                    issue_category: [],
                    issue_detailed_classification: [],
                    issue_round: [],
                    issue_tag: [],
                    module: [],
                    system: [],
                    business_group: [],
                    organization: [],
                    issue_urgency: [],
                    issue_handling_method: []
                };

                // Group by dict_code locally
                data.data.forEach((item: DictItem & { dict_code: string }) => {
                    if (newDicts[item.dict_code]) {
                        newDicts[item.dict_code].push(item);
                    }
                });

                setDicts(newDicts);
            }
        } catch (error) {
            console.error('Failed to fetch dicts', error);
        }
    };

    const fetchStats = async () => {
        setStatsLoading(true);
        try {
            // Fetch jinke stats
            const jinkeRes = await fetch('/PAMS/api/report/category-stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryGroup: 'jinke', round: selectedRound })
            });
            const jinkeData = await jinkeRes.json();
            if (jinkeData.success) {
                setJinkeStats(jinkeData.data);
            }

            // Fetch nongxin stats
            const nongxinRes = await fetch('/PAMS/api/report/category-stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryGroup: 'nongxin', round: selectedRound })
            });
            const nongxinData = await nongxinRes.json();
            if (nongxinData.success) {
                setNongxinStats(nongxinData.data);
            }

            // Fetch other stats
            const otherRes = await fetch('/PAMS/api/report/category-stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ categoryGroup: 'other', round: selectedRound })
            });
            const otherData = await otherRes.json();
            if (otherData.success) {
                setOtherStats(otherData.data);
            }
        } catch (error) {
            message.error('获取统计数据失败');
        } finally {
            setStatsLoading(false);
        }
    };

    // Calculate combined stats whenever jinke, nongxin, or other stats change
    useEffect(() => {
        if (!jinkeStats && !nongxinStats && !otherStats) return;

        const mergedMap = new Map<string, StatRow>();
        const summary = { total: 0, resolved: 0, analysis: 0, verifying: 0, major: 0 };

        const processItems = (items: StatRow[]) => {
            items.forEach(item => {
                if (!mergedMap.has(item.group_name)) {
                    mergedMap.set(item.group_name, { ...item });
                } else {
                    const existing = mergedMap.get(item.group_name)!;
                    existing.total += item.total;
                    existing.resolved += item.resolved;
                    existing.analysis += item.analysis;
                    existing.verifying += item.verifying;
                    existing.major += item.major;
                }
                summary.total += item.total;
                summary.resolved += item.resolved;
                summary.analysis += item.analysis;
                summary.verifying += item.verifying;
                summary.major += item.major;
            });
        };

        if (jinkeStats?.items) processItems(jinkeStats.items);
        if (nongxinStats?.items) processItems(nongxinStats.items);
        if (otherStats?.type === 'grouped' && otherStats.categories) {
            otherStats.categories.forEach(cat => processItems(cat.items));
        } else if (otherStats?.items) {
            processItems(otherStats.items);
        }

        setCombinedStats({
            items: Array.from(mergedMap.values()).sort((a, b) => b.total - a.total),
            summary
        });
    }, [jinkeStats, nongxinStats, otherStats]);

    const fetchFilteredStats = async () => {
        // Only fetch if there are filters applied
        if (filters.business_group.length === 0 && filters.status.length === 0 && !selectedRound) {
            setFilteredStats(null);
            return;
        }

        try {
            const res = await fetch('/PAMS/api/report/stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    business_group: filters.business_group,
                    status: filters.status,
                    round: selectedRound
                })
            });
            const data = await res.json();
            if (data.success) {
                setFilteredStats(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch filtered stats', error);
        }
    };



    const handleGenerateReport = async () => {
        setGenerating(true);
        try {
            const res = await fetch('/PAMS/api/report/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    business_group: filters.business_group,
                    status: filters.status,
                    round: selectedRound,
                    custom_prompt: customPrompt || undefined
                })
            });

            const data = await res.json();

            if (data.success) {
                setReport(data.data.report);
                setFilteredStats(data.data.stats);
                message.success('报告生成成功');
            } else {
                message.error(data.error || '生成报告失败');
            }
        } catch (error) {
            message.error('生成报告失败');
        } finally {
            setGenerating(false);
        }
    };

    const handleGenerateQuickDaily = async () => {
        setGeneratingQuick(true);
        try {
            const res = await fetch('/PAMS/api/report/quick-daily', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ round: selectedRound })
            });

            const data = await res.json();

            if (data.success) {
                setReport(data.data.report);
                message.success('快捷日报生成成功');
            } else {
                message.error(data.error || '生成日报失败');
            }
        } catch (error) {
            message.error('生成日报失败');
        } finally {
            setGeneratingQuick(false);
        }
    };

    const handleCellClick = async (
        record: StatRow, 
        categoryGroup: 'jinke' | 'nongxin' | 'other' | 'all', 
        columnType: 'total' | 'resolved' | 'analysis' | 'verifying' | 'major',
        categoryKey?: string
    ) => {
        // For summary row, show title without specific group name
        const titlePrefix = (record as any)._isSummary
            ? (categoryKey || (categoryGroup === 'jinke' ? '金科' : categoryGroup === 'nongxin' ? '农信' : '其它'))
            : record.group_name;

        let statusText = '全部';
        if (columnType === 'resolved') statusText = '已解决';
        else if (columnType === 'analysis') statusText = '分析处理中';
        else if (columnType === 'verifying') statusText = '待验证';
        else if (columnType === 'major') statusText = '重大问题';

        setModalTitle(`${titlePrefix} - ${statusText}`);
        setModalVisible(true);
        setModalLoading(true);
        setModalIssues([]);

        try {
            const query = new URLSearchParams();
            query.append('page', '1');
            query.append('pageSize', '100');
            if (selectedRound) {
                query.append('round', selectedRound);
            }

            // Category filter
            if (categoryGroup === 'jinke') {
                query.append('category_group', '金科');
                if (!(record as any)._isSummary && record.group_name !== '未分配') {
                    const bgDict = dicts.business_group.find(d => d.item_value === record.group_name);
                    if (bgDict) {
                        query.append('business_group', bgDict.item_key);
                    }
                }
            } else if (categoryGroup === 'nongxin') {
                query.append('category_group', '农信');
                if (!(record as any)._isSummary && record.group_name !== '未分配') {
                    const bgDict = dicts.business_group.find(d => d.item_value === record.group_name);
                    if (bgDict) {
                        query.append('business_group', bgDict.item_key);
                    }
                }
            } else if (categoryGroup === 'other') {
                if (categoryKey) {
                    // Grouped other category
                    if (categoryKey !== '未分类') {
                        query.append('category', categoryKey);
                    } else {
                        query.append('category_group', '其它');
                    }
                    
                    // Add business group filter if not summary row
                    if (!(record as any)._isSummary && record.group_name !== '未分配') {
                        const bgDict = dicts.business_group.find(d => d.item_value === record.group_name);
                        if (bgDict) {
                            query.append('business_group', bgDict.item_key);
                        }
                    }
                } else {
                    // Fallback for old flat other stats or summary
                    if (!(record as any)._isSummary) {
                        if (record.group_name !== '未分类') {
                            const catDict = dicts.issue_category.find(d => d.item_value === record.group_name);
                            if (catDict) {
                                query.append('category', catDict.item_key);
                            } else {
                                query.append('category', record.group_name);
                            }
                        } else {
                            query.append('category_group', '其它');
                        }
                    } else {
                        query.append('category_group', '其它');
                    }
                }
            } else if (categoryGroup === 'all') {
                if (!(record as any)._isSummary && record.group_name !== '未分配') {
                    const bgDict = dicts.business_group.find(d => d.item_value === record.group_name);
                    if (bgDict) {
                        query.append('business_group', bgDict.item_key);
                    }
                }
            }

            // Status filter
            if (columnType === 'resolved') {
                query.append('status', '已解决');
            } else if (columnType === 'analysis') {
                query.append('status', '提出,已查明原因,处理中,重现');
            } else if (columnType === 'verifying') {
                query.append('status', '待验证,下轮验证');
            } else if (columnType === 'major') {
                query.append('is_major', '1');
            }

            const res = await fetch(`/PAMS/api/issues?${query.toString()}`);
            const data = await res.json();
            if (data.success && data.data) {
                setModalIssues(data.data.items);
            } else {
                message.error('获取问题列表失败');
            }
        } catch (error) {
            console.error('Fetch modal issues error:', error);
            message.error('获取问题列表失败');
        } finally {
            setModalLoading(false);
        }
    };

    const handleUpdateIssue = async (values: any) => {
        if (!selectedIssue) return;
        try {
            const payload = { ...values };
            const res = await fetch(`/PAMS/api/issues/${selectedIssue.issue_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                message.success('问题更新成功');
                // Refresh detail
                const detailRes = await fetch(`/PAMS/api/issues/${selectedIssue.issue_id}`);
                const detailData = await detailRes.json();
                if (detailData.success) {
                    setSelectedIssue(detailData.data);
                }
            } else {
                message.error(data.error || '更新失败');
            }
        } catch {
            message.error('更新失败');
        }
    };

    const handleIssueRefresh = async (issueId: string) => {
        try {
            const res = await fetch(`/PAMS/api/issues/${issueId}`);
            const data = await res.json();
            if (data.success) {
                setSelectedIssue(data.data);
            }
        } catch (error) {
            console.error('Failed to refresh issue:', error);
        }
    };

    const handleAddAnalysis = async (content: string, handlerInfo?: { name: string, org: string, contact: string }) => {
        if (!content.trim() || !selectedIssue) return;

        try {
            const res = await fetch(`/PAMS/api/issues/${selectedIssue.issue_id}/analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    handler_name: handlerInfo?.name,
                    handler_org: handlerInfo?.org,
                    handler_contact: handlerInfo?.contact
                }),
            });
            const data = await res.json();
            if (data.success) {
                message.success('分析日志已添加');
                await handleIssueRefresh(selectedIssue.issue_id);
            } else {
                message.error(data.error);
            }
        } catch {
            message.error('添加分析日志失败');
        }
    };

    // Table columns for statistics
    const createStatsColumns = (categoryGroup: 'jinke' | 'nongxin' | 'other' | 'all', categoryKey?: string): ColumnsType<StatRow> => [
        {
            title: categoryGroup === 'other' && !categoryKey ? '分类' : '实施机构',
            dataIndex: 'group_name',
            key: 'group_name',
            width: 150,
            align: 'center',
            render: (text) => <strong>{text}</strong>
        },
        {
            title: '总计',
            dataIndex: 'total',
            key: 'total',
            width: 100,
            align: 'center',
            render: (val, record: any) => {
                // For summary row, click to show all issues in the category
                if (record._isSummary) {
                    return <a onClick={() => handleCellClick({ group_name: '', _isSummary: true } as any, categoryGroup, 'total', categoryKey)} style={{ color: '#000' }}>{val}</a>;
                }
                return <a onClick={() => handleCellClick(record, categoryGroup, 'total', categoryKey)} style={{ color: '#000' }}>{val}</a>;
            }
        },
        {
            title: '已解决',
            dataIndex: 'resolved',
            key: 'resolved',
            width: 100,
            align: 'center',
            render: (val, record: any) => {
                if (record._isSummary) {
                    return <a onClick={() => handleCellClick({ group_name: '', _isSummary: true } as any, categoryGroup, 'resolved', categoryKey)} style={{ color: '#52c41a' }}>{val}</a>;
                }
                return <a onClick={() => handleCellClick(record, categoryGroup, 'resolved', categoryKey)} style={{ color: '#52c41a' }}>{val}</a>;
            }
        },
        {
            title: '分析处理中',
            dataIndex: 'analysis',
            key: 'analysis',
            width: 120,
            align: 'center',
            render: (val, record: any) => {
                const style = { color: '#1890ff' };
                if (record._isSummary) {
                    return <a onClick={() => handleCellClick({ group_name: '', _isSummary: true } as any, categoryGroup, 'analysis', categoryKey)} style={style}>{val}</a>;
                }
                return <a onClick={() => handleCellClick(record, categoryGroup, 'analysis', categoryKey)} style={style}>{val}</a>;
            }
        },
        {
            title: '待验证',
            dataIndex: 'verifying',
            key: 'verifying',
            width: 120,
            align: 'center',
            render: (val, record: any) => {
                const style = { color: '#faad14' };
                if (record._isSummary) {
                    return <a onClick={() => handleCellClick({ group_name: '', _isSummary: true } as any, categoryGroup, 'verifying', categoryKey)} style={style}>{val}</a>;
                }
                return <a onClick={() => handleCellClick(record, categoryGroup, 'verifying', categoryKey)} style={style}>{val}</a>;
            }
        },
    ];

    // Issue list columns for modal
    const issueColumns = [
        {
            title: '编号',
            dataIndex: 'issue_id',
            key: 'issue_id',
            width: 120,
            align: 'center',
            render: (text: string, record: any) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.4, alignItems: 'center' }}>
                    <a 
                        className="issue-id-table-fixed"
                        style={text && text.length > 14 ? { fontSize: text.length > 17 ? '10px' : '11px' } : {}}
                        onClick={async () => {
                            const hide = message.loading('加载详情中...', 0);
                            try {
                                const res = await fetch(`/PAMS/api/issues/${record.issue_id}`);
                                const data = await res.json();
                                if (data.success) {
                                    setSelectedIssue(data.data);
                                    setDetailVisible(true);
                                } else {
                                    message.error('加载失败');
                                }
                            } catch {
                                message.error('加载异常');
                            } finally {
                                hide();
                            }
                        }}
                    >
                        {text}
                    </a>
                    {record.work_order_no && (
                        <span style={{ fontSize: '9px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingBottom: '1px', maxWidth: '110px' }} title={record.work_order_no}>
                            {record.work_order_no}
                        </span>
                    )}
                </div>
            )
        },
        {
            title: '所属系统',
            dataIndex: 'system',
            key: 'system',
            width: 120,
            render: (val: string) => dicts.system.find(d => d.item_key === val)?.item_value || val
        },
        {
            title: '摘要',
            dataIndex: 'summary',
            key: 'summary',
            render: (text: string) => <div className="ellipsis-2">{text}</div>,
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 80,
        },
        {
            title: '跟踪人',
            dataIndex: 'tracker_name',
            key: 'tracker_name',
            width: 80,
        },
        {
            title: '创建时间',
            dataIndex: 'create_time',
            key: 'create_time',
            width: 150,
            render: (text: string) => text?.substring(0, 10),
        },
    ];

    return (
        <div style={{ padding: screens.xs ? 0 : 24 }}>
            {/* Round Filter at Top */}
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <span style={{ marginRight: 8, fontWeight: 500 }}>轮次筛选：</span>
                <Select
                    style={{ width: 140 }}
                    placeholder="选择测试轮次"
                    allowClear
                    value={selectedRound}
                    onChange={(val) => setSelectedRound(val)}
                >
                    {dicts.issue_round.map(d => (
                        <Select.Option key={d.item_key} value={d.item_key}>{d.item_value}</Select.Option>
                    ))}
                </Select>
            </div>

            <Spin spinning={statsLoading}>
                {/* 金科统计 */}
                <Card
                    title="金科统计（金科技术 + 金科业务）"
                    className="jinke-stats-card"
                extra={
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchStats}
                        loading={statsLoading}
                    >
                        刷新统计
                    </Button>
                }
                loading={statsLoading && !jinkeStats}
                style={{ marginBottom: 24 }}
            >
                {jinkeStats && (
                    <>
                        <Table
                            columns={createStatsColumns('jinke')}
                            dataSource={[
                                ...jinkeStats.items,
                                {
                                    group_name: '金科总计',
                                    ...jinkeStats.summary,
                                    _isSummary: true
                                }
                            ]}
                            rowKey="group_name"
                            pagination={false}
                            size="small"
                            bordered
                            rowClassName={(record: any) => record._isSummary ? 'summary-row' : ''}
                        />
                    </>
                )}
            </Card>

            {/* 农信统计 */}
            <Card
                title="农信统计（农信技术 + 农信业务）"
                className="nongxin-stats-card"
                loading={statsLoading && !nongxinStats}
                style={{ marginBottom: 24 }}
            >
                {nongxinStats && (
                    <>
                        <Table
                            columns={createStatsColumns('nongxin')}
                            dataSource={[
                                ...nongxinStats.items,
                                {
                                    group_name: '农信总计',
                                    ...nongxinStats.summary,
                                    _isSummary: true
                                }
                            ]}
                            rowKey="group_name"
                            pagination={false}
                            size="small"
                            bordered
                            rowClassName={(record: any) => record._isSummary ? 'summary-row' : ''}
                        />
                    </>
                )}
            </Card>

            {/* 其它统计 */}
            {otherStats && otherStats.summary.total > 0 && (
                <div className="other-stats-container">
                    <div style={{ marginBottom: 16, fontSize: 18, fontWeight: 'bold' }}>其它统计</div>
                    {otherStats.type === 'grouped' && otherStats.categories ? (
                        otherStats.categories.map((cat) => (
                            <Card
                                key={cat.category_key}
                                title={cat.category_name}
                                className="other-category-card"
                                loading={statsLoading && !otherStats}
                                style={{ marginBottom: 24 }}
                            >
                                <Table
                                    columns={createStatsColumns('other', cat.category_key)}
                                    dataSource={[
                                        ...cat.items,
                                        {
                                            group_name: `${cat.category_name}总计`,
                                            ...cat.summary,
                                            _isSummary: true
                                        }
                                    ]}
                                    rowKey="group_name"
                                    pagination={false}
                                    size="small"
                                    bordered
                                    rowClassName={(record: any) => record._isSummary ? 'summary-row' : ''}
                                />
                            </Card>
                        ))
                    ) : (
                        <Card
                            title="其它统计（未分类等）"
                            loading={statsLoading && !otherStats}
                            style={{ marginBottom: 24 }}
                        >
                            <Table
                                columns={createStatsColumns('other')}
                                dataSource={[
                                    ...otherStats.items,
                                    {
                                        group_name: '其它总计',
                                        ...otherStats.summary,
                                        _isSummary: true
                                    }
                                ]}
                                rowKey="group_name"
                                pagination={false}
                                size="small"
                                bordered
                                rowClassName={(record: any) => record._isSummary ? 'summary-row' : ''}
                            />
                        </Card>
                    )}
                </div>
            )}

            {/* 汇总统计 */}
            {combinedStats && (
                <Card
                    title="汇总统计（包含所有分类）"
                    className="combined-stats-card"
                    loading={statsLoading && !combinedStats}
                    style={{ marginBottom: 24, border: '2px solid #f0f0f0' }}
                >
                    <Table
                        columns={createStatsColumns('all')}
                        dataSource={[
                            ...combinedStats.items,
                            {
                                group_name: '全部总计',
                                ...combinedStats.summary,
                                _isSummary: true
                            }
                        ]}
                        rowKey="group_name"
                        pagination={false}
                        size="small"
                        bordered
                        rowClassName={(record: any) => record._isSummary ? 'summary-row' : ''}
                    />
                </Card>
            )}

            <Card
                title="生成问题快报"
            >
                {/* Filter Section */}
                <div style={{ marginBottom: 24, padding: 16, background: '#fafafa', borderRadius: 0 }}>
                    <div style={{ marginBottom: 12 }}>
                        <strong>筛选条件</strong>
                    </div>
                    <Row gutter={[16, 16]}>
                        <Col span={screens.xs ? 24 : 8}>
                            <div style={{ marginBottom: 8 }}>所属轮次：</div>
                            <Select
                                style={{ width: '100%' }}
                                placeholder="选择测试轮次"
                                allowClear
                                value={selectedRound}
                                onChange={(val) => setSelectedRound(val)}
                            >
                                {dicts.issue_round.map(d => (
                                    <Select.Option key={d.item_key} value={d.item_key}>{d.item_value}</Select.Option>
                                ))}
                            </Select>
                        </Col>
                        <Col span={screens.xs ? 24 : 8}>
                            <div style={{ marginBottom: 8 }}>实施机构：</div>
                            <Select
                                mode="multiple"
                                style={{ width: '100%' }}
                                placeholder="选择实施机构"
                                allowClear
                                value={filters.business_group}
                                onChange={(value: string[]) => setFilters(prev => ({ ...prev, business_group: value }))}
                            >
                                {dicts.business_group.map(item => (
                                    <Select.Option key={item.item_key} value={item.item_key}>
                                        {item.item_value}
                                      </Select.Option>
                                ))}
                            </Select>
                        </Col>
                        <Col span={screens.xs ? 24 : 8}>
                            <div style={{ marginBottom: 8 }}>问题状态：</div>
                            <Select
                                mode="multiple"
                                style={{ width: '100%' }}
                                placeholder="选择问题状态"
                                allowClear
                                value={filters.status}
                                onChange={(value: string[]) => setFilters(prev => ({ ...prev, status: value }))}
                            >
                                {dicts.issue_status.map(item => (
                                    <Select.Option key={item.item_key} value={item.item_key}>
                                        {item.item_value}
                                    </Select.Option>
                                ))}
                            </Select>
                        </Col>
                    </Row>
                </div>

                {/* Filtered Statistics */}
                {filteredStats && (
                    <div style={{ marginBottom: 24, padding: 16, background: '#e6f7ff', borderRadius: 0 }}>
                        <div style={{ marginBottom: 12 }}>
                            <strong>筛选后统计</strong>
                        </div>
                        <Row gutter={[16, 16]}>
                            <Col span={screens.xs ? 24 : 8}>
                                <div>
                                    <div style={{ fontSize: 13, color: '#666' }}>问题总数</div>
                                    <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>{filteredStats.total}</div>
                                </div>
                            </Col>
                            <Col span={screens.xs ? 12 : 8}>
                                <div>
                                    <div style={{ fontSize: 13, color: '#666' }}>已解决</div>
                                    <div style={{ fontSize: 20, fontWeight: 'bold', color: '#52c41a' }}>{filteredStats.resolved}</div>
                                </div>
                            </Col>
                            <Col span={screens.xs ? 12 : 8}>
                                <div>
                                    <div style={{ fontSize: 13, color: '#666' }}>分析处理中</div>
                                    <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1890ff' }}>{filteredStats.pending}</div>
                                </div>
                            </Col>
                        </Row>
                    </div>
                )}

                {/* Generate Button */}
                <div style={{ 
                    marginBottom: 16, 
                    display: 'flex', 
                    flexDirection: screens.xs ? 'column' : 'row', 
                    justifyContent: 'center', 
                    gap: screens.xs ? '8px' : '16px',
                    padding: screens.xs ? '0 16px' : 0
                }}>
                    <Button
                        type="primary"
                        size="large"
                        icon={<FileTextOutlined />}
                        onClick={handleGenerateReport}
                        loading={generating}
                    >
                        生成问题快报
                    </Button>
                    <Button
                        size="large"
                        onClick={() => setIsPromptModalVisible(true)}
                        disabled={generating}
                    >
                        编辑提示词
                    </Button>
                    <Button
                        size="large"
                        icon={<FileTextOutlined />}
                        onClick={handleGenerateQuickDaily}
                        loading={generatingQuick}
                        style={{ backgroundColor: '#dbedff', borderColor: '#4096ff', color: '#005ee5' }}
                    >
                        快捷日报
                    </Button>
                </div>

                <div style={{ marginBottom: 16 }}>
                    <p style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>
                        点击"生成问题快报"按钮，系统将根据筛选条件统计问题数据并使用AI生成问题概述（最多70字）。
                        生成后可在下方文本框中编辑。
                    </p>
                </div>

                <TextArea
                    value={report}
                    onChange={(e) => setReport(e.target.value)}
                    placeholder="点击上方按钮生成问题快报..."
                    rows={20}
                    style={{ fontFamily: 'monospace', fontSize: 13, lineHeight: 1.8 }}
                />

                {report && (
                    <div style={{ marginTop: 16, textAlign: 'right' }}>
                        <Button
                            onClick={() => {
                                navigator.clipboard.writeText(report);
                                message.success('已复制到剪贴板');
                            }}
                        >
                            复制报告
                        </Button>
                    </div>
                )}
            </Card>
        </Spin>

            {/* 问题列表 Modal */}
            <Modal
                title={modalTitle}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                footer={null}
                width={1000}
                styles={{ body: { padding: (screens.xs || (screens.sm && !screens.md)) ? '4px' : '24px' } }}
            >
                {screens.xs || (screens.sm && !screens.md) ? (
                    <List
                        grid={{ gutter: 8, column: 1 }}
                        dataSource={modalIssues}
                        loading={modalLoading}
                        pagination={{ pageSize: 10, size: 'small' }}
                        renderItem={item => {
                            const systemInfo = dicts.system.find(d => d.item_key === item.system);
                            const sysName = systemInfo?.item_value || item.system || '-';
                            const moduleDisplay = dicts.module.find(d => d.item_key === item.module)?.item_value;
                            const bgDisplay = dicts.business_group.find(d => d.item_key === item.business_group)?.item_value;

                            return (
                                <List.Item 
                                    onClick={async () => {
                                        const hide = message.loading('加载详情中...', 0);
                                        try {
                                            const res = await fetch(`/PAMS/api/issues/${item.issue_id}`);
                                            const data = await res.json();
                                            if (data.success) {
                                                setSelectedIssue(data.data);
                                                setDetailVisible(true);
                                            } else {
                                                message.error('加载失败');
                                            }
                                        } catch {
                                            message.error('加载异常');
                                        } finally {
                                            hide();
                                        }
                                    }}
                                    style={{ cursor: 'pointer', padding: '0' }}
                                >
                                    <Card
                                        size="small"
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className={styles.issueIdMain} title={item.issue_id}>{item.issue_id}</span>
                                                <div className={`${styles.statusBadge} ${item.status === '处理中' ? styles.statusProcessing :
                                                    item.status === '已解决' ? styles.statusSolved :
                                                        item.status === '待验证' ? styles.statusVerify :
                                                            item.status === '重现' ? styles.statusReproduce :
                                                                item.status === '已查明原因' ? styles.statusFound : ''
                                                    }`}>
                                                    <span className={styles.statusBadgeDot}></span>
                                                    {item.status}
                                                </div>
                                            </div>
                                        }
                                        extra={
                                            <Text type="secondary" style={{ fontSize: 12 }}>{toBeijingTime(item.create_time, 'MM-DD HH:mm')}</Text>
                                        }
                                    >
                                        <div style={{ marginBottom: 8 }}>
                                            <Text strong>{item.summary}</Text>
                                        </div>
                                        {item.details && (
                                            <div className={styles.issueDetailPreview} title={item.details.replace(/<[^>]+>/g, '')}>
                                                {item.details.replace(/<[^>]+>/g, '')}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px' }}>
                                            <span className={styles.systemName}>{sysName}</span>
                                            {bgDisplay && <span className={styles.tagGray}>{bgDisplay}</span>}
                                            {moduleDisplay && <span className={styles.tagGray}>{moduleDisplay}</span>}
                                        </div>
                                        <div className={styles.peopleGrid}>
                                            <div className={styles.personCard}>
                                                <span className={`${styles.personTag} ${styles.tagTracker}`}>跟踪人</span>
                                                <span className={styles.personName}>{item.tracker_name || '-'}</span>
                                            </div>
                                            <div className={styles.personCard}>
                                                <span className={`${styles.personTag} ${styles.tagReporter}`}>报障人</span>
                                                <span className={styles.personName}>{item.reporter_name || '-'}</span>
                                            </div>
                                            <div className={styles.personCard}>
                                                <span className={`${styles.personTag} ${styles.tagHandler}`}>处理人</span>
                                                <span className={styles.personName}>{item.handler_name || '-'}</span>
                                            </div>
                                        </div>
                                    </Card>
                                </List.Item>
                            );
                        }}
                    />
                ) : (
                    <Table
                        dataSource={modalIssues}
                        columns={issueColumns}
                        rowKey="issue_id"
                        loading={modalLoading}
                        pagination={{ pageSize: 10 }}
                        size="small"
                    />
                )}
            </Modal>

            {/* 问题详情 Drawer */}
            <Drawer
                open={detailVisible}
                onClose={() => setDetailVisible(false)}
                title="问题详情"
                styles={{ body: { padding: 0 }, wrapper: { width: 800 } }}
            >
                {selectedIssue && (
                    <IssueDetailView
                        issueId={selectedIssue.issue_id}
                        dicts={dicts}
                        user={user}
                        onRefresh={() => {
                            fetchStats();
                            fetchFilteredStats();
                        }}
                    />
                )}
            </Drawer>

            <Modal
                title="编辑问题快报 AI 提示词"
                open={isPromptModalVisible}
                onOk={() => setIsPromptModalVisible(false)}
                onCancel={() => {
                    setIsPromptModalVisible(false);
                    setCustomPrompt(defaultQuickReportPrompt); // Reset if cancelled and not saved? Actually let's just let them keep it for now.
                }}
                width={800}
                okText="保存临时提示词"
                cancelText="重置"
                footer={[
                    <Button key="reset" onClick={() => setCustomPrompt(defaultQuickReportPrompt)}>
                        恢复默认
                    </Button>,
                    <Button key="cancel" onClick={() => setIsPromptModalVisible(false)}>
                        取消
                    </Button>,
                    <Button key="submit" type="primary" onClick={() => {
                        setIsPromptModalVisible(false);
                        message.success('提示词已临时设置，生成时生效');
                    }}>
                        确定
                    </Button>,
                ]}
            >
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">
                        在此修改发送给 AI 的提示词模板。修改后的提示词仅在当前页面本次生成中生效，刷新页面后将恢复系统默认配置。
                    </Text>
                </div>
                <TextArea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    autoSize={{ minRows: 10, maxRows: 20 }}
                    placeholder="请输入提示词模板..."
                />
            </Modal>
        </div>
    );
}

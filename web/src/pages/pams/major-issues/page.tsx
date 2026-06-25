/**
 * @file page.tsx
 * @description PAMS 重大缺陷/重大问题专项列表管理控制页面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useEffect, useState, useRef } from 'react';
import { App, Table, Button, Space, Tag, Input, Select, message, Drawer, Form, Row, Col, Typography, Modal, List, Card, Grid, Tooltip, DatePicker } from 'antd';
import { SearchOutlined, ReloadOutlined, UserOutlined, FilterOutlined, ShareAltOutlined, DeleteOutlined, ExclamationCircleOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';

import { IssueDetailView } from '@/components/IssueDetailView';
import type { ColumnsType } from 'antd/es/table';
import type { Issue, DictItem } from '@/types';
import { toBeijingTime } from '@/lib/timezone';
import dayjs from 'dayjs';
import { useAuth } from '@/components/AuthProvider';
import styles from '../issue-table.module.css';
import { pamsFetch } from '@/lib/api-client';

const { Title, Text } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const fetch = pamsFetch;

// Default colors just in case

// Default colors just in case
const statusColors: Record<string, string> = {
    '提出': 'blue',
    '处理中': 'orange',
    '已查明原因': 'purple',
    '待验证': 'cyan',
    '重现': 'red',
    '已解决': 'green',
};


export default function MajorIssuesPage() {
    const { message, modal } = App.useApp();
    const { user, permissions } = useAuth();
    const screens = useBreakpoint(); // Responsive check

    const [issues, setIssues] = useState<Issue[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [filters, setFilters] = useState<Record<string, string>>({});
    const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [currentIssue, setCurrentIssue] = useState<Issue | null>(null);

    // Initial data fetch
    const [analysisContent, setAnalysisContent] = useState('');
    const [submittingAnalysis, setSubmittingAnalysis] = useState(false);
    const [savingIssue, setSavingIssue] = useState(false);
    const [roundInitialized, setRoundInitialized] = useState(false);





    // Options for Form Autocomplete
    const [userOptions, setUserOptions] = useState<{ label: string, value: string, org: string, contact: string }[]>([]);

    // Options for Filter Autocomplete (Reuse same structure)
    // Options for Filter Autocomplete
    const [trackerOptions, setTrackerOptions] = useState<{ label: string, value: string }[]>([]);
    const [reporterOptions, setReporterOptions] = useState<{ label: string, value: string }[]>([]);
    const [handlerOptions, setHandlerOptions] = useState<{ label: string, value: string }[]>([]);


    // Dictionary Options State
    const [dicts, setDicts] = useState<Record<string, DictItem[]>>({
        issue_status: [],
        issue_category: [],
        issue_detailed_classification: [],
        issue_round: [],
        module: [],
        system: [],
        business_group: [],
        organization: [],
        issue_urgency: [],
        issue_handling_method: [],
    });
    const [releaseStatusOptions, setReleaseStatusOptions] = useState<string[]>([]);

    useEffect(() => {
        // Only fetch issues after round has been initialized
        if (roundInitialized) {
            fetchIssues();
        }
    }, [page, pageSize, filters, roundInitialized]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setPage(1);
    }, [filters]);

    useEffect(() => {
        // Step 1 (Fast Path): Fetch round dict first to unblock issue loading
        fetch('/PAMS/api/dicts?dict_code=issue_round')
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    setDicts(prev => ({ ...prev, issue_round: res.data }));
                }
            })
            .catch(e => console.error('Fast round fetch failed', e));

        // Step 2 (Background): Fetch all dicts for UI labels
        fetchDicts();
        fetchReleaseStatusOptions();
    }, []);

    const fetchReleaseStatusOptions = async () => {
        try {
            const res = await fetch('/PAMS/api/issues/release-status-list');
            const data = await res.json();
            if (data.success) {
                setReleaseStatusOptions(data.data);
            }
        } catch (e) {
            console.error('Failed to fetch release status options', e);
        }
    };

    // Initialize default round
    useEffect(() => {
        if (!roundInitialized && dicts.issue_round.length > 0) {
            const defaultItem = dicts.issue_round.find(d => d.is_default_val === 1);
            if (defaultItem) {
                setFilters(prev => ({ ...prev, round: defaultItem.item_key }));
            }
            setRoundInitialized(true);
        }
    }, [dicts.issue_round, roundInitialized]);

    const fetchDicts = async () => {
        try {
            // Optimization: Fetch all dicts in a single request instead of parallel requests
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




    const fetchIssues = async () => {
        setLoading(true);
        try {
            const cleanFilters = Object.fromEntries(
                Object.entries(filters).filter(([_, v]) => v != null && v !== '')
            );
            const params = new URLSearchParams({
                page: String(page),
                pageSize: String(pageSize),
                is_major: '1',
                ...cleanFilters,
            });
            const res = await fetch(`/PAMS/api/issues?${params}`);
            const data = await res.json();
            if (data.success) {
                setIssues(data.data.items);
                setTotal(data.data.total);
            }
        } catch (error) {
            message.error('获取问题列表失败');
        } finally {
            setLoading(false);
        }
    };





    const handleDeleteIssue = (record: Issue) => {
        modal.confirm({
            title: '确认删除',
            content: `确定要删除问题 ${record.issue_id} 吗？此操作不可恢复。`,
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const res = await fetch(`/PAMS/api/issues/${record.issue_id}`, {
                        method: 'DELETE',
                    });
                    const data = await res.json();
                    if (data.success) {
                        message.success('问题删除成功');
                        fetchIssues();
                    } else {
                        message.error(data.error || '删除失败');
                    }
                } catch {
                    message.error('删除请求失败');
                }
            },
        });
    };

    // Generic User Search for Form
    const handleSearchUser = async (value: string) => {
        if (!value) {
            setUserOptions([]);
            return;
        }
        try {
            const res = await fetch(`/PAMS/api/users?search=${encodeURIComponent(value)}&pageSize=10`);
            const data = await res.json();
            if (data.success) {
                setUserOptions(data.data.items.map((u: any) => ({
                    label: `${u.real_name} (${u.username})`,
                    value: u.username,
                    name: u.real_name,
                    org: u.organization,
                    contact: u.contact
                })));
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Generic User Search for Filters
    // Generic User Search for Filters
    const handleSearchFilterUser = async (value: string, type: 'tracker' | 'reporter' | 'handler') => {
        if (!value) {
            if (type === 'tracker') setTrackerOptions([]);
            if (type === 'reporter') setReporterOptions([]);
            if (type === 'handler') setHandlerOptions([]);
            return;
        }
        try {
            const res = await fetch(`/PAMS/api/users?search=${encodeURIComponent(value)}&pageSize=10`);
            const data = await res.json();
            if (data.success) {
                const options = data.data.items.map((u: any) => ({
                    label: `${u.real_name} (${u.username})`,
                    value: u.username,
                    name: u.real_name,
                }));
                if (type === 'tracker') setTrackerOptions(options);
                if (type === 'reporter') setReporterOptions(options);
                if (type === 'handler') setHandlerOptions(options);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleRowClick = async (record: Issue) => {
        try {
            const res = await fetch(`/PAMS/api/issues/${record.issue_id}`);
            const data = await res.json();
            if (data.success) {
                const fullIssue = data.data;
                setCurrentIssue(fullIssue);
                setDrawerVisible(true);
                setAnalysisContent('');
            } else {
                message.error('获取问题详情失败');
            }
        } catch {
            message.error('获取问题详情失败');
        }
    };

    const handleIssueRefresh = async (issueId: string) => {
        try {
            const res = await fetch(`/PAMS/api/issues/${issueId}`);
            const data = await res.json();
            if (data.success) {
                setCurrentIssue(data.data);
            }
        } catch (error) {
            console.error('Failed to refresh issue:', error);
        }
    };

    const handleUpdateIssue = async (values: any) => {
        if (!currentIssue) return;
        setSavingIssue(true);
        try {

            const payload = { ...values };

            const res = await fetch(`/PAMS/api/issues/${currentIssue.issue_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                message.success('问题更新成功');
                fetchIssues();

                const detailRes = await fetch(`/PAMS/api/issues/${currentIssue.issue_id}`);
                const detailData = await detailRes.json();
                if (detailData.success) {
                    setCurrentIssue(detailData.data);
                }
            } else {
                message.error(data.error || '更新失败');
            }
        } catch {
            message.error('更新失败');
        } finally {
            setSavingIssue(false);
        }
    }







    // --- Helpers ---
    const calculateDuration = (created: string, resolved: string | null) => {
        const start = dayjs(created);
        const end = resolved ? dayjs(resolved) : dayjs();
        const diffInDays = end.diff(start, 'day', true);
        return diffInDays.toFixed(0);
    };

    const calculateOverdue = (plan: string | null, resolved: string | null) => {
        if (!plan) return '-';
        const target = dayjs(plan);
        const now = resolved ? dayjs(resolved) : dayjs();

        // If Now + 1 day <= plan_fix_time, not overdue yet
        const nowPlus1Day = dayjs().add(1, 'day');
        if (nowPlus1Day.valueOf() <= target.valueOf()) return '-';

        // Calculate (Now - 1 day) - plan_fix_time
        const nowMinus1Day = now.subtract(1, 'day');
        const diff = nowMinus1Day.diff(target, 'day', true);
        if (diff <= 0) return '-';
        return diff.toFixed(0);
    };

    const handleAddAnalysis = async (content: string, handlerInfo?: { name: string, org: string, contact: string }) => {
        if (!content.trim() || !currentIssue) return;

        setSubmittingAnalysis(true);
        try {
            const res = await fetch(`/PAMS/api/issues/${currentIssue.issue_id}/analysis`, {
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

                const detailRes = await fetch(`/PAMS/api/issues/${currentIssue.issue_id}`);
                const detailData = await detailRes.json();
                if (detailData.success) {
                    setCurrentIssue(detailData.data);
                }
                fetchIssues(); // Refresh list background
            } else {
                message.error(data.error);
            }
        } catch {
            message.error('添加分析日志失败');
        } finally {
            setSubmittingAnalysis(false);
        }
    };

    const columns: ColumnsType<Issue> = [
        {
            title: '问题编号',
            dataIndex: 'issue_id',
            key: 'issue_id',
            width: 120,
            align: 'center',
            render: (text, record) => {
                const isLong = text && text.length > 14;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: '1.4', alignItems: 'center' }}>
                        <span
                            className={styles.issueIdText}
                            style={isLong ? { fontSize: text.length > 17 ? '9px' : '10px' } : {}}
                            title={text}
                        >
                            {text}
                        </span>
                        {record.work_order_no && (
                            <span style={{ fontSize: '9px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingBottom: '1px', maxWidth: '110px' }} title={record.work_order_no}>
                                {record.work_order_no}
                            </span>
                        )}
                    </div>
                );
            }
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 75, // Reduced from 85
            align: 'center',
            render: (status: string) => {
                let badgeClass = '';
                if (status === '处理中') badgeClass = styles.statusProcessing;
                else if (status === '已解决') badgeClass = styles.statusSolved;
                else if (status === '待验证') badgeClass = styles.statusVerify;
                else if (status === '重现') badgeClass = styles.statusReproduce;
                else if (status === '已查明原因') badgeClass = styles.statusFound;
                else badgeClass = '';

                return (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <div className={`${styles.statusBadge} ${badgeClass}`}>
                            <span className={styles.statusBadgeDot}></span>
                            {status}
                        </div>
                    </div>
                );
            },
        },
        {
            title: '紧急程度',
            dataIndex: 'urgency',
            key: 'urgency',
            width: 70,
            align: 'center',
            render: (text: string) => {
                let color = 'default';
                if (text === '高') color = 'red';
                else if (text === '中') color = 'orange';
                else if (text === '低') color = 'green';
                return (
                    <Tag color={color} style={{ margin: 0 }}>
                        {text || '中'}
                    </Tag>
                );
            }
        },
        {
            title: '处理方式',
            dataIndex: 'handling_method',
            key: 'handling_method',
            width: 70,
            align: 'center',
            render: (text: string) => (
                <Tag color="processing" style={{ margin: 0 }}>
                    {text || '其它'}
                </Tag>
            )
        },
        {
            title: '问题分类',
            dataIndex: 'category',
            key: 'category',
            width: 80,
            align: 'center',
            render: (_: any, record: Issue) => {
                let tagClass = styles.tagDefault;
                const catName = record.category || '';
                if (catName.includes('金科技术') || catName === '金科') tagClass = styles.tagBlue;
                else if (catName.includes('农信技术')) tagClass = styles.tagOrange;
                else if (catName.includes('农信业务')) tagClass = styles.tagRed;

                return (
                    <span className={`${styles.categoryTag} ${tagClass}`}>
                        {record.category || '-'}
                    </span>
                );
            }
        },
        {
            title: '详细分类',
            dataIndex: 'detailed_classification',
            key: 'detailed_classification',
            width: 100,
            align: 'center',
            render: (text: string) => <span className={styles.valuePrimary} style={{ fontSize: 12 }}>{text || '-'}</span>
        },
        {
            title: <div style={{ textAlign: 'center' }}>问题概述</div>,
            dataIndex: 'summary',
            key: 'summary',
            width: 230, // Increased from 120
            render: (text: string) => <div className="ellipsis-2" style={{ fontWeight: 500 }}>{text}</div>,
        },

        {
            title: <div style={{ textAlign: 'center' }}>所属系统</div>,
            dataIndex: 'system',
            key: 'system',
            width: 100, // Reduced from 110
            render: (_: any, record: Issue) => {
                const sysName = dicts.system.find(d => d.item_key === record.system)?.item_value || record.system || '-';
                const modName = dicts.module.find(d => d.item_key === record.module)?.item_value || record.module;
                const bgName = dicts.business_group.find(d => d.item_key === record.business_group)?.item_value || record.business_group;
                return (
                    <div>
                        <div className={styles.systemName} title={`${record.system}-${sysName}`} style={{ fontSize: 12 }}>{sysName}</div>
                        <div className={styles.valueSecondary} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {bgName && <span className={styles.tagGray}>{bgName}</span>}
                            {modName && <span className={styles.tagGray}>{modName}</span>}
                        </div>
                    </div>
                );
            }
        },
        {
            title: <div style={{ textAlign: 'center' }}>人员信息(报障人 处理人 跟踪人)</div>,
            key: 'people',
            width: 210, // Reduced by 35% from 320
            render: (_: any, record: Issue) => {
                const renderPersonSlot = (name: string | null, org: string | null) => {
                    if (!name) return <div />; // Empty slot
                    const orgName = dicts.organization.find(d => d.item_key === org)?.item_value || org;
                    return (
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            <span className={styles.personName} style={{ flexGrow: 0, flexShrink: 0, textAlign: 'left' }}>{name}</span>
                            {/* Org might be hidden or very small at this width, maybe tooltip? kept as is for now as per request */}
                            {orgName && <span className={styles.orgTag} style={{ flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', transform: 'scale(0.85)', transformOrigin: 'left center', marginLeft: 0, minWidth: 0 }}>{orgName}</span>}
                        </div>
                    );
                };

                return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                        {renderPersonSlot(record.reporter_name, record.reporter_org)}
                        {renderPersonSlot(record.handler_name, record.handler_org)}
                        {renderPersonSlot(record.tracker_name, record.tracker_org)}
                    </div>
                );
            }
        },
        {
            title: '更新时间',
            key: 'last_update_time',
            width: 100,
            align: 'center',
            sorter: (a: Issue, b: Issue) => {
                const getLatestTime = (record: Issue) => {
                    const logs = record.analysis_log;
                    const latest = logs && logs.length > 0 ? logs[logs.length - 1] : null;
                    const time = (latest && latest.time) ? latest.time : record.create_time;
                    return time ? dayjs(time).valueOf() : 0;
                };
                return getLatestTime(a) - getLatestTime(b);
            },
            render: (_: any, record: Issue) => {
                const logs = record.analysis_log;
                const latest = logs && logs.length > 0 ? logs[logs.length - 1] : null;
                const timeToFormat = (latest && latest.time) ? latest.time : record.create_time;
                if (!timeToFormat) return '-';
                return (
                    <span style={{ fontSize: 11 }}>
                        {dayjs(timeToFormat).format('M-D HH:mm')}
                    </span>
                );
            }
        },
        {
            title: '处理/超期天数',
            key: 'duration',
            width: 100, // Reduced from 110
            render: (_: any, record: Issue) => {
                if (record.status === '已解决') return null;
                return (
                    <div style={{ fontSize: 11, textAlign: 'center' }}>
                        {calculateDuration(record.create_time, record.resolve_time)} / <span style={{ color: calculateOverdue(record.plan_fix_time, record.resolve_time) !== '-' ? '#ef4444' : 'inherit' }}>{calculateOverdue(record.plan_fix_time, record.resolve_time)}</span>
                    </div>
                );
            },
        },
        {
            title: '操作',
            key: 'action',
            width: 65, // Reduced from 70
            fixed: 'right',
            render: (_, record) => (
                <Space size={2}>

                    <Tooltip title="分享">
                        <Button
                            type="text"
                            size="small"
                            icon={<ShareAltOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                const url = window.location.origin + '/#/pams/issues/' + record.issue_id;
                                navigator.clipboard.writeText(url);
                                message.success('分享链接已复制');
                            }}
                        />
                    </Tooltip>
                    {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.username === 'admin') && (
                        <Tooltip title="删除">
                            <Button
                                type="text"
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteIssue(record);
                                }}
                            />
                        </Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            {/* Filter Bar */}
            <div style={{
                background: 'var(--radar-surface)',
                borderRadius: 0,
                border: '1px solid var(--radar-border)',
                marginBottom: 16,
                overflow: 'hidden',
                boxShadow: 'var(--radar-card-shadow)'
            }}>
                {/* Always-visible search row */}
                <div style={{
                    padding: screens.xs ? '10px 12px' : '12px 16px',
                    background: 'var(--radar-primary-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    borderBottom: moreFiltersOpen ? '1px solid var(--radar-border)' : 'none',
                }}>
                    <FilterOutlined style={{ color: 'var(--radar-primary)', fontSize: 15, flexShrink: 0 }} />
                    <Input
                        prefix={<SearchOutlined style={{ color: '#adb5cc' }} />}
                        placeholder="问题/工单编号"
                        allowClear
                        style={{ width: screens.md ? 200 : 140, borderRadius: 0 }}
                        value={filters.issue_id_or_no}
                        onChange={(e) => setFilters(prev => {
                            const { issue_id, work_order_no, ...rest } = prev;
                            return { ...rest, issue_id_or_no: e.target.value };
                        })}
                    />
                    <Input.Search
                        placeholder="搜索概述/描述/分析记录"
                        style={{ width: screens.md ? 200 : 140, borderRadius: 0 }}
                        onSearch={(value) => setFilters(prev => ({ ...prev, q: value }))}
                        allowClear
                    />

                    <Button
                        type="text"
                        size="small"
                        onClick={() => setMoreFiltersOpen(v => !v)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            color: moreFiltersOpen ? 'var(--radar-primary)' : 'var(--radar-text-secondary)',
                            fontWeight: 500,
                            fontSize: 13,
                            padding: '4px 10px',
                            borderRadius: 0,
                            background: moreFiltersOpen ? 'var(--radar-primary-soft)' : 'transparent',
                            border: `1px solid ${moreFiltersOpen ? 'var(--radar-primary-fade)' : 'transparent'}`,
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap',
                            marginLeft: 'auto',
                        }}
                    >
                        {(() => {
                            const extraCount = [
                                filters.round, filters.plan_fix_time, filters.status, filters.urgency,
                                filters.handling_method, filters.category, filters.detailed_classification,
                                filters.system, filters.business_group, filters.tracker_contact,
                                filters.reporter_contact, filters.handler_contact, filters.version_number,
                                filters.release_status
                            ].filter(Boolean).length;
                            return (
                                <>
                                    更多筛选{extraCount > 0 && <span style={{
                                        background: '#adb5bd', color: '#fff',
                                        borderRadius: 0, fontSize: 11,
                                        padding: '0 6px', lineHeight: '18px',
                                        marginLeft: 2
                                    }}>{extraCount}</span>}
                                    {moreFiltersOpen
                                        ? <UpOutlined style={{ fontSize: 10, marginLeft: 2 }} />
                                        : <DownOutlined style={{ fontSize: 10, marginLeft: 2 }} />}
                                </>
                            );
                        })()}
                    </Button>
                </div>

                {/* Collapsible extra filters */}
                <div style={{
                    maxHeight: moreFiltersOpen ? '400px' : '0',
                    overflow: 'hidden',
                    transition: 'max-height 0.3s ease',
                }}>
                    <div style={{
                        padding: screens.xs ? '10px 12px 14px' : '12px 16px 16px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        alignItems: 'center',
                    }}>
                        <Select
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="问题轮次"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            onChange={(value) => setFilters(prev => ({ ...prev, round: value }))}
                            value={filters.round}
                        >
                            {dicts.issue_round.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <DatePicker
                            multiple
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="计划解决时间"
                            allowClear
                            onChange={(dates) => {
                                const values = dates ? dates.map(d => d.format('YYYY-MM-DD')).join(',') : '';
                                setFilters(prev => ({ ...prev, plan_fix_time: values }));
                            }}
                        />
                        <Select
                            mode="multiple"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="状态"
                            allowClear
                            maxTagCount="responsive"
                            onChange={(values) => {
                                const newFilters = { ...filters };
                                if (values.length > 0) {
                                    newFilters.status = values.join(',');
                                } else {
                                    delete newFilters.status;
                                }
                                setFilters(newFilters);
                            }}
                            value={filters.status ? filters.status.split(',') : []}
                        >
                            {dicts.issue_status.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="紧急程度"
                            allowClear
                            onChange={(values) => setFilters(prev => ({ ...prev, urgency: values.join(',') }))}
                            value={filters.urgency ? filters.urgency.split(',') : []}
                        >
                            {dicts.issue_urgency?.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="处理方式"
                            allowClear
                            onChange={(values) => setFilters(prev => ({ ...prev, handling_method: values.join(',') }))}
                            value={filters.handling_method ? filters.handling_method.split(',') : []}
                        >
                            {dicts.issue_handling_method?.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="问题分类"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            onChange={(values) => setFilters(prev => ({ ...prev, category: values.join(',') }))}
                            value={filters.category ? filters.category.split(',') : []}
                        >
                            {dicts.issue_category.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="详细分类"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            onChange={(values) => setFilters(prev => ({ ...prev, detailed_classification: values.join(',') }))}
                            value={filters.detailed_classification ? filters.detailed_classification.split(',') : []}
                        >
                            {dicts.issue_detailed_classification?.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="所属系统"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            onChange={(values) => setFilters(prev => ({ ...prev, system: values.join(',') }))}
                            value={filters.system ? filters.system.split(',') : []}
                        >
                            {dicts.system.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{`${item.item_key}-${item.item_value}`}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="所属实施机构"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            onChange={(values) => setFilters(prev => ({ ...prev, business_group: values.join(',') }))}
                            value={filters.business_group ? filters.business_group.split(',') : []}
                        >
                            {dicts.business_group.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            showSearch
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="跟踪人"
                            allowClear
                            filterOption={false}
                            onSearch={(val) => handleSearchFilterUser(val, 'tracker')}
                            onChange={(value) => setFilters(prev => ({ ...prev, tracker_name: '', tracker_contact: value }))}
                            options={trackerOptions}
                            notFoundContent={null}
                        />
                        <Select
                            showSearch
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="报障人"
                            allowClear
                            filterOption={false}
                            onSearch={(val) => handleSearchFilterUser(val, 'reporter')}
                            onChange={(value) => setFilters(prev => ({ ...prev, reporter_name: '', reporter_contact: value }))}
                            options={reporterOptions}
                            notFoundContent={null}
                        />
                        <Select
                            showSearch
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="处理人"
                            allowClear
                            filterOption={false}
                            onSearch={(val) => handleSearchFilterUser(val, 'handler')}
                            onChange={(value) => setFilters(prev => ({ ...prev, handler_name: '', handler_contact: value }))}
                            options={handlerOptions}
                            notFoundContent={null}
                        />
                        <Select
                            mode="tags"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="版本编号"
                            allowClear
                            onChange={(values) => setFilters(prev => ({ ...prev, version_number: values.join(',') }))}
                            value={filters.version_number ? filters.version_number.split(',') : []}
                        >
                            <Select.Option value="未填写">未填写 (空值)</Select.Option>
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="发版情况"
                            allowClear
                            showSearch
                            onChange={(values) => setFilters(prev => ({ ...prev, release_status: values.join(',') }))}
                            value={filters.release_status ? filters.release_status.split(',') : []}
                        >
                            <Select.Option value="未填写">未填写 (空值)</Select.Option>
                            {releaseStatusOptions.map(opt => (
                                <Select.Option key={opt} value={opt}>{opt}</Select.Option>
                            ))}
                        </Select>
                    </div>
                </div>
            </div>

            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button icon={<ReloadOutlined />} onClick={fetchIssues}>
                    {screens.xs ? null : '刷新'}
                </Button>
            </div>

            {/* Responsive List/Table */}
            {
                screens.xs || (screens.sm && !screens.md) ? (
                    <List
                        grid={{ gutter: 16, column: 1 }}
                        dataSource={issues}
                        pagination={{
                            current: page,
                            pageSize,
                            total,
                            onChange: (p, ps) => { setPage(p); setPageSize(ps); }
                        }}
                        renderItem={item => {
                            const systemInfo = dicts.system.find(d => d.item_key === item.system);
                            const sysName = systemInfo?.item_value || item.system || '-';
                            const moduleDisplay = dicts.module.find(d => d.item_key === item.module)?.item_value;
                            const bgDisplay = dicts.business_group.find(d => d.item_key === item.business_group)?.item_value;
                            const handlerOrg = item.handler_org ? (dicts.organization.find(d => d.item_key === item.handler_org)?.item_value || item.handler_org) : null;

                            return (
                                <List.Item onClick={() => handleRowClick(item)} style={{ cursor: 'pointer', padding: '0' }}>
                                    <Card
                                        size="small"
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span
                                                        className={styles.issueIdMain}
                                                        title={item.issue_id}
                                                        style={item.issue_id && item.issue_id.length > 14 ? { fontSize: item.issue_id.length > 17 ? '0.75rem' : '0.85rem' } : {}}
                                                    >
                                                        {item.issue_id}
                                                    </span>
                                                    {item.work_order_no && (
                                                        <div style={{ fontSize: '10px', color: '#8c8c8c', lineHeight: '1.4', paddingBottom: '1px' }}>
                                                            {item.work_order_no}
                                                        </div>
                                                    )}
                                                </div>
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
                                            <Space size={4}>
                                                <Text type="secondary" style={{ fontSize: 12 }}>{toBeijingTime(item.create_time, 'MM-DD HH:mm')}</Text>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<ShareAltOutlined />}
                                                    style={{ padding: '0 4px' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const url = window.location.origin + '/#/pams/issues/' + item.issue_id;
                                                        navigator.clipboard.writeText(url);
                                                        message.success('分享链接已复制到剪贴板');
                                                    }}
                                                />
                                                {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.username === 'admin') && (
                                                    <Button
                                                        type="text"
                                                        danger
                                                        size="small"
                                                        icon={<DeleteOutlined />}
                                                        style={{ padding: '0 4px' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteIssue(item);
                                                        }}
                                                    />
                                                )}
                                            </Space>
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
                        columns={columns}
                        dataSource={issues}
                        rowKey="issue_id"
                        loading={loading}
                        pagination={{
                            current: page,
                            pageSize,
                            total,
                            showSizeChanger: true,
                            showQuickJumper: true,
                            onChange: (p, ps) => { setPage(p); setPageSize(ps); }
                        }}
                        onRow={(record) => ({
                            onClick: () => handleRowClick(record),
                            style: { cursor: 'pointer' },
                        })}
                        size="small"
                        scroll={{ x: 1000 }} // Enable horizontal scroll for many columns
                    />
                )
            }

            {/* Detail Drawer - Reuse the same component */}
            <Drawer
                title="问题详情"
                placement="right"
                onClose={() => setDrawerVisible(false)}
                open={drawerVisible}
                maskClosable={false}
                destroyOnHidden={true}
                styles={{ body: { padding: 0 }, wrapper: { width: screens.xs ? '100%' : '1000px', maxWidth: '100vw' } }}
            >
                {currentIssue && (
                    <IssueDetailView
                        issueId={currentIssue.issue_id}
                        dicts={dicts}
                        user={user}
                        onRefresh={() => {
                            fetchIssues();
                            handleIssueRefresh(currentIssue.issue_id);
                        }}
                    />
                )}
            </Drawer>
        </div>
    );
}

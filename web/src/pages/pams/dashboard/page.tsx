/**
 * @file page.tsx
 * @description PAMS 多维度问题统计仪表盘与 ECharts 可视化图表页面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dayjs from 'dayjs';
import { App, Row, Col, Card, Spin, Radio, Modal, Table, message, Descriptions, Drawer, Button as AntButton, Space as AntSpace, Select, Grid, Typography, List, Tooltip, Empty, Popconfirm } from 'antd';
import styles from '../issue-table.module.css';
import { toBeijingTime } from '@/lib/timezone';
import { useAuth } from '@/components/AuthProvider';
import { IssueDetailView } from '@/components/IssueDetailView';
import { pamsFetch } from '@/lib/api-client';
import { useAppStore } from '@/stores/app';
import type { Issue, DictItem } from '@/types';
import {
    FileTextOutlined, CheckCircleOutlined, ClockCircleOutlined,
    BankOutlined, AppstoreOutlined, TeamOutlined, SaveOutlined, ShareAltOutlined,
    BulbOutlined, SettingOutlined, ExclamationCircleOutlined, StarOutlined, ThunderboltOutlined,
    PlusOutlined, DeleteOutlined, EllipsisOutlined,
    ArrowLeftOutlined, ArrowRightOutlined, SyncOutlined,
    UserOutlined, ProjectOutlined, NotificationOutlined, SafetyCertificateOutlined,
    DashboardOutlined, LineChartOutlined, BarChartOutlined, PieChartOutlined,
    BugOutlined, QuestionCircleOutlined, InfoCircleOutlined, MessageOutlined,
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
    FireOutlined, SoundOutlined, SearchOutlined
} from '@ant-design/icons';
import EditOutlined from '@ant-design/icons/EditOutlined';
import ReactECharts from 'echarts-for-react';
import type { DashboardConfig, BoardColumnDef, BoardRowDef, ChartConfig, DashboardSection, ChartDimension, ChartGroupDef } from './dashboardConfig';
import {
    DEFAULT_DASHBOARD_CONFIG,
    migrateConfig,
    computeBoardCellValue,
    getBoardCellQueryParams,
    DIMENSION_OPTIONS
} from './dashboardConfig';
import DashboardConfigDrawer from './DashboardConfigDrawer';
import ChartEditor from './ChartEditor';
import DashboardConfigModal from './DashboardConfigModal';

const fetch = pamsFetch;

// Icon map for dynamic rendering
const ICON_MAP: Record<string, React.ReactNode> = {
    FileTextOutlined: <FileTextOutlined />,
    CheckCircleOutlined: <CheckCircleOutlined />,
    ClockCircleOutlined: <ClockCircleOutlined />,
    BankOutlined: <BankOutlined />,
    AppstoreOutlined: <AppstoreOutlined />,
    TeamOutlined: <TeamOutlined />,
    BulbOutlined: <BulbOutlined />,
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

interface CategoryGroupStats {
    total: number;
    resolved: number;
    unresolved: number;
}

interface Stats {
    total: number;
    pending: number;
    resolved: number;
    major: number;
    categoryGroups: Record<string, CategoryGroupStats>;
    categoryGroupByStatus: { category_group: string; status: string; count: number }[];
    byCategoryGroup: { name: string; value: number }[];
    byJinkeDetailedClass: { name: string; value: number }[];
    byNongxinDetailedClass: { name: string; value: number }[];
    byCombinedDetailedClass: { name: string; value: number }[];
    byJinkeBusinessGroup: { name: string; value: number }[];
    byJinkeModule: { name: string; value: number }[];
    byUrgency: { name: string; value: number }[];
    byHandlingMethod: { name: string; value: number }[];
    businessGroupDetail: any[];
    businessGroupStackedStats: { name: string; category_group: string; value: number }[];
    moduleStackedStats: { name: string; category_group: string; value: number }[];
}

const getDisplayLabel = (val: string, dim: string, dicts: Record<string, any[]>) => {
    if (!val || val === '总计' || val === '合计' || val === '汇总') return val;
    const dictCodeMap: Record<string, string> = {
        business_group: 'business_group',
        module: 'module',
        system: 'system',
        round: 'issue_round',
        status: 'issue_status',
        urgency: 'issue_urgency',
        handling_method: 'issue_handling_method',
        category: 'issue_category',
        detailed_classification: 'issue_detailed_classification'
    };
    const dictCode = dictCodeMap[dim];
    let result = dictCode ? (dicts[dictCode]?.find((d: any) => d.item_key === val)?.item_value || val) : val;

    // Format date as MMDD
    if (dim === 'created_at_day' && result.length >= 10) {
        result = result.substring(5, 7) + result.substring(8, 10);
    }
    return result;
};

type StatusFilter = string[]; // Stores multiple row IDs

const { useBreakpoint } = Grid;
const { Text } = Typography;

const getDatesInRange = (start: string, end: string) => {
    const dates: string[] = [];
    let curr = dayjs(start);
    const stop = dayjs(end);
    while (curr.isBefore(stop) || curr.isSame(stop, 'day')) {
        dates.push(curr.format('YYYY-MM-DD'));
        curr = curr.add(1, 'day');
    }
    return dates;
};

const cssVar = (name: string, fallback: string) => {
    if (typeof window === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

interface DashboardChartProps {
    chart: ChartConfig;
    baseFilters: Record<string, any>;
    isEditable: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onMove?: (direction: 'left' | 'right') => void;
    isFirst?: boolean;
    isLast?: boolean;
    onChartClick: (params: any, type: ChartDimension, extraFilters?: Record<string, any>, xAxisDim?: ChartDimension, groups?: ChartGroupDef[], xAxisGroups?: ChartGroupDef[]) => void;
    renderTable: (title: string, data: any[], type: ChartDimension, xAxisDim?: ChartDimension, filters?: Record<string, any>, groups?: ChartGroupDef[], xAxisGroups?: ChartGroupDef[]) => React.ReactNode;
    dicts: Record<string, any[]>;
    forcedHeight?: number;
}

const DashboardChartComponent: React.FC<DashboardChartProps> = React.memo(({
    chart, baseFilters, isEditable, onEdit, onDelete, onMove, isFirst, isLast, onChartClick, renderTable, dicts, forcedHeight
}) => {
    const [data, setData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const screens = useBreakpoint();
    const themeMode = useAppStore((s) => s.theme);
    const preset = useAppStore((s) => s.preset);
    const [themeTick, setThemeTick] = useState(0);
    useEffect(() => {
        const timer = window.setTimeout(() => setThemeTick((tick) => tick + 1), 0);
        return () => window.clearTimeout(timer);
    }, [themeMode, preset]);
    const themeColors = useMemo(() => ({
        ink: cssVar('--radar-ink', themeMode === 'dark' ? '#e6e8ef' : '#1e2330'),
        muted: cssVar('--radar-text-secondary', themeMode === 'dark' ? '#9aa3b2' : '#64748b'),
        border: cssVar('--radar-border', themeMode === 'dark' ? '#303848' : '#d8dee9'),
        surface: cssVar('--radar-surface', themeMode === 'dark' ? '#111827' : '#ffffff'),
        bg: cssVar('--radar-bg', themeMode === 'dark' ? '#0b1220' : '#f4f6fb'),
        primary: cssVar('--radar-primary', '#1677ff'),
        accent: cssVar('--radar-accent', '#13c2c2'),
        success: cssVar('--radar-status-final', '#52c41a'),
        warning: cssVar('--radar-status-in-progress', '#faad14'),
    }), [themeMode, preset, themeTick]);

    useEffect(() => {
        const fetchChartData = async () => {
            try {
                setLoading(true);
                // Merge base filters (from global dashboard) with local chart filters
                const combinedFilters = { ...baseFilters, ...(chart.filters || {}) };

                const res = await fetch('/PAMS/api/stats/chart', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        dimension: chart.dimension,
                        xAxisDimension: chart.xAxisDimension,
                        filters: combinedFilters,
                        groups: chart.groups,
                        xAxisGroups: chart.xAxisGroups
                    })
                });
                const json = await res.json();
                if (json.success) {
                    setData(json.data);
                }
            } catch (error) {
                console.error('Fetch chart data error:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchChartData();
    }, [chart, baseFilters]);

    const processedData = useMemo(() => {
        if (!data) return [];

        const isPrimaryDate = chart.dimension === 'created_at_day';
        const isSecondaryDate = chart.xAxisDimension === 'created_at_day';

        if (!isPrimaryDate && !isSecondaryDate) return data;

        // Get effective date range from filters or data
        const dateFilter = (chart.filters?.['created_at_day']) || (baseFilters?.['created_at_day']);
        let allDates: string[] = [];

        if (dateFilter && Array.isArray(dateFilter) && dateFilter.length === 2) {
            allDates = getDatesInRange(dateFilter[0], dateFilter[1]);
        } else if (data.length > 0) {
            const existingDates = data.map(i => isPrimaryDate ? (i.name_y || i.name) : i.name_x).filter(Boolean);
            if (existingDates.length > 0) {
                existingDates.sort();
                allDates = getDatesInRange(existingDates[0], existingDates[existingDates.length - 1]);
            }
        }

        if (allDates.length === 0) return data;

        if (!chart.xAxisDimension) {
            // 1D Chart: { name: string, value: number, parent_y?: string, parent_y_2?: string }
            const dateFilter = (chart.filters?.['created_at_day']) || (baseFilters?.['created_at_day']);
            if (isPrimaryDate) {
                const dataMap = new Map(data.map(i => [i.name, i.value]));
                return allDates.map(d => ({
                    name: d,
                    value: dataMap.get(d) || 0
                }));
            }
            return data;
        } else {
            // 2D Chart: { name_x: string, name_y: string, value: number }
            if (isPrimaryDate) {
                // name_y is date
                const stackNames = Array.from(new Set(data.map(i => i.name_x))).filter(Boolean);
                if (stackNames.length === 0) {
                    const groupLabels = chart.xAxisGroups?.map(g => g.label) || [];
                    if (groupLabels.length > 0) {
                        const newData: any[] = [];
                        allDates.forEach(d => groupLabels.forEach(s => newData.push({ name_y: d, name_x: s, value: 0 })));
                        return newData;
                    }
                    return allDates.map(d => ({ name_y: d, name_x: '无数据', value: 0 }));
                }
                const newData: any[] = [];
                allDates.forEach(date => {
                    stackNames.forEach(stack => {
                        const item = data.find(i => i.name_y === date && i.name_x === stack);
                        newData.push(item || { name_x: stack, name_y: date, value: 0 });
                    });
                });
                return newData;
            } else {
                // name_x is date
                const catNames = Array.from(new Set(data.map(i => i.name_y))).filter(Boolean);
                if (catNames.length === 0) {
                    const groupLabels = chart.groups?.map(g => g.label) || [];
                    if (groupLabels.length > 0) {
                        const newData: any[] = [];
                        catNames.forEach(c => allDates.forEach(d => newData.push({ name_x: d, name_y: c, value: 0 })));
                        return newData;
                    }
                    return allDates.map(d => ({ name_x: d, name_y: '无数据', value: 0 }));
                }
                const newData: any[] = [];
                catNames.forEach(cat => {
                    allDates.forEach(date => {
                        const item = data.find(i => i.name_x === date && i.name_y === cat);
                        newData.push(item || { name_x: date, name_y: cat, value: 0 });
                    });
                });
                return newData;
            }
        }
    }, [data, chart, baseFilters]);

    // Build ECharts option
    let option: any = {};
    const isPie = chart.chartType === 'pie';
    const isBar = chart.chartType === 'bar';
    const isHBar = chart.chartType === 'horizontal_bar';
    const isStackedBar = chart.chartType === 'stacked_bar';
    const isStackedBarH = chart.chartType === 'stacked_bar_horizontal';
    const isLine = chart.chartType === 'line';
    const isArea = chart.chartType === 'area';
    const isLineType = isLine || isArea;
    const isTable = chart.chartType === 'table';

    const colorMap: Record<string, string> = {
        '其它': 'rgba(140, 140, 140, 0.6)',
        '未分类': 'rgba(140, 140, 140, 0.6)',
        '高': '#dc2626', '中': themeColors.warning, '低': themeColors.success,
        '紧急': '#dc2626', '重要': themeColors.warning, '一般': themeColors.success,
    };

    const DEFAULT_CHART_COLOR = themeColors.primary;

    const baseChartOption = {
        backgroundColor: 'transparent',
        textStyle: { color: themeColors.ink },
        tooltip: {
            backgroundColor: themeColors.surface,
            borderColor: themeColors.border,
            textStyle: { color: themeColors.ink },
        },
        legend: { textStyle: { color: themeColors.muted, fontSize: 10 } },
    };

    const valueAxisTheme = {
        axisLabel: { color: themeColors.muted, fontSize: 10 },
        axisLine: { lineStyle: { color: themeColors.border } },
        axisTick: { lineStyle: { color: themeColors.border } },
        splitLine: { lineStyle: { color: themeColors.border, type: 'dashed' } },
    };

    const categoryAxisTheme = {
        axisLabel: { color: themeColors.muted, fontSize: 10 },
        axisLine: { lineStyle: { color: themeColors.border } },
        axisTick: { lineStyle: { color: themeColors.border } },
        splitLine: { lineStyle: { color: themeColors.border, type: 'dashed' } },
    };

    const getChartColor = (name: string) => {
        // 1. Try matching the specific item name in groups
        let matched = chart.groups?.find(g => g.values.includes(name) || g.label === name);
        if (matched?.color) return matched.color;

        // 2. Try dimension-level fallback (where value matches the dimension code itself)
        matched = chart.groups?.find(g => g.values.includes(chart.dimension));
        if (matched?.color) return matched.color;

        if (colorMap[name]) return colorMap[name];
        return undefined;
    };

    const generateGradient = (baseColor: string, isHorizontal = false) => {
        if (!baseColor) return undefined;

        // Robust color conversion to handle Hex, RGB, and RGBA
        let lighter = baseColor;
        const alpha = 0.6;

        if (baseColor.startsWith('rgba')) {
            lighter = baseColor.replace(/[\d.]+\)$/, `${alpha})`);
        } else if (baseColor.startsWith('rgb')) {
            lighter = baseColor.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
        } else if (baseColor.startsWith('#')) {
            // Hex parsing
            const hex = baseColor.replace('#', '');
            let r, g, b;
            if (hex.length === 3) {
                r = parseInt(hex[0] + hex[0], 16);
                g = parseInt(hex[1] + hex[1], 16);
                b = parseInt(hex[2] + hex[2], 16);
            } else {
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
            }
            lighter = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        } else {
            // Fallback for named colors or others
            lighter = baseColor;
        }

        return {
            type: 'linear',
            x: 0, y: isHorizontal ? 0 : 1,
            x2: isHorizontal ? 1 : 0,
            y2: 0,
            global: false,
            colorStops: [
                { offset: 0, color: baseColor },
                { offset: 1, color: lighter }
            ]
        };
    };

    const formatXAxisLabel = (value: string, dim: string) => {
        if (!value) return value;
        if (dim === 'created_at_day' && value.length === 4) {
            return value.substring(0, 2) + '\n' + value.substring(2);
        }
        if (dim === 'business_group' && !isHBar) {
            return value.split('').join('\n');
        }
        return value;
    };

    if (isPie) {
        option = {
            tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
            legend: { bottom: 0, left: 'center', type: 'scroll', padding: [2, 10], itemGap: 5, textStyle: { fontSize: 10 } },
            series: [{
                type: 'pie',
                radius: screens.xs ? ['40%', '70%'] : ['50%', '80%'],
                center: ['50%', '48%'],
                avoidLabelOverlap: true,
                itemStyle: { borderRadius: 0, borderColor: themeColors.surface, borderWidth: 1 },
                label: { show: !screens.xs, formatter: '{b}: {c}', fontSize: 10 },
                data: (processedData || []).map((item: any) => {
                    const label = getDisplayLabel(item.name, chart.dimension, dicts);
                    const color = getChartColor(item.name) || getChartColor(label) || DEFAULT_CHART_COLOR;
                    return {
                        ...item,
                        name: label,
                        originalName: item.name,
                        itemStyle: { color: generateGradient(color) }
                    };
                }),
            }],
        };
    } else if (isStackedBar || isStackedBarH || ((isLine || isArea) && chart.xAxisDimension)) {
        const xAxisDim = chart.xAxisDimension;

        const primaryDim = chart.dimension;
        const secondaryDim = xAxisDim;

        const categories = Array.from(new Set(processedData.map(i => i.name_y))).filter(n => n !== undefined);
        const stackItems = Array.from(new Set(processedData.map(i => i.name_x))).filter(n => n !== undefined);

        // For lines/areas, if it's Round or Date dimension, we don't necessarily want to sort by value
        const shouldSortByValue = primaryDim !== 'round' && primaryDim !== 'created_at_day';

        let sortedCategories: string[];
        if (shouldSortByValue) {
            const catTotals = categories.map(cat => {
                const total = processedData.filter(i => i.name_y === cat).reduce((sum, i) => sum + i.value, 0);
                return { cat, total };
            }).sort((a, b) => b.total - a.total);
            sortedCategories = catTotals.map(t => t.cat);
        } else if (primaryDim === 'created_at_day' && chart.groups && chart.groups.length > 0) {
            // Sort by groups order
            const groupOrder = chart.groups.map(g => g.label);
            sortedCategories = [...categories].sort((a, b) => {
                const labelA = getDisplayLabel(a, primaryDim, dicts);
                const labelB = getDisplayLabel(b, primaryDim, dicts);
                const idxA = groupOrder.indexOf(labelA);
                const idxB = groupOrder.indexOf(labelB);
                if (idxA === -1 && idxB === -1) return a.localeCompare(b);
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        } else {
            // Keep original order (usually chronological for rounds/dates due to processedData)
            sortedCategories = [...categories];
        }

        const sortedStacks = [...stackItems];
        if (secondaryDim === 'created_at_day' && chart.xAxisGroups && chart.xAxisGroups.length > 0) {
            const groupOrder = chart.xAxisGroups.map(g => g.label);
            sortedStacks.sort((a, b) => {
                const labelA = getDisplayLabel(a, secondaryDim, dicts);
                const labelB = getDisplayLabel(b, secondaryDim, dicts);
                const idxA = groupOrder.indexOf(labelA);
                const idxB = groupOrder.indexOf(labelB);
                if (idxA === -1 && idxB === -1) return a.localeCompare(b);
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        }

        const mappedCategoryLabels = sortedCategories.map(cat => getDisplayLabel(cat, primaryDim, dicts));

        const series = sortedStacks.map(stackName => {
            const stackLabel = getDisplayLabel(stackName, secondaryDim!, dicts);
            const color = chart.xAxisGroups?.find(g => g.label === stackLabel)?.color || getChartColor(stackName);

            return {
                name: stackLabel,
                type: isLineType ? 'line' : 'bar',
                stack: (isStackedBar || isStackedBarH || isArea) ? 'total' : undefined,
                smooth: isLineType ? true : undefined,
                areaStyle: isArea ? {
                    opacity: 0.5,
                    color: color ? {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: color },
                            { offset: 1, color: 'rgba(255, 255, 255, 0)' }
                        ]
                    } : undefined
                } : undefined,
                barMaxWidth: 30,
                itemStyle: { color: isLineType ? (color || DEFAULT_CHART_COLOR) : generateGradient(color || DEFAULT_CHART_COLOR) },
                lineStyle: isLineType ? { color: color || DEFAULT_CHART_COLOR, width: 2 } : undefined,
                label: {
                    show: !isLineType,
                    position: (isStackedBar || isStackedBarH) ? 'inside' : 'top',
                    fontSize: 10,
                    color: (isStackedBar || isStackedBarH) ? '#fff' : undefined,
                    // Only show label when the segment is large enough
                    formatter: (p: any) => p.value >= 1 ? p.value : ''
                },
                data: sortedCategories.map(cat => {
                    const item = processedData.find(i => i.name_y === cat && i.name_x === stackName);
                    return {
                        value: item ? item.value : 0,
                        name: getDisplayLabel(cat, primaryDim, dicts),
                        originalName: cat,
                        seriesOriginalName: stackName
                    };
                })
            };
        });

        // For stacked bars: add a phantom series to show the total on top (or right) of each stack
        if (isStackedBar || isStackedBarH) {
            const totals = sortedCategories.map(cat => {
                return processedData.filter((i: any) => i.name_y === cat).reduce((sum: number, i: any) => sum + i.value, 0);
            });
            const totalSeries = {
                name: '合计',
                type: 'bar',
                stack: 'total',
                itemStyle: { color: 'transparent' },
                emphasis: { disabled: true },
                label: {
                    show: true,
                    position: isStackedBar ? 'top' : 'right',
                    fontSize: 11,
                    fontWeight: 'bold' as const,
                    color: themeColors.ink,
                    formatter: (p: any) => p.data.totalValue > 0 ? p.data.totalValue : ''
                },
                tooltip: { show: false },
                data: totals.map((v, idx) => ({
                    value: 0, // Set to 0 so it stays at the top/edge of the stack
                    totalValue: v, // Actual total displayed by label
                    name: getDisplayLabel(sortedCategories[idx], primaryDim, dicts),
                    originalName: sortedCategories[idx],
                })),
            };
            series.push(totalSeries as any);
        }

        option = {
            tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
            legend: { bottom: 0, left: 'center', type: 'scroll', padding: [2, 10], itemGap: 5, textStyle: { fontSize: 10 } },
            grid: {
                left: '2%', right: '5%', bottom: 20, top: 10,
                containLabel: true
            },
            xAxis: isStackedBarH
                ? { type: 'value', axisLabel: { fontSize: 10 } }
                : {
                    type: 'category',
                    data: mappedCategoryLabels,
                    axisLabel: {
                        interval: 0,
                        rotate: (primaryDim === 'business_group' || primaryDim === 'created_at_day') ? 0 : (mappedCategoryLabels.length > 5 ? 30 : 0),
                        fontSize: 10,
                        formatter: (val: string) => formatXAxisLabel(val, primaryDim)
                    }
                },
            yAxis: isStackedBarH
                ? {
                    type: 'category',
                    data: [...mappedCategoryLabels].reverse(),
                    axisLabel: { interval: 0, fontSize: 10 }
                }
                : { type: 'value' },
            series: isStackedBarH
                ? series.map(s => ({
                    ...s,
                    type: 'bar',
                    stack: 'total',
                    smooth: undefined,
                    areaStyle: undefined,
                    data: [...sortedCategories].reverse().map((cat: string) => {
                        if (s.name === '合计') {
                            const v = processedData.filter((i: any) => i.name_y === cat).reduce((sum: number, i: any) => sum + i.value, 0);
                            return {
                                value: 0,
                                totalValue: v,
                                name: getDisplayLabel(cat, primaryDim, dicts),
                                originalName: cat,
                                seriesOriginalName: '合计',
                            };
                        }
                        const item = processedData.find((i: any) => i.name_y === cat && i.name_x === s.name);
                        return {
                            value: item ? item.value : 0,
                            name: getDisplayLabel(cat, primaryDim, dicts),
                            originalName: cat,
                            seriesOriginalName: chart.xAxisGroups?.find((g: any) => g.label === s.name)?.values?.[0] ?? s.name,
                        };
                    })
                }))
                : series
        };
    } else if (isBar || isHBar || isLine || isArea) {
        const isHorizontal = isHBar;
        const displayData = [...(processedData || [])];

        if (chart.dimension === 'created_at_day' && chart.groups && chart.groups.length > 0) {
            const groupOrder = chart.groups.map(g => g.label);
            displayData.sort((a, b) => {
                const labelA = getDisplayLabel(a.name, chart.dimension, dicts);
                const labelB = getDisplayLabel(b.name, chart.dimension, dicts);
                const idxA = groupOrder.indexOf(labelA);
                const idxB = groupOrder.indexOf(labelB);
                if (idxA === -1 && idxB === -1) return a.name.localeCompare(b.name);
                if (idxA === -1) return 1;
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        }

        if (isHorizontal) displayData.reverse();

        const mappedLabels = (displayData || []).map((i: any) => getDisplayLabel(i.name, chart.dimension, dicts));

        option = {
            tooltip: { trigger: 'axis' },
            grid: {
                left: '2%', right: '5%',
                bottom: isHorizontal ? '2%' : '4%',
                top: isHorizontal ? '2%' : '4%',
                containLabel: true
            },
            xAxis: isHorizontal ? { type: 'value' } : {
                type: 'category',
                data: mappedLabels,
                axisLabel: {
                    interval: 0,
                    rotate: (chart.dimension === 'business_group' || chart.dimension === 'created_at_day') ? 0 : (displayData.length > 5 ? 30 : 0),
                    fontSize: 10,
                    formatter: (val: string) => formatXAxisLabel(val, chart.dimension)
                }
            },
            yAxis: isHorizontal ? {
                type: 'category',
                data: mappedLabels,
                axisLabel: { interval: 0, fontSize: 10 }
            } : { type: 'value' },
            series: [{
                name: '数量',
                type: isLineType ? 'line' : 'bar',
                smooth: isLineType ? true : undefined,
                areaStyle: isArea ? {
                    opacity: 0.5,
                    color: (processedData && processedData.length > 0) ? (() => {
                        const firstItem = processedData[0];
                        const label = getDisplayLabel(firstItem.name, chart.dimension, dicts);
                        const baseColor = getChartColor(firstItem.name) || getChartColor(label) || '#1890ff';
                        return {
                            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                            colorStops: [
                                { offset: 0, color: baseColor },
                                { offset: 1, color: 'rgba(255, 255, 255, 0)' }
                            ]
                        };
                    })() : undefined
                } : undefined,
                barMaxWidth: 30,
                itemStyle: isLineType ? (() => {
                    const firstItem = displayData?.[0];
                    if (!firstItem) return { color: DEFAULT_CHART_COLOR };
                    const label = getDisplayLabel(firstItem.name, chart.dimension, dicts);
                    const color = getChartColor(firstItem.name) || getChartColor(label) || DEFAULT_CHART_COLOR;
                    return { color: color };
                })() : undefined,
                lineStyle: isLineType ? (() => {
                    const firstItem = displayData?.[0];
                    if (!firstItem) return { color: DEFAULT_CHART_COLOR, width: 2 };
                    const label = getDisplayLabel(firstItem.name, chart.dimension, dicts);
                    const color = getChartColor(firstItem.name) || getChartColor(label) || DEFAULT_CHART_COLOR;
                    return { color: color, width: 2 };
                })() : undefined,
                data: (displayData || []).map((item: any) => {
                    const label = getDisplayLabel(item.name, chart.dimension, dicts);
                    const color = getChartColor(item.name) || getChartColor(label) || DEFAULT_CHART_COLOR;
                    return {
                        value: item.value,
                        name: label,
                        originalName: item.name,
                        itemStyle: isLineType ? undefined : { color: generateGradient(color, isHorizontal) }
                    };
                }),
                label: { show: !isLineType, position: isHorizontal ? 'right' : 'top', fontSize: 10 }
            }]
        };
    }

    const themeAxis = (axis: any, typeHint?: 'value' | 'category') => {
        if (!axis) return axis;
        const isValue = axis.type === 'value' || typeHint === 'value';
        const base = isValue ? valueAxisTheme : categoryAxisTheme;
        return {
            ...axis,
            axisLabel: { ...(base.axisLabel || {}), ...(axis.axisLabel || {}) },
            axisLine: { ...(base.axisLine || {}), ...(axis.axisLine || {}) },
            axisTick: { ...(base.axisTick || {}), ...(axis.axisTick || {}) },
            splitLine: { ...(base.splitLine || {}), ...(axis.splitLine || {}) },
        };
    };

    if (!isTable) {
        option = {
            ...baseChartOption,
            ...option,
            tooltip: { ...(baseChartOption.tooltip || {}), ...(option.tooltip || {}) },
            legend: { ...(baseChartOption.legend || {}), ...(option.legend || {}), textStyle: { ...(baseChartOption.legend.textStyle || {}), ...(option.legend?.textStyle || {}) } },
            xAxis: Array.isArray(option.xAxis) ? option.xAxis.map((axis: any) => themeAxis(axis)) : themeAxis(option.xAxis),
            yAxis: Array.isArray(option.yAxis) ? option.yAxis.map((axis: any) => themeAxis(axis)) : themeAxis(option.yAxis),
            series: option.series?.map((seriesItem: any) => {
                const keepWhiteLabel = seriesItem.label?.color === '#fff' || seriesItem.label?.color === '#ffffff';
                return {
                    ...seriesItem,
                    label: seriesItem.label ? {
                        ...seriesItem.label,
                        color: keepWhiteLabel ? seriesItem.label.color : themeColors.ink,
                    } : seriesItem.label,
                };
            }),
        };
    }

    return (
        <Card className="chart-card" size="small" styles={{ body: { padding: '0px 8px 0px 8px' } }} loading={loading}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 16,
            }}>
                <div style={{ position: 'relative', marginBottom: 3 }}>
                    <Typography.Text strong style={{ fontSize: 15, color: 'var(--radar-ink)', position: 'relative', zIndex: 1 }}>
                        {chart.title}
                    </Typography.Text>
                    <div style={{
                        position: 'absolute',
                        bottom: -6,
                        left: 0,
                        width: '150%',
                        height: 4,
                        background: 'linear-gradient(90deg, var(--radar-primary-soft) 0%, rgba(217, 217, 217, 0) 100%)',
                        zIndex: 0,
                        borderRadius: 0
                    }} />
                </div>
                <div className="chart-actions" style={{ marginRight: -4, marginTop: -2 }}>
                    {isEditable && (
                        <>
                            {onMove && !isFirst && (
                                <Tooltip title="向左移动">
                                    <AntButton icon={<ArrowLeftOutlined />} size="small" type="text" onClick={() => onMove('left')} />
                                </Tooltip>
                            )}
                            {onMove && !isLast && (
                                <Tooltip title="向右移动">
                                    <AntButton icon={<ArrowRightOutlined />} size="small" type="text" onClick={() => onMove('right')} />
                                </Tooltip>
                            )}
                            <AntButton icon={<EditOutlined />} size="small" type="text" onClick={onEdit} />
                            <Popconfirm title="确定删除此图表？" onConfirm={onDelete}>
                                <AntButton icon={<DeleteOutlined />} size="small" type="text" danger />
                            </Popconfirm>
                        </>
                    )}
                </div>
            </div>
            {chart.chartType === 'table' ? (
                <div style={{
                    height: (forcedHeight || chart.height) === 0 ? 'auto' : (forcedHeight || chart.height || 220),
                    overflowX: 'auto',
                    overflowY: (forcedHeight || chart.height) === 0 ? 'visible' : 'auto',
                    padding: '0 4px'
                }}>
                    {renderTable(chart.title, processedData, chart.dimension, chart.xAxisDimension, chart.filters, chart.groups, chart.xAxisGroups)}
                </div>
            ) : (
                <ReactECharts
                    option={option}
                    style={{ height: (forcedHeight || chart.height || 220) }}
                    opts={{ renderer: 'svg' }}
                    onEvents={{ click: (p: any) => onChartClick(p, chart.dimension, chart.filters, chart.xAxisDimension, chart.groups, chart.xAxisGroups) }}
                />
            )}
        </Card>
    );
});

export default function DashboardPage() {
    const { message } = App.useApp();
    const screens = useBreakpoint();
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalIssues, setModalIssues] = useState<any[]>([]);
    const [modalTitle, setModalTitle] = useState('');
    const [modalPageSize, setModalPageSize] = useState(10);
    const [modalLock, setModalLock] = useState(false); // Add lock to prevent double clicks
    const [detailVisible, setDetailVisible] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
    const { user } = useAuth();
    const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

    const [selectedRound, setSelectedRound] = useState<string[]>([]);
    const [selectedBusinessGroup, setSelectedBusinessGroup] = useState<string[]>([]);
    const [roundInitialized, setRoundInitialized] = useState(false);
    const [dictsLoaded, setDictsLoaded] = useState(false);

    // Dashboard config
    const [systemConfig, setSystemConfig] = useState<DashboardConfig>(DEFAULT_DASHBOARD_CONFIG);
    const [userConfig, setUserConfig] = useState<DashboardConfig | null>(null);
    const [configDrawerVisible, setConfigDrawerVisible] = useState(false);

    // Chart Editor State
    const [chartEditorVisible, setChartEditorVisible] = useState(false);
    const [editingChart, setEditingChart] = useState<ChartConfig | undefined>(undefined);
    const [editingSectionId, setEditingSectionId] = useState<string>('');

    // Dictionaries for Detail Form
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

    const [refreshKey, setRefreshKey] = useState(0);

    const activeBoardConfig = systemConfig.board;

    // Memoize base filters at top level to obey Rules of Hooks
    const memoizedBaseFilters = useMemo(() => {
        const filters: Record<string, any> = {};

        const rowConfig = activeBoardConfig.rowConfig;
        const colConfig = activeBoardConfig.columnConfig;

        const aggregatedStatuses: string[] = [];
        let hasAll = false;
        statusFilter.forEach(id => {
            const row = rowConfig.items.find(r => r.id === id);
            if (row) {
                if (row.values.includes('__ALL__')) hasAll = true;
                aggregatedStatuses.push(...row.values);
            }
        });

        if (rowConfig.dimension === 'status') {
            if (!hasAll) filters.status = Array.from(new Set(aggregatedStatuses));
        } else {
            // If row dimension is NOT status, we should probably apply the selected row values to THAT dimension
            if (!hasAll) filters[rowConfig.dimension] = Array.from(new Set(aggregatedStatuses));
        }

        if (selectedRound && selectedRound.length > 0) filters.round = selectedRound;
        if (selectedBusinessGroup && selectedBusinessGroup.length > 0) filters.business_group = selectedBusinessGroup;

        return filters;
    }, [statusFilter, activeBoardConfig.rows, selectedRound, selectedBusinessGroup]);

    useEffect(() => {
        fetchDicts();
        fetchDashboardConfig();
    }, []);

    const fetchDashboardConfig = async () => {
        try {
            const res = await fetch('/PAMS/api/config/dashboard');
            const data = await res.json();
            if (data.success && data.data) {
                if (data.data.system) {
                    setSystemConfig(migrateConfig(data.data.system));
                }
                if (data.data.user) {
                    setUserConfig(migrateConfig(data.data.user));
                }
            }
        } catch (error) {
            console.error('Failed to fetch dashboard config', error);
        }
    };

    const handleSaveBoardConfig = async (config: DashboardConfig) => {
        // 保存看板配置（通常由管理员保存为 SYSTEM，或者保存到当前用户的 board 部分）
        // 这里简化：看板配置仅由管理员保存为 SYSTEM，普通用户只保存图表
        try {
            const res = await fetch('/PAMS/api/config/dashboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config, type: isAdmin ? 'system' : 'user' }),
            });
            const data = await res.json();
            if (data.success) {
                if (isAdmin) setSystemConfig(config);
                else setUserConfig(config);
                setConfigDrawerVisible(false);
                message.success('看板配置已保存');
            } else {
                message.error(data.error || '保存失败');
            }
        } catch {
            message.error('保存配置失败');
        }
    };

    // 合并后的最终图表列表
    const sections = useMemo(() => {
        // Show User sections first, then System sections
        const systemSects = systemConfig.sections || [];
        const userSects = userConfig?.sections || [];

        const finalSections: DashboardSection[] = [];

        // 1. Add User sections
        const userUserSects = userSects.filter(s => s.type === 'user');
        if (userUserSects.length > 0) {
            finalSections.push(...userUserSects);
        } else {
            // Default empty "My Charts"
            finalSections.push({ id: 'section_user', title: '我的图表', type: 'user', charts: [] });
        }

        // 2. Add System sections
        const sysSects = systemSects.filter(s => s.type === 'system');
        finalSections.push(...sysSects);

        return finalSections;
    }, [systemConfig, userConfig]);


    const handleSaveChart = async (chart: ChartConfig) => {
        const targetConfig = editingSectionId === 'section_system' ? systemConfig : (userConfig || { ...systemConfig, sections: [{ id: 'section_user', title: '我的图表', type: 'user', charts: [] }] });
        const sectionId = editingSectionId;

        const newSections = (targetConfig.sections || []).map(s => {
            if (s.id === sectionId) {
                const existingIndex = s.charts.findIndex(c => c.id === chart.id);
                const newCharts = [...s.charts];
                if (existingIndex > -1) {
                    newCharts[existingIndex] = chart;
                } else {
                    newCharts.push(chart);
                }
                return { ...s, charts: newCharts };
            }
            return s;
        });

        const newConfig = { ...targetConfig, sections: newSections };

        try {
            const res = await fetch('/PAMS/api/config/dashboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: newConfig,
                    type: editingSectionId === 'section_system' ? 'system' : 'user'
                }),
            });
            const data = await res.json();
            if (data.success) {
                if (editingSectionId === 'section_system') setSystemConfig(newConfig);
                else setUserConfig(newConfig);
                message.success('图表已保存');
            }
        } catch {
            message.error('保存失败');
        }
    };

    const handleDeleteChart = async (sectionId: string, chartId: string) => {
        const isSystem = sectionId === 'section_system';
        const targetConfig = isSystem ? systemConfig : (userConfig!);

        const newSections = targetConfig.sections.map(s => {
            if (s.id === sectionId) {
                return { ...s, charts: s.charts.filter(c => c.id !== chartId) };
            }
            return s;
        });

        const newConfig = { ...targetConfig, sections: newSections };

        try {
            await fetch('/PAMS/api/config/dashboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: newConfig, type: isSystem ? 'system' : 'user' }),
            });
            if (isSystem) setSystemConfig(newConfig);
            else setUserConfig(newConfig);
            message.success('图表已删除');
        } catch {
            message.error('删除失败');
        }
    };

    const handleMoveChart = async (sectionId: string, chartId: string, direction: 'left' | 'right') => {
        const isSystem = sectionId === 'section_system';
        const targetConfig = isSystem ? systemConfig : (userConfig!);
        if (!targetConfig) return;

        const newSections = targetConfig.sections.map(s => {
            if (s.id === sectionId) {
                const charts = [...s.charts];
                const index = charts.findIndex(c => c.id === chartId);
                if (index === -1) return s;

                const targetIndex = direction === 'left' ? index - 1 : index + 1;
                if (targetIndex < 0 || targetIndex >= charts.length) return s;

                // Swap
                const temp = charts[index];
                charts[index] = charts[targetIndex];
                charts[targetIndex] = temp;

                return { ...s, charts };
            }
            return s;
        });

        const newConfig = { ...targetConfig, sections: newSections };

        try {
            const res = await fetch('/PAMS/api/config/dashboard', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: newConfig, type: isSystem ? 'system' : 'user' }),
            });
            const data = await res.json();
            if (data.success) {
                if (isSystem) setSystemConfig(newConfig);
                else setUserConfig(newConfig);
            }
        } catch {
            message.error('排序保存失败');
        }
    };

    // Initialize statusFilter from dashboardConfig
    useEffect(() => {
        if (statusFilter.length === 0 && activeBoardConfig.rowConfig.items.length > 0) {
            setStatusFilter([activeBoardConfig.rowConfig.items[0].id]);
        }
    }, [activeBoardConfig, statusFilter]);

    // Initialize default round
    useEffect(() => {
        if (!roundInitialized) {
            if (dicts.issue_round.length > 0) {
                const defaultItem = dicts.issue_round.find(d => d.is_default_val === 1);
                if (defaultItem) {
                    setSelectedRound([defaultItem.item_key]);
                }
                setRoundInitialized(true);
            } else if (dictsLoaded) {
                // If dicts loaded but no rounds, mark initialized to allow fetch
                setRoundInitialized(true);
            }
        }
    }, [dicts.issue_round, roundInitialized, dictsLoaded]);

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
        } finally {
            setDictsLoaded(true);
        }
    };

    // Generic update handler
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

    const fetchStats = useCallback(async (roundVal?: string[], bgVal?: string[]) => {
        try {
            setLoading(true);
            const colDim = activeBoardConfig.columnConfig.dimension;
            const rowDim = activeBoardConfig.rowConfig.dimension;

            // The Board always shows "all" data relative to round/bg, ignoring the chart-specific status filter
            let url = `/PAMS/api/stats?statusFilter=all`;
            if (roundVal && roundVal.length > 0) {
                url += `&round=${encodeURIComponent(roundVal.join(','))}`;
            }
            if (bgVal && bgVal.length > 0) {
                url += `&businessGroup=${encodeURIComponent(bgVal.join(','))}`;
            }
            if (colDim) url += `&boardColDim=${colDim}`;
            if (rowDim) url += `&boardRowDim=${rowDim}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                setStats(data.data);
            }
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        } finally {
            setLoading(false);
        }
    }, [activeBoardConfig.columnConfig.dimension, activeBoardConfig.rowConfig.dimension]);

    const handleRefresh = useCallback(() => {
        setRefreshKey(prev => prev + 1);
        fetchStats(selectedRound, selectedBusinessGroup);
    }, [selectedRound, selectedBusinessGroup, fetchStats]);

    useEffect(() => {
        if (roundInitialized) {
            fetchStats(selectedRound, selectedBusinessGroup);
        }
    }, [selectedRound, selectedBusinessGroup, roundInitialized, fetchStats]);

    const handleFilterToggle = (rowId: string) => {
        const row = activeBoardConfig.rowConfig.items.find(r => r.id === rowId);
        const isTotal = row?.values.includes('__ALL__');
        const totalRowId = activeBoardConfig.rowConfig.items.find(r => r.values.includes('__ALL__'))?.id;

        setStatusFilter(prev => {
            if (isTotal) {
                // If clicking total row: select ONLY total
                return [rowId];
            }

            // If clicking another row
            let newSelection;
            if (prev.includes(rowId)) {
                // Toggle off
                newSelection = prev.filter(id => id !== rowId);
            } else {
                // Toggle on: add this, but remove 'Total' if it exists
                newSelection = [...prev.filter(id => id !== totalRowId), rowId];
            }

            // Ensure at least one selection
            if (newSelection.length === 0) {
                message.info('至少选择一个过滤维度');
                return prev;
            }
            return newSelection;
        });
    };

    if (loading && !stats) {
        return (
            <div style={{ textAlign: 'center', padding: 100 }}>
                <Spin size="large" />
            </div>
        );
    }

    // Calculate summary stats
    const categoryGroups = stats?.categoryGroups || {
        '金科': { total: 0, resolved: 0, unresolved: 0 },
        '农信': { total: 0, resolved: 0, unresolved: 0 },
        '需求': { total: 0, resolved: 0, unresolved: 0 },
        '其它': { total: 0, resolved: 0, unresolved: 0 },
    };

    const totalAll = stats?.total || 0;
    const resolvedAll = stats?.resolved || 0;
    const unresolvedAll = stats?.pending || 0;


    // Compact stat card style - horizontal layout with left icon+label and right number
    const statCardStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        borderRadius: 0,
        background: 'var(--radar-surface)',
        border: '1px solid var(--radar-border)',
        boxShadow: 'var(--radar-card-shadow)',
        borderLeft: '3px solid var(--radar-border)',
    };

    const statLeftStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    };

    const statValueStyle: React.CSSProperties = {
        fontSize: screens.xs ? 18 : 22,
        fontWeight: 'bold',
        margin: 0,
    };

    const handleChartClick = (params: any, type: ChartDimension, filters?: Record<string, any>, xAxisDim?: ChartDimension, groups?: ChartGroupDef[], xAxisGroups?: ChartGroupDef[]) => {
        if (!params.value || params.value === 0 || modalLock) return;

        // Stop native event propagation if possible
        if (params.event && params.event.stop) {
            params.event.stop();
        }

        setModalLock(true);
        setTimeout(() => setModalLock(false), 800);

        const query = new URLSearchParams();
        query.append('page', '1');
        query.append('pageSize', '5000');

        const isPrimaryTotal = !params.name || params.name === '总计' || params.name === '合计';
        const isSecondaryTotal = xAxisDim && (!params.seriesName || params.seriesName === '合计');

        // 1. Identify all dimensions that will be specifically set by the drill-down
        const involvedDimensions = new Set<string>();
        if (!isPrimaryTotal) involvedDimensions.add(type);
        if (xAxisDim && !isSecondaryTotal) involvedDimensions.add(xAxisDim);

        // We need to find sub-dimensions as we resolve groups
        const drillDownParams: Record<string, any[]> = {};

        // Resolve Primary Dimension Group
        const primaryName = params.parentName || params.name;
        if (primaryName && primaryName !== '总计' && primaryName !== '合计') {
            const group = groups?.find(g => g.label === primaryName);
            if (group) {
                drillDownParams[type] = group.values;

                // Handle Level 2 sub-dimension
                if (params.parentName && group.subDimension) {
                    involvedDimensions.add(group.subDimension);
                    const level2Name = params.parentName2 ? params.parentName2 : params.name;
                    const subGroup = group.subGroups?.find(g => g.label === level2Name);

                    if (subGroup) {
                        drillDownParams[group.subDimension] = subGroup.values;

                        // Handle Level 3 sub-sub-dimension
                        if (params.parentName2 && params.name && subGroup.subDimension) {
                            involvedDimensions.add(subGroup.subDimension);
                            const subSubGroup = subGroup.subGroups?.find(g => g.label === params.name);
                            if (subSubGroup) {
                                drillDownParams[subGroup.subDimension] = subSubGroup.values;
                            } else if (params.name === '其它' && subGroup.subGroups && subGroup.subGroups.length > 0) {
                                const allSubSubValues = subGroup.subGroups.flatMap(g => g.values);
                                drillDownParams[`${subGroup.subDimension}_not`] = [allSubSubValues.join(',')];
                            } else {
                                drillDownParams[subGroup.subDimension] = [params.name];
                            }
                        }
                    } else if (level2Name === '其它' && group.subGroups && group.subGroups.length > 0) {
                        const allSubValues = group.subGroups.flatMap(g => g.values);
                        drillDownParams[`${group.subDimension}_not`] = [allSubValues.join(',')];
                    } else {
                        drillDownParams[group.subDimension] = [level2Name];
                    }
                }
            } else if (primaryName === '其它' && groups && groups.length > 0) {
                drillDownParams[`${type}_not`] = [groups.flatMap(g => g.values).join(',')];
            } else {
                const actualValue = params.data?.originalName || primaryName;
                drillDownParams[type] = [actualValue];
            }
        }

        // Resolve Secondary Dimension Group
        const secondaryName = params.parentSeriesName2 || params.parentSeriesName || params.seriesName;
        if (xAxisDim && secondaryName && secondaryName !== '合计') {
            const group = xAxisGroups?.find(g => g.label === secondaryName);
            if (group) {
                drillDownParams[xAxisDim] = (drillDownParams[xAxisDim] || []).concat(group.values);

                // Handle Level 2 sub-dimension
                if (params.parentSeriesName && group.subDimension) {
                    involvedDimensions.add(group.subDimension);
                    const level2SeriesName = params.parentSeriesName2 ? params.parentSeriesName : params.seriesName;
                    const subGroup = group.subGroups?.find(g => g.label === level2SeriesName);

                    if (subGroup) {
                        drillDownParams[group.subDimension] = (drillDownParams[group.subDimension] || []).concat(subGroup.values);

                        // Handle Level 3 sub-sub-dimension
                        if (params.parentSeriesName2 && params.seriesName && subGroup.subDimension) {
                            involvedDimensions.add(subGroup.subDimension);
                            const subSubGroup = subGroup.subGroups?.find(g => g.label === params.seriesName);
                            if (subSubGroup) {
                                drillDownParams[subGroup.subDimension] = (drillDownParams[subGroup.subDimension] || []).concat(subSubGroup.values);
                            } else if (params.seriesName === '其它' && subGroup.subGroups && subGroup.subGroups.length > 0) {
                                const allSubSubValues = subGroup.subGroups.flatMap(g => g.values);
                                drillDownParams[`${subGroup.subDimension}_not`] = [allSubSubValues.join(',')];
                            } else {
                                drillDownParams[subGroup.subDimension] = (drillDownParams[subGroup.subDimension] || []).concat([params.seriesName]);
                            }
                        }
                    } else if (level2SeriesName === '其它' && group.subGroups && group.subGroups.length > 0) {
                        const allSubValues = group.subGroups.flatMap(g => g.values);
                        drillDownParams[`${group.subDimension}_not`] = [allSubValues.join(',')];
                    } else {
                        drillDownParams[group.subDimension] = (drillDownParams[group.subDimension] || []).concat([level2SeriesName]);
                    }
                }
            } else if (secondaryName === '其它' && xAxisGroups && xAxisGroups.length > 0) {
                drillDownParams[`${xAxisDim}_not`] = [xAxisGroups.flatMap(g => g.values).join(',')];
            } else {
                const actualSeriesValue = params.data?.seriesOriginalName || secondaryName;
                drillDownParams[xAxisDim] = (drillDownParams[xAxisDim] || []).concat([actualSeriesValue]);
            }
        }

        // Apply shared filters (Round, Business Group, etc.)
        const combinedFilters = { ...memoizedBaseFilters, ...(filters || {}) };
        Object.entries(combinedFilters).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== '') {
                // If this dimension (or its _not variant) is specifically being set by the drill-down, 
                // skip the base filter to avoid conflicting or redundant filters
                const rootKey = key.endsWith('_not') ? key.replace('_not', '') : key;
                if (involvedDimensions.has(rootKey)) return;

                if (Array.isArray(val)) {
                    val.forEach(v => query.append(key, v));
                } else {
                    query.append(key, val);
                }
            }
        });

        // Finally, append the specifically resolved drill-down parameters
        Object.entries(drillDownParams).forEach(([key, values]) => {
            values.forEach(v => query.append(key, v));
        });

        const buildTitle = () => {
            let t = `[问题列表] ${primaryName || ''}`;
            if (params.parentName) t += ` - ${params.parentName2 ? params.parentName2 : params.name}`;
            if (params.parentName2) t += ` - ${params.name}`;

            if (secondaryName) t += ` | ${secondaryName}`;
            if (params.parentSeriesName) t += ` - ${params.parentSeriesName2 ? params.parentSeriesName : params.seriesName}`;
            if (params.parentSeriesName2) t += ` - ${params.seriesName}`;
            return t;
        };

        fetchModalIssues(buildTitle(), query);
    };

    const renderStatTable = (title: string, data: any[], type: ChartDimension, xAxisDim?: ChartDimension, filters?: Record<string, any>, groups?: ChartGroupDef[], xAxisGroups?: ChartGroupDef[]) => {
        if (!data || data.length === 0) return (
            <div style={{ padding: 40, textAlign: 'center' }}>
                <Empty description="暂无数据" />
            </div>
        );

        const dimensionLabel = DIMENSION_OPTIONS.find(d => d.value === type)?.label || '主要维度';

        let dataSource: any[] = [];
        let cols: any[] = [];

        // Using the getDisplayLabel from the outer scope

        if (xAxisDim) {
            // 2D Pivot Table (with potential sub-dimensions)
            // Extract Main Y and Main X values
            const mainYValues = Array.from(new Set(data.filter(i => !i.parent_y).map(item => item.name_y)));
            const mainXValues = Array.from(new Set(data.filter(i => !i.parent_x).map(item => item.name_x)));

            // Extract X Hierarchy (Columns)
            const xHierarchy: { main: string; subs: { sub: string, subSubs: string[] }[] }[] = mainXValues.map(x => {
                const subs = Array.from(new Set(data.filter(i => i.parent_x === x && !i.parent_x_2).map(item => item.name_x)));
                const groupConfig = xAxisGroups?.find(g => g.label === x);

                const resultSubs = subs.map(sub => {
                    const subSubs = Array.from(new Set(data.filter(i => i.parent_x === x && i.parent_x_2 === sub).map(item => item.name_x)));
                    const subGroupConfig = groupConfig?.subGroups?.find(sg => sg.label === sub);

                    if (subGroupConfig?.subGroups && subSubs.length > 0) {
                        const subSubRefOrder = subGroupConfig.subGroups.map(g => g.label);
                        subSubs.sort((a, b) => {
                            const indexA = subSubRefOrder.indexOf(a);
                            const indexB = subSubRefOrder.indexOf(b);
                            if (indexA === -1 && indexB === -1) {
                                const isTime = subGroupConfig.subDimension === 'created_at_day' || subGroupConfig.subDimension === 'plan_fix_time_day';
                                return isTime ? String(a).localeCompare(String(b)) : a.localeCompare(b);
                            }
                            if (indexA === -1) return 1;
                            if (indexB === -1) return -1;
                            return indexA - indexB;
                        });
                    } else if (subSubs.length > 0) {
                        const isTime = subGroupConfig?.subDimension === 'created_at_day' || subGroupConfig?.subDimension === 'plan_fix_time_day';
                        if (isTime) subSubs.sort((a, b) => String(a).localeCompare(String(b)));
                    }
                    return { sub, subSubs };
                });

                if (groupConfig?.subGroups && resultSubs.length > 0) {
                    const subRefOrder = groupConfig.subGroups.map(g => g.label);
                    resultSubs.sort((a, b) => {
                        const indexA = subRefOrder.indexOf(a.sub);
                        const indexB = subRefOrder.indexOf(b.sub);
                        if (indexA === -1 && indexB === -1) {
                            const isSubTimeDim = groupConfig.subDimension === 'created_at_day' || groupConfig.subDimension === 'plan_fix_time_day';
                            if (isSubTimeDim) return String(a.sub).localeCompare(String(b.sub));
                            return a.sub.localeCompare(b.sub);
                        }
                        if (indexA === -1) return 1;
                        if (indexB === -1) return -1;
                        return indexA - indexB;
                    });
                } else if (resultSubs.length > 0) {
                    const isSubTimeDim = groupConfig?.subDimension === 'created_at_day' || groupConfig?.subDimension === 'plan_fix_time_day';
                    if (isSubTimeDim) resultSubs.sort((a, b) => String(a.sub).localeCompare(String(b.sub)));
                }

                return { main: x, subs: resultSubs };
            });

            const isXTimeDim = xAxisDim === 'created_at_day' || xAxisDim === 'plan_fix_time_day';
            // Sort mainXValues based on xAxisGroups order
            if (xAxisGroups && xAxisGroups.length > 0) {
                const xRefOrder = xAxisGroups.map(g => g.label);
                xHierarchy.sort((a, b) => {
                    const indexA = xRefOrder.indexOf(a.main);
                    const indexB = xRefOrder.indexOf(b.main);
                    if (indexA === -1 && indexB === -1) {
                        if (isXTimeDim) return String(a.main).localeCompare(String(b.main));
                        return a.main.localeCompare(b.main);
                    }
                    if (indexA === -1) return 1;
                    if (indexB === -1) return -1;
                    return indexA - indexB;
                });
            } else if (isXTimeDim) {
                xHierarchy.sort((a, b) => String(a.main).localeCompare(String(b.main)));
            }

            // Extract Y Hierarchy (Rows) and Build DataSource
            dataSource = mainYValues.map((y, idx) => {
                const row: any = { key: `main_${idx}`, name: y, dimension: type };

                const extractRowData = (targetRow: any, parentY: string | undefined, parentY2: string | undefined, nameY: string) => {
                    let total = 0;
                    xHierarchy.forEach(xh => {
                        if (xh.subs.length > 0) {
                            xh.subs.forEach(xSubObj => {
                                const xSub = xSubObj.sub;
                                if (xSubObj.subSubs.length > 0) {
                                    xSubObj.subSubs.forEach(xSubSub => {
                                        const dataIndex = `${xh.main}_${xSub}_${xSubSub}`;
                                        const val = data.find(d =>
                                            d.parent_y === parentY && d.parent_y_2 === parentY2 && d.name_y === nameY &&
                                            d.parent_x === xh.main && d.parent_x_2 === xSub && d.name_x === xSubSub
                                        )?.value || 0;
                                        targetRow[dataIndex] = val;
                                        total += val;
                                    });
                                } else {
                                    const dataIndex = `${xh.main}_${xSub}`;
                                    const val = data.find(d =>
                                        d.parent_y === parentY && d.parent_y_2 === parentY2 && d.name_y === nameY &&
                                        d.parent_x === xh.main && !d.parent_x_2 && d.name_x === xSub
                                    )?.value || 0;
                                    targetRow[dataIndex] = val;
                                    total += val;
                                }
                            });
                        } else {
                            const dataIndex = xh.main;
                            const val = data.find(d =>
                                d.parent_y === parentY && d.parent_y_2 === parentY2 && d.name_y === nameY &&
                                !d.parent_x && d.name_x === xh.main
                            )?.value || 0;
                            targetRow[dataIndex] = val;
                            total += val;
                        }
                    });
                    targetRow.total = total;
                };

                extractRowData(row, undefined, undefined, y);

                // Level 2
                const ySubs = Array.from(new Set(data.filter(i => i.parent_y === y && !i.parent_y_2).map(item => item.name_y)));
                if (ySubs.length > 0) {
                    const groupConfig = groups?.find(g => g.label === y);
                    if (groupConfig?.subGroups) {
                        const subRefOrder = groupConfig.subGroups.map(g => g.label);
                        ySubs.sort((a, b) => {
                            const indexA = subRefOrder.indexOf(a);
                            const indexB = subRefOrder.indexOf(b);
                            if (indexA === -1 && indexB === -1) {
                                const isTime = groupConfig.subDimension === 'created_at_day' || groupConfig.subDimension === 'plan_fix_time_day';
                                return isTime ? String(a).localeCompare(String(b)) : a.localeCompare(b);
                            }
                            if (indexA === -1) return 1;
                            if (indexB === -1) return -1;
                            return indexA - indexB;
                        });
                    } else {
                        const isTime = groupConfig?.subDimension === 'created_at_day' || groupConfig?.subDimension === 'plan_fix_time_day';
                        if (isTime) ySubs.sort((a, b) => String(a).localeCompare(String(b)));
                    }

                    row.children = ySubs.map((ySub, subIdx) => {
                        const subDim = groupConfig?.subDimension || type;
                        const childRow: any = { key: `sub_${idx}_${subIdx}`, name: ySub, parentName: y, isSub: true, dimension: subDim };
                        extractRowData(childRow, y, undefined, ySub);

                        // Level 3
                        const ySubSubs = Array.from(new Set(data.filter(i => i.parent_y === y && i.parent_y_2 === ySub).map(item => item.name_y)));
                        if (ySubSubs.length > 0) {
                            const subGroupConfig = groupConfig?.subGroups?.find(sg => sg.label === ySub);
                            if (subGroupConfig?.subGroups) {
                                const subSubRefOrder = subGroupConfig.subGroups.map(g => g.label);
                                ySubSubs.sort((a, b) => {
                                    const indexA = subSubRefOrder.indexOf(a);
                                    const indexB = subSubRefOrder.indexOf(b);
                                    if (indexA === -1 && indexB === -1) {
                                        const isTime = subGroupConfig.subDimension === 'created_at_day' || subGroupConfig.subDimension === 'plan_fix_time_day';
                                        return isTime ? String(a).localeCompare(String(b)) : a.localeCompare(b);
                                    }
                                    if (indexA === -1) return 1;
                                    if (indexB === -1) return -1;
                                    return indexA - indexB;
                                });
                            } else {
                                const isTime = subGroupConfig?.subDimension === 'created_at_day' || subGroupConfig?.subDimension === 'plan_fix_time_day';
                                if (isTime) ySubSubs.sort((a, b) => String(a).localeCompare(String(b)));
                            }

                            childRow.children = ySubSubs.map((ySubSub, subSubIdx) => {
                                const subSubDim = subGroupConfig?.subDimension || subDim;
                                const subChildRow: any = { key: `subsub_${idx}_${subIdx}_${subSubIdx}`, name: ySubSub, parentName: y, parentName2: ySub, isSub: true, dimension: subSubDim };
                                extractRowData(subChildRow, y, ySub, ySubSub);
                                return subChildRow;
                            });
                        }

                        return childRow;
                    });
                }
                return row;
            }).sort((a, b) => {
                if (groups && groups.length > 0) {
                    const yRefOrder = groups.map(g => g.label);
                    const indexA = yRefOrder.indexOf(a.name);
                    const indexB = yRefOrder.indexOf(b.name);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                }
                const isYTimeDim = type === 'created_at_day' || type === 'plan_fix_time_day';
                if (isYTimeDim) return String(a.name).localeCompare(String(b.name));
                return b.total - a.total;
            });

            // Summary Row (Sums only main rows)
            const summaryRow: any = { key: 'summary', name: '总计' };
            let grandTotal = 0;
            xHierarchy.forEach(xh => {
                if (xh.subs.length > 0) {
                    xh.subs.forEach(xSubObj => {
                        const xSub = xSubObj.sub;
                        if (xSubObj.subSubs.length > 0) {
                            xSubObj.subSubs.forEach(xSubSub => {
                                const dataIndex = `${xh.main}_${xSub}_${xSubSub}`;
                                const total = dataSource.reduce((sum, row) => sum + (row[dataIndex] || 0), 0);
                                summaryRow[dataIndex] = total;
                                grandTotal += total;
                            });
                        } else {
                            const dataIndex = `${xh.main}_${xSub}`;
                            const total = dataSource.reduce((sum, row) => sum + (row[dataIndex] || 0), 0);
                            summaryRow[dataIndex] = total;
                            grandTotal += total;
                        }
                    });
                } else {
                    const dataIndex = xh.main;
                    const total = dataSource.reduce((sum, row) => sum + (row[dataIndex] || 0), 0);
                    summaryRow[dataIndex] = total;
                    grandTotal += total;
                }
            });
            summaryRow.total = grandTotal;
            dataSource.push(summaryRow);

            // Filter xHierarchy to hide columns that are all 0
            const filteredXHierarchy = xHierarchy.filter(xh => {
                if (xh.subs.length > 0) {
                    return xh.subs.some(xs => {
                        if (xs.subSubs.length > 0) {
                            return xs.subSubs.some(xss => summaryRow[`${xh.main}_${xs.sub}_${xss}`] > 0);
                        }
                        return summaryRow[`${xh.main}_${xs.sub}`] > 0;
                    });
                }
                return summaryRow[xh.main] > 0;
            }).map(xh => {
                const filteredSubs = xh.subs.filter(xs => {
                    if (xs.subSubs.length > 0) {
                        return xs.subSubs.some(xss => summaryRow[`${xh.main}_${xs.sub}_${xss}`] > 0);
                    }
                    return summaryRow[`${xh.main}_${xs.sub}`] > 0;
                }).map(xs => {
                    const filteredSubSubs = xs.subSubs.filter(xss => summaryRow[`${xh.main}_${xs.sub}_${xss}`] > 0);
                    return { ...xs, subSubs: filteredSubSubs };
                });
                return { ...xh, subs: filteredSubs };
            });

            // Build Columns
            const leafColumnsCount = filteredXHierarchy.reduce((acc, curr) => acc + (curr.subs.length > 0 ? curr.subs.reduce((subAcc, sub) => subAcc + (sub.subSubs.length > 0 ? sub.subSubs.length : 1), 0) : 1), 0);
            const colWidth = `${100 / (leafColumnsCount + 2)}%`;

            const renderTableCell = (val: any, record: any, xMain: string, xSub?: string, xSubSub?: string) => {
                const actualVal = (typeof val === 'number' || typeof val === 'string') ? val : 0;
                const numVal = Number(actualVal) || 0;
                if (numVal === 0) return <span style={{ color: '#bfbfbf' }}>0</span>;

                const mainGroupColor = xAxisGroups?.find(g => g.label === xMain)?.color;
                const subGroupConfig = xAxisGroups?.find(g => g.label === xMain)?.subGroups?.find(sg => sg.label === xSub);
                const subGroupColor = xSub ? subGroupConfig?.color : undefined;
                const subSubGroupColor = xSubSub ? subGroupConfig?.subGroups?.find(sg => sg.label === xSubSub)?.color : undefined;

                const groupColor = subSubGroupColor || subGroupColor || mainGroupColor;

                return (
                    <a
                        style={{
                            fontWeight: record.name === '总计' ? 'bold' : 'normal',
                            color: groupColor || undefined
                        }}
                        onClick={() => handleChartClick({
                            value: numVal,
                            name: record.name,
                            parentName: record.parentName,
                            parentName2: record.parentName2,
                            seriesName: xSubSub || xSub || xMain,
                            parentSeriesName: xSubSub ? xSub : (xSub ? xMain : undefined),
                            parentSeriesName2: xSubSub ? xMain : undefined
                        }, type, filters, xAxisDim, groups, xAxisGroups)}
                    >
                        {numVal}
                    </a>
                );
            };

            cols = [
                {
                    title: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.2 }}>{dimensionLabel}</div>,
                    dataIndex: 'name',
                    key: 'name',
                    align: 'center' as const,
                    width: colWidth,
                    render: (val: string, record: any) => {
                        const label = getDisplayLabel(val, record.dimension || type, dicts);
                        const displayLabel = typeof label === 'string' ? label.replace(/\\n/g, '\n') : label;
                        return (
                            <Text strong={val === '总计' || (!record.isSub && record.children?.length > 0)} style={{ fontSize: record.isSub ? 11 : 12, color: record.isSub ? '#666' : 'inherit' }}>
                                {displayLabel}
                            </Text>
                        );
                    }
                },
                ...filteredXHierarchy.map(xh => {
                    const mainTitle = getDisplayLabel(xh.main, xAxisDim, dicts);
                    const displayMainTitle = typeof mainTitle === 'string' ? mainTitle.replace(/\\n/g, '\n') : mainTitle;

                    if (xh.subs.length > 0) {
                        return {
                            title: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.2 }}>{displayMainTitle}</div>,
                            children: xh.subs.map(xSubObj => {
                                const xSub = xSubObj.sub;
                                const subDim = xAxisGroups?.find(g => g.label === xh.main)?.subDimension || xAxisDim;
                                const subTitle = getDisplayLabel(xSub, subDim, dicts);
                                const displaySubTitle = typeof subTitle === 'string' ? subTitle.replace(/\\n/g, '\n') : subTitle;

                                if (xSubObj.subSubs.length > 0) {
                                    return {
                                        title: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10, lineHeight: 1.2, color: '#666' }}>{displaySubTitle}</div>,
                                        children: xSubObj.subSubs.map(xSubSub => {
                                            const dataIndex = `${xh.main}_${xSub}_${xSubSub}`;
                                            const subSubDim = xAxisGroups?.find(g => g.label === xh.main)?.subGroups?.find(sg => sg.label === xSub)?.subDimension || subDim;
                                            const subSubTitle = getDisplayLabel(xSubSub, subSubDim, dicts);
                                            const displaySubSubTitle = typeof subSubTitle === 'string' ? subSubTitle.replace(/\\n/g, '\n') : subSubTitle;

                                            return {
                                                title: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 9, lineHeight: 1.2, color: '#888' }}>{displaySubSubTitle}</div>,
                                                dataIndex: dataIndex,
                                                key: dataIndex,
                                                align: 'center' as const,
                                                width: colWidth,
                                                render: (val: any, record: any) => renderTableCell(val, record, xh.main, xSub, xSubSub)
                                            };
                                        })
                                    };
                                } else {
                                    const dataIndex = `${xh.main}_${xSub}`;
                                    return {
                                        title: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 10, lineHeight: 1.2, color: '#666' }}>{displaySubTitle}</div>,
                                        dataIndex: dataIndex,
                                        key: dataIndex,
                                        align: 'center' as const,
                                        width: colWidth,
                                        render: (val: any, record: any) => renderTableCell(val, record, xh.main, xSub)
                                    };
                                }
                            })
                        };
                    } else {
                        const dataIndex = xh.main;
                        // Without children, Ant Design Table will automatically rowSpan this header to cover the sub-header depth.
                        return {
                            title: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.2 }}>{displayMainTitle}</div>,
                            dataIndex: dataIndex,
                            key: dataIndex,
                            align: 'center' as const,
                            width: colWidth,
                            render: (val: any, record: any) => renderTableCell(val, record, xh.main, undefined)
                        };
                    }
                }),
                {
                    title: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.2 }}>合计</div>,
                    dataIndex: 'total',
                    key: 'total',
                    align: 'center' as const,
                    width: colWidth,
                    render: (val: any, record: any) => {
                        const numVal = typeof val === 'number' ? val : 0;
                        if (numVal === 0) return <span style={{ color: '#bfbfbf' }}>0</span>;
                        return (
                            <a
                                style={{ fontWeight: 'bold', color: '#141414' }}
                                onClick={() => handleChartClick({
                                    value: numVal,
                                    name: record.name,
                                    parentName: record.parentName,
                                    parentName2: record.parentName2
                                }, type, filters, xAxisDim, groups, xAxisGroups)}
                            >
                                {numVal}
                            </a>
                        );
                    }
                }
            ];
        } else {
            // 1D Table (with potential sub-dimensions)
            const mainYValues = Array.from(new Set(data.filter(i => !i.parent_y).map(item => item.name)));

            dataSource = mainYValues.map((y, idx) => {
                const row: any = { key: `main_${idx}`, name: y, total: data.find(d => d.name === y && !d.parent_y)?.value || 0, dimension: type };

                // Level 2
                const ySubs = Array.from(new Set(data.filter(i => i.parent_y === y && !i.parent_y_2).map(item => item.name)));
                if (ySubs.length > 0) {
                    row.children = ySubs.map((ySub, subIdx) => {
                        const groupConfig = groups?.find(g => g.label === y);
                        const subDim = groupConfig?.subDimension || type;
                        const childRow: any = {
                            key: `sub_${idx}_${subIdx}`,
                            name: ySub,
                            parentName: y,
                            isSub: true,
                            dimension: subDim,
                            total: data.find(d => d.name === ySub && d.parent_y === y && !d.parent_y_2)?.value || 0
                        };

                        // Level 3
                        const subGroupConfig = groupConfig?.subGroups?.find(sg => sg.label === ySub);
                        const subSubDim = subGroupConfig?.subDimension || subDim;
                        const ySubSubs = Array.from(new Set(data.filter(i => i.parent_y === y && i.parent_y_2 === ySub).map(item => item.name)));
                        if (ySubSubs.length > 0) {
                            childRow.children = ySubSubs.map((ySubSub, subSubIdx) => ({
                                key: `subsub_${idx}_${subIdx}_${subSubIdx}`,
                                name: ySubSub,
                                parentName: y,
                                parentName2: ySub,
                                isSub: true,
                                dimension: subSubDim,
                                total: data.find(d => d.name === ySubSub && d.parent_y === y && d.parent_y_2 === ySub)?.value || 0
                            }));
                        }
                        return childRow;
                    });
                }
                return row;
            }).sort((a, b) => {
                if (groups && groups.length > 0) {
                    const yRefOrder = groups.map(g => g.label);
                    const indexA = yRefOrder.indexOf(a.name);
                    const indexB = yRefOrder.indexOf(b.name);
                    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
                    if (indexA !== -1) return -1;
                    if (indexB !== -1) return 1;
                }
                const isYTimeDim = type === 'created_at_day' || type === 'plan_fix_time_day';
                if (isYTimeDim) return String(a.name).localeCompare(String(b.name));
                return b.total - a.total;
            });

            cols = [
                {
                    title: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.2 }}>{dimensionLabel}</div>,
                    dataIndex: 'name',
                    key: 'name',
                    align: 'center' as const,
                    width: '50%',
                    render: (val: string, record: any) => {
                        const label = getDisplayLabel(val, record.dimension || type, dicts);
                        const displayLabel = typeof label === 'string' ? label.replace(/\\n/g, '\n') : label;
                        return (
                            <Text strong={!record.isSub && record.children?.length > 0} style={{ fontSize: record.isSub ? 11 : 12, color: record.isSub ? '#666' : 'inherit' }}>
                                {displayLabel}
                            </Text>
                        );
                    }
                },
                {
                    title: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: 1.2 }}>数量</div>,
                    dataIndex: 'total',
                    key: 'total',
                    align: 'center' as const,
                    width: '50%',
                    render: (val: number, record: any) => (
                        <a
                            style={{ fontWeight: record.children?.length > 0 ? 'bold' : 'normal' }}
                            onClick={() => handleChartClick({
                                value: val,
                                name: record.name,
                                parentName: record.parentName,
                                parentName2: record.parentName2
                            }, type, filters, undefined, groups, xAxisGroups)}
                        >
                            {val}
                        </a>
                    )
                }
            ];
        }

        return (
            <Table
                dataSource={dataSource}
                columns={cols}
                pagination={false}
                size="small"
                bordered
                className="compact-table"
                tableLayout="fixed"
                style={{ marginBottom: 0 }}
            />
        );
    };

    const fetchModalIssues = async (title: string, query: URLSearchParams) => {
        setModalTitle(title);
        setModalVisible(true);
        setModalLoading(true);
        setModalIssues([]);

        try {
            // Ensure classification permissions are enforced for dashboard drill-downs
            query.set('enforce_category_permission', 'true');
            const res = await fetch(`/PAMS/api/issues?${query.toString()}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            if (data.success && data.data) {
                setModalIssues(data.data.items);
            } else {
                message.error(`获取问题列表失败: ${data.error || '服务器返回错误'}`);
            }
        } catch (error) {
            console.error('Fetch modal issues error:', error);
            message.error(`获取问题列表失败: ${error instanceof Error ? error.message : '网络连接异常'}`);
        } finally {
            setModalLoading(false);
        }
    };

    const handleCardClick = (title: string, value: number, row: any, col: any) => {
        if (!value || value === 0) return;

        const query = new URLSearchParams();
        query.append('page', '1');
        query.append('pageSize', '5000');
        if (selectedRound && selectedRound.length > 0) query.append('round', selectedRound.join(','));
        if (selectedBusinessGroup && selectedBusinessGroup.length > 0) query.append('business_group', selectedBusinessGroup.join(','));

        // Row filters
        const rowFilters = getBoardCellQueryParams(activeBoardConfig.rowConfig.dimension, row);
        Object.entries(rowFilters).forEach(([k, v]) => query.append(k, v));

        // Column filters
        const colFilters = getBoardCellQueryParams(activeBoardConfig.columnConfig.dimension, col);
        Object.entries(colFilters).forEach(([k, v]) => query.append(k, v));

        fetchModalIssues(`${title} - 问题列表`, query);
    };

    const modalColumns = [
        {
            title: '编号',
            dataIndex: 'issue_id',
            key: 'issue_id',
            width: 140,
            render: (text: string, record: any) => (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <a onClick={async () => {
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
                        } finally { hide(); }
                    }}>
                        {text}
                    </a>
                    {record.work_order_no && (
                        <div
                            style={{
                                fontSize: '10px',
                                color: '#8c8c8c',
                                marginTop: '1px',
                                lineHeight: '1.4',
                                maxWidth: '120px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                paddingBottom: '1px'
                            }}
                            title={record.work_order_no}
                        >
                            {record.work_order_no}
                        </div>
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
            title: '创建时间',
            dataIndex: 'create_time',
            key: 'create_time',
            width: 150,
            render: (text: string) => text?.substring(0, 10),
        },
    ];

    const statLabelStyle: React.CSSProperties = {
        fontSize: screens.xs ? 12 : 13,
        color: '#666',
        whiteSpace: 'nowrap',
    };

    return (
        <div className={`${styles.dashboardContainer} pams-shell`} style={{ paddingBottom: 60 }}>
            {/* 问题数据看板 */}
            <Card title={screens.xs ? null : "问题数据看板"} extra={
                <div style={{ display: 'flex', alignItems: 'center', gap: screens.xs ? 4 : 8 }}>
                    {isAdmin && (
                        <AntButton type="text" icon={<SettingOutlined />} size="small" onClick={() => setConfigDrawerVisible(true)} />
                    )}
                    <AntButton type="text" icon={<SyncOutlined spin={loading} />} size="small" onClick={handleRefresh} />
                    <Select
                        mode="multiple"
                        style={{ width: screens.xs ? 130 : 140 }}
                        placeholder="轮次"
                        allowClear
                        value={selectedRound}
                        onChange={setSelectedRound}
                        size="small"
                        maxTagCount={screens.xs ? 1 : 'responsive'}
                    >
                        {dicts.issue_round.map(d => <Select.Option key={d.item_key} value={d.item_key}>{d.item_value}</Select.Option>)}
                    </Select>
                    <Select
                        mode="multiple"
                        style={{ width: screens.xs ? 105 : 140 }}
                        placeholder="机构"
                        allowClear
                        value={selectedBusinessGroup}
                        onChange={setSelectedBusinessGroup}
                        size="small"
                        maxTagCount={screens.xs ? 1 : 'responsive'}
                    >
                        {dicts.business_group.map(d => <Select.Option key={d.item_key} value={d.item_key}>{d.item_value}</Select.Option>)}
                    </Select>
                </div>
            } style={{ marginBottom: 24, borderRadius: 12 }} size="small">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(() => {
                        const allCols = activeBoardConfig.columnConfig.items;
                        const totalCol = allCols.find(c => c.values.includes('__ALL__'));
                        
                        // Filter out columns that are all 0 across all rows
                        const visibleOtherCols = allCols.filter(c => !c.values.includes('__ALL__')).filter(col => {
                            return activeBoardConfig.rowConfig.items.some(r => {
                                const val = computeBoardCellValue(col, r, activeBoardConfig.columnConfig.dimension, activeBoardConfig.rowConfig.dimension, categoryGroups, { total: totalAll, resolved: resolvedAll, pending: unresolvedAll }, stats?.categoryGroupByStatus, stats?.boardPivot);
                                return val > 0;
                            });
                        });
                        const otherColsCount = visibleOtherCols.length;

                        return activeBoardConfig.rowConfig.items.map((row, rowIdx) => {
                            const otherCols = visibleOtherCols;

                            return (
                            <div key={row.id} style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 8,
                                marginBottom: rowIdx < activeBoardConfig.rowConfig.items.length - 1 ? 4 : 0
                            }}>
                                {/* 总数/合计列 - 具有较小的基础宽度，但在折行时会撑满 */}
                                {totalCol && (() => {
                                    const col = totalCol;
                                    const value = computeBoardCellValue(col, row, activeBoardConfig.columnConfig.dimension, activeBoardConfig.rowConfig.dimension, categoryGroups, { total: totalAll, resolved: resolvedAll, pending: unresolvedAll }, stats?.categoryGroupByStatus, stats?.boardPivot);
                                    const isAllRow = row.values.includes('__ALL__');
                                    const displayIcon = isAllRow ? (ICON_MAP[col.icon || ''] || <FileTextOutlined />) : (row.values.includes('已解决') ? <CheckCircleOutlined /> : <ClockCircleOutlined />);

                                    // 计算 1.5 倍宽度的百分比
                                    const totalUnits = 1.5 + otherColsCount;
                                    const firstColBasis = (1.5 / totalUnits) * 100;

                                    return (
                                        <div
                                            key={col.id}
                                            style={{
                                                flex: screens.xs ? '0 0 100%' : `1 1 ${firstColBasis}%`,
                                                minWidth: screens.xs ? '100%' : 140,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    ...statCardStyle,
                                                    borderLeft: `3px solid ${row.color}`,
                                                    background: 'var(--radar-surface)',
                                                    cursor: value > 0 ? 'pointer' : 'default',
                                                    padding: screens.xs ? '8px 12px' : '10px 12px',
                                                    height: '100%',
                                                    minHeight: 48
                                                }}
                                                onClick={() => handleCardClick(`${col.label} - ${row.label}`, value, row, col)}
                                            >
                                                <div style={statLeftStyle}>
                                                    {React.cloneElement(displayIcon as React.ReactElement, { style: { fontSize: 18, color: row.color } })}
                                                    <span style={statLabelStyle}>{screens.xs ? row.label : `${row.label}${isAllRow ? '概况' : ''}`}</span>
                                                </div>
                                                <p style={{ ...statValueStyle, color: row.color, fontSize: 18 }}>{value}</p>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* 其它分类列容器 - 具有较低的基础宽度需求，允许尽可能挤在同一行 */}
                                <div style={{
                                    flex: screens.xs ? '1 1 100%' : `999 1 ${otherColsCount * 80}px`,
                                    display: 'flex',
                                    flexWrap: screens.xs ? 'wrap' : 'nowrap',
                                    gap: 8,
                                    minWidth: screens.xs ? '100%' : 200
                                }}>
                                    {otherCols.map((col) => {
                                        const value = computeBoardCellValue(col, row, activeBoardConfig.columnConfig.dimension, activeBoardConfig.rowConfig.dimension, categoryGroups, { total: totalAll, resolved: resolvedAll, pending: unresolvedAll }, stats?.categoryGroupByStatus, stats?.boardPivot);
                                        const isAllRow = row.values.includes('__ALL__');
                                        const displayIcon = isAllRow ? (ICON_MAP[col.icon || ''] || <FileTextOutlined />) : (row.values.includes('已解决') ? <CheckCircleOutlined /> : <ClockCircleOutlined />);

                                        const otherColBasis = (1 / (1.5 + otherColsCount)) * 100;

                                        return (
                                            <div
                                                key={col.id}
                                                style={{
                                                    flex: screens.xs ? `0 0 calc(${otherColsCount <= 5 ? (100 / otherColsCount) : 33.33}% - 6px)` : `1 1 ${otherColBasis}%`,
                                                    minWidth: screens.xs ? undefined : 60
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        ...statCardStyle,
                                                        borderLeft: '1px solid var(--radar-border)',
                                                        background: 'var(--radar-surface)',
                                                        cursor: value > 0 ? 'pointer' : 'default',
                                                        flexDirection: (screens.xs || !screens.xl) ? 'column' : 'row',
                                                        padding: (screens.xs || !screens.xl) ? '4px 4px' : '8px 10px',
                                                        height: '100%',
                                                        minHeight: 48,
                                                        justifyContent: (screens.xs || !screens.xl) ? 'center' : 'space-between'
                                                    }}
                                                    onClick={() => handleCardClick(`${col.label} - ${row.label}`, value, row, col)}
                                                >
                                                    <div style={{
                                                        ...statLeftStyle,
                                                        flexDirection: (screens.xs || !screens.xl) ? 'column' : 'row',
                                                        gap: (screens.xs || !screens.xl) ? 2 : 6,
                                                        overflow: 'hidden',
                                                        alignItems: 'center'
                                                    }}>
                                                        {React.cloneElement(displayIcon as React.ReactElement, { style: { fontSize: (screens.xs || !screens.xl) ? 16 : 18, color: col.color } })}
                                                        <span style={{
                                                            ...statLabelStyle,
                                                            fontSize: (screens.xs || !screens.xl) ? 11 : 12,
                                                            textAlign: 'center'
                                                        }}>{col.label}</span>
                                                    </div>
                                                    <p style={{
                                                        ...statValueStyle,
                                                        color: col.color,
                                                        fontSize: (screens.xs || !screens.xl) ? 16 : 18,
                                                        margin: 0
                                                    }}>{value}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                        });
                    })()}
                </div>
            </Card>

            <Card style={{ marginBottom: 24, borderRadius: 12 }} size="small">
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ padding: '4px 0' }}>
                        <span style={{ fontWeight: 500 }}>图表数据筛选：</span>
                    </div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 200, padding: '4px 0' }}>
                        <AntSpace size={screens.xs ? 4 : 8} wrap={!screens.xs}>
                            {activeBoardConfig.rowConfig.items.map(row => {
                                const isSelected = statusFilter.includes(row.id);
                                return (
                                    <AntButton
                                        key={row.id}
                                        type={isSelected ? 'primary' : 'default'}
                                        onClick={() => handleFilterToggle(row.id)}
                                        size={screens.xs ? "small" : "middle"}
                                        style={{
                                            borderRadius: 8,
                                            height: screens.xs ? 'auto' : undefined,
                                            padding: screens.xs ? '4px 6px' : undefined,
                                            lineHeight: screens.xs ? '1.1' : undefined,
                                            whiteSpace: screens.xs ? 'normal' : 'nowrap',
                                            fontSize: screens.xs ? 12 : undefined,
                                            textAlign: 'center',
                                            minWidth: screens.xs ? 45 : undefined
                                        }}
                                    >
                                        {row.label}
                                    </AntButton>
                                );
                            })}
                        </AntSpace>
                    </div>
                </div>
            </Card>

            <Spin spinning={loading}>
                {sections.map(section => (
                    <div key={`${section.id}_${refreshKey}`}>
                        <div className="section-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Typography.Title level={4} style={{ margin: 0 }}>{section.title}</Typography.Title>
                                <AntButton type="text" icon={<SyncOutlined />} size="small"
                                    onClick={() => setRefreshKey(k => k + 1)}
                                    style={{ opacity: 0.6 }}
                                />
                            </div>
                            {((section.type === 'system' && isAdmin) || section.type === 'user') && (
                                <AntButton type="primary" ghost icon={<PlusOutlined />} size="small"
                                    style={{ opacity: 0.7 }}
                                    onClick={() => {
                                        setEditingSectionId(section.id);
                                        setEditingChart(undefined);
                                        setChartEditorVisible(true);
                                    }}
                                >新增图表</AntButton>
                            )}
                        </div>
                        <Row gutter={[24, 24]}>
                            {(() => {
                                // Calculate row heights for sync
                                const rowHeightMap: Record<string, number> = {};
                                let currentSpan = 0;
                                let currentRow: ChartConfig[] = [];

                                section.charts.forEach((chart, idx) => {
                                    const span = chart.colSpan || 24;
                                    if (currentSpan + span > 24) {
                                        // Process previous row
                                        const validHeights = currentRow.map(c => c.height).filter(h => h !== 0).map(h => h || 220);
                                        const maxHeight = validHeights.length > 0 ? Math.max(...validHeights) : 220;
                                        currentRow.forEach(c => {
                                            rowHeightMap[c.id] = c.height === 0 ? 0 : maxHeight;
                                        });
                                        // Start new row
                                        currentRow = [chart];
                                        currentSpan = span;
                                    } else {
                                        currentRow.push(chart);
                                        currentSpan += span;
                                    }

                                    // Handle last row
                                    if (idx === section.charts.length - 1) {
                                        const validHeights = currentRow.map(c => c.height).filter(h => h !== 0).map(h => h || 220);
                                        const maxHeight = validHeights.length > 0 ? Math.max(...validHeights) : 220;
                                        currentRow.forEach(c => {
                                            rowHeightMap[c.id] = c.height === 0 ? 0 : maxHeight;
                                        });
                                    }
                                });

                                return section.charts.map((chart, chartIdx) => (
                                    <Col key={chart.id} xs={24} lg={chart.colSpan}>
                                        <DashboardChartComponent
                                            chart={chart}
                                            baseFilters={memoizedBaseFilters}
                                            isEditable={((section.type === 'system' && isAdmin) || section.type === 'user')}
                                            onEdit={() => {
                                                setEditingSectionId(section.id);
                                                setEditingChart(chart);
                                                setChartEditorVisible(true);
                                            }}
                                            onDelete={() => handleDeleteChart(section.id, chart.id)}
                                            onMove={(direction) => handleMoveChart(section.id, chart.id, direction)}
                                            isFirst={chartIdx === 0}
                                            isLast={chartIdx === section.charts.length - 1}
                                            onChartClick={handleChartClick}
                                            renderTable={renderStatTable}
                                            dicts={dicts}
                                            forcedHeight={screens.lg ? rowHeightMap[chart.id] : undefined}
                                        />
                                    </Col>
                                ));
                            })()}
                        </Row>
                    </div>
                ))}
            </Spin>

            {/* 弹窗 - 问题列表 */}
            <Modal
                title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileTextOutlined style={{ color: '#1677ff' }} /> {modalTitle}</div>}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                footer={null}
                width={1000}
                maskClosable={false}
                destroyOnHidden={true}
                styles={{ body: { padding: (screens.xs || (screens.sm && !screens.md)) ? '4px' : '24px', minHeight: '200px' } }}
            >
                {screens.xs || (screens.sm && !screens.md) ? (
                    <List
                        grid={{ gutter: 8, column: 1 }}
                        dataSource={modalIssues}
                        loading={modalLoading}
                        pagination={{
                            pageSize: modalPageSize,
                            size: 'small',
                            showSizeChanger: true,
                            onShowSizeChange: (_, size) => setModalPageSize(size),
                            onChange: (page, size) => setModalPageSize(size)
                        }}
                        renderItem={item => {
                            const sysName = dicts.system.find(d => d.item_key === item.system)?.item_value || item.system || '-';
                            const bgDisplay = dicts.business_group.find(d => d.item_key === item.business_group)?.item_value;

                            return (
                                <List.Item
                                    onClick={async () => {
                                        const hide = message.loading('加载中...');
                                        try {
                                            const res = await fetch(`/PAMS/api/issues/${item.issue_id}`);
                                            const data = await res.json();
                                            if (data.success) { setSelectedIssue(data.data); setDetailVisible(true); }
                                        } finally { hide(); }
                                    }}
                                    style={{ cursor: 'pointer', padding: '0' }}
                                >
                                    <Card size="small" title={<AntSpace><Text strong color="primary">{item.issue_id}</Text><span className={`${styles.statusBadge}`}>{item.status}</span></AntSpace>}>
                                        <div style={{ marginBottom: 8 }}><Text strong>{item.summary}</Text></div>
                                        <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                                            <span className={styles.systemName}>{sysName}</span>
                                            {bgDisplay && <span className={styles.tagGray}>{bgDisplay}</span>}
                                        </div>
                                    </Card>
                                </List.Item>
                            );
                        }}
                    />
                ) : (
                    <Table
                        dataSource={modalIssues}
                        columns={modalColumns}
                        rowKey="issue_id"
                        loading={modalLoading}
                        pagination={{
                            pageSize: modalPageSize,
                            showSizeChanger: true,
                            onShowSizeChange: (_, size) => setModalPageSize(size),
                            onChange: (page, size) => setModalPageSize(size)
                        }}
                        size="small"
                    />
                )}
            </Modal>

            {/* 问题详情/编辑器等 */}
            <Drawer
                open={detailVisible}
                onClose={() => setDetailVisible(false)}
                title="问题详情"
                zIndex={2000}
                styles={{ body: { padding: 0 }, wrapper: { width: '800px', maxWidth: '100vw' } }}
            >
                {selectedIssue && (
                    <IssueDetailView
                        issueId={selectedIssue.issue_id}
                        dicts={dicts}
                        user={user}
                        onRefresh={() => fetchStats(selectedRound, selectedBusinessGroup)}
                    />
                )}
            </Drawer>

            <DashboardConfigModal
                open={configDrawerVisible}
                onClose={() => setConfigDrawerVisible(false)}
                config={systemConfig}
                onSave={handleSaveBoardConfig}
                dicts={dicts}
            />

            <ChartEditor
                open={chartEditorVisible}
                onClose={() => {
                    setChartEditorVisible(false);
                    setEditingChart(undefined);
                }}
                onSave={handleSaveChart}
                initialData={editingChart}
                dicts={dicts}
                boardConfig={activeBoardConfig}
            />
        </div>
    );
}

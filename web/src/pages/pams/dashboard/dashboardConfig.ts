/**
 * @file dashboardConfig.ts
 * @description PAMS 系统功能页面 / 提供 [dashboard/dashboardConfig.ts] 相关的业务操作 UI 界面
 * @author hengguan
 * @date 2026-05-20
 */

// Dashboard configuration types and defaults

// ---- 看板单元格定义 (通用) ----
export interface BoardCellDef {
    id: string;
    label: string;           // 显示名称
    values: string[];        // 包含哪些原始值, '__ALL__' = 合计
    color: string;           // 主色调
    icon?: string;           // antd icon 名称 (通常用于列)
    bgColor?: string;        // 背景色 (通常用于行首卡片)
}

// ---- 看板维度配置 ----
export interface BoardDimensionConfig {
    dimension: ChartDimension;
    items: BoardCellDef[];
}

// ---- 图表数据维度 ----
export type ChartDimension =
    | 'status'                  // 状态
    | 'category'                // 分类
    | 'detailed_classification' // 详细分类
    | 'urgency'                 // 紧急程度
    | 'handling_method'         // 处理方式
    | 'business_group'          // 实施机构
    | 'module'                  // 所属板块
    | 'system'                  // 所属系统
    | 'round'                   // 轮次
    | 'created_at_day'          // 问题提出时间
    | 'plan_fix_time_day';      // 计划解决时间

// ---- 图表类型 ----
export type ChartType = 'pie' | 'bar' | 'horizontal_bar' | 'stacked_bar' | 'stacked_bar_horizontal' | 'line' | 'area' | 'table';

export interface ChartGroupDef {
    label: string;
    values: string[]; // 包含的原始值
    color?: string;   // 自定义颜色
    subDimension?: ChartDimension; // 二级维度
    subGroups?: ChartGroupDef[];   // 二级维度的分组
}

// ---- 图表配置 ----
export interface ChartConfig {
    id: string;
    title: string;
    dimension: ChartDimension;   // 垂直维度 (Y轴)
    xAxisDimension?: ChartDimension; // 水平维度 (X轴)，用于表格和堆叠图
    chartType: ChartType;
    colSpan: number;             // 12=半宽, 24=全宽
    height: number;              // 图表高度 px
    filters?: Record<string, any>; // 局部过滤器
    groups?: ChartGroupDef[];      // 主要维度 (Y轴) 分组定义
    xAxisGroups?: ChartGroupDef[]; // 次要维度 (X轴) 分组定义
}

// ---- 看板分区 ----
export interface DashboardSection {
    id: string;
    title: string;
    type: 'system' | 'user';     // 系统图表 or 我的图表
    charts: ChartConfig[];
}

// ---- 完整仪表盘配置 ----
export interface DashboardConfig {
    board: {
        columnConfig: BoardDimensionConfig;
        rowConfig: BoardDimensionConfig;
    };
    sections: DashboardSection[]; // 替代原来的 charts 数组
}

// ---- 维度选项 ----
export const DIMENSION_OPTIONS: { value: ChartDimension; label: string }[] = [
    { value: 'status', label: '问题状态' },
    { value: 'category', label: '问题分类' },
    { value: 'detailed_classification', label: '详细分类' },
    { value: 'urgency', label: '紧急程度' },
    { value: 'handling_method', label: '处理方式' },
    { value: 'business_group', label: '实施机构' },
    { value: 'module', label: '所属模块' },
    { value: 'system', label: '所属系统' },
    { value: 'round', label: '轮次' },
    { value: 'created_at_day', label: '问题提出时间 (按天)' },
    { value: 'plan_fix_time_day', label: '计划解决时间 (按天)' },
];

// ---- 图表类型选项 ----
export const CHART_TYPE_OPTIONS: { value: ChartType; label: string }[] = [
    { value: 'pie', label: '饼图' },
    { value: 'bar', label: '柱状图' },
    { value: 'horizontal_bar', label: '横向柱状图' },
    { value: 'stacked_bar', label: '堆叠柱状图 (纵向)' },
    { value: 'stacked_bar_horizontal', label: '堆叠柱状图 (横向)' },
    { value: 'line', label: '折线图' },
    { value: 'area', label: '面积图' },
    { value: 'table', label: '表格' },
];

// ---- 可选图标 ----
export const ICON_OPTIONS = [
    'FileTextOutlined', 'BankOutlined', 'TeamOutlined',
    'BulbOutlined', 'AppstoreOutlined', 'CheckCircleOutlined',
    'ClockCircleOutlined', 'ExclamationCircleOutlined',
    'StarOutlined', 'ThunderboltOutlined',
];

// ---- 原始分类 → 分组映射 ----
// 此映射与后端 SQL 中的 CASE 逻辑保持一致
export function categoryToGroup(category: string): string {
    // 如果已经是分组名，直接返回
    if (['金科', '农信', '需求', '其它'].includes(category)) return category;
    // 原始分类映射
    if (category === '金科技术') return '金科';
    if (['农信技术', '农信业务'].includes(category)) return '农信';
    if (category === '新增需求') return '需求';
    return '其它';
}

// ---- 默认配置 ----
export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
    board: {
        columnConfig: {
            dimension: 'category',
            items: [
                {
                    id: 'col_total',
                    label: '问题总数',
                    values: ['__ALL__'],
                    color: 'rgba(22, 119, 255, 0.85)',
                    icon: 'FileTextOutlined',
                },
                {
                    id: 'col_jinke',
                    label: '金科',
                    values: ['金科技术'],
                    color: 'rgba(22, 119, 255, 0.85)',
                    icon: 'BankOutlined',
                },
                {
                    id: 'col_nongxin',
                    label: '农信',
                    values: ['农信技术', '农信业务'],
                    color: 'rgba(245, 34, 45, 0.8)',
                    icon: 'TeamOutlined',
                },
                {
                    id: 'col_demand',
                    label: '需求',
                    values: ['新增需求'],
                    color: 'rgba(255, 107, 0, 0.9)',
                    icon: 'BulbOutlined',
                },
                {
                    id: 'col_other',
                    label: '其它',
                    values: ['其它'],
                    color: 'rgba(140, 140, 140, 0.85)',
                    icon: 'AppstoreOutlined',
                },
            ]
        },
        rowConfig: {
            dimension: 'status',
            items: [
                {
                    id: 'row_total',
                    label: '总数',
                    values: ['__ALL__'],
                    color: 'rgba(22, 119, 255, 0.85)',
                    bgColor: 'rgba(230, 247, 255, 0.6)',
                },
                {
                    id: 'row_resolved',
                    label: '已解决',
                    values: ['已解决'],
                    color: 'rgba(82, 196, 26, 0.85)',
                    bgColor: 'rgba(246, 255, 237, 0.6)',
                },
                {
                    id: 'row_unresolved',
                    label: '未解决',
                    values: ['提出', '处理中', '待验证', '重现', '已查明原因'],
                    color: 'rgba(250, 173, 20, 0.85)',
                    bgColor: 'rgba(255, 251, 230, 0.6)',
                },
            ]
        }
    },
    sections: [
        {
            id: 'section_system',
            title: '系统图表',
            type: 'system',
            charts: [
                {
                    id: 'chart_category',
                    title: '问题分类概况',
                    dimension: 'category',
                    chartType: 'pie',
                    colSpan: 12,
                    height: 350,
                },
                {
                    id: 'chart_detailed',
                    title: '问题详细分类',
                    dimension: 'detailed_classification',
                    chartType: 'horizontal_bar',
                    colSpan: 12,
                    height: 350,
                }
            ]
        },
        {
            id: 'section_user',
            title: '我的图表',
            type: 'user',
            charts: []
        }
    ],
};

// ---- 工具函数 ----

// 迁移旧配置格式
export function migrateConfig(config: any): DashboardConfig {
    if (!config) return DEFAULT_DASHBOARD_CONFIG;

    // 1. 迁移 board 配置 (从 hardcoded category/status 到 generic dimension items)
    if (config.board && (!config.board.columnConfig || !config.board.rowConfig)) {
        const oldBoard = config.board;
        const newBoard: DashboardConfig['board'] = {
            columnConfig: {
                dimension: 'category',
                items: (oldBoard.columns || DEFAULT_DASHBOARD_CONFIG.board.columnConfig.items).map((col: any) => ({
                    id: col.id,
                    label: col.label,
                    values: col.categoryGroups || col.values || ['__ALL__'],
                    color: col.color,
                    icon: col.icon
                }))
            },
            rowConfig: {
                dimension: 'status',
                items: (oldBoard.rows || DEFAULT_DASHBOARD_CONFIG.board.rowConfig.items).map((row: any) => ({
                    id: row.id,
                    label: row.label,
                    values: row.statuses || row.values || ['__ALL__'],
                    color: row.color,
                    bgColor: row.bgColor
                }))
            }
        };
        config.board = newBoard;
    }

    // 2. 迁移 charts → sections
    if (config.charts && !config.sections) {
        const systemCharts: ChartConfig[] = [];
        const userCharts: ChartConfig[] = [];

        config.charts.forEach((chart: any) => {
            // 映射 dataSource 到 dimension
            let dimension: ChartDimension = 'category';
            if (chart.dataSource === 'byUrgency') dimension = 'urgency';
            else if (chart.dataSource === 'byHandlingMethod') dimension = 'handling_method';
            else if (chart.dataSource === 'bySystem') dimension = 'system';
            else if (chart.dataSource === 'byStatus') dimension = 'status';
            else if (chart.dataSource === 'byCombinedDetailedClass') dimension = 'detailed_classification';
            else if (chart.dataSource === 'byJinkeDetailedClass') dimension = 'detailed_classification';
            else if (chart.dataSource === 'byNongxinDetailedClass') dimension = 'detailed_classification';
            else if (chart.dataSource === 'businessGroupStacked') dimension = 'business_group';
            else if (chart.dataSource === 'moduleStacked') dimension = 'module';
            else if (chart.dataSource === 'businessGroupTable') dimension = 'business_group';
            else if (chart.dataSource === 'moduleTable') dimension = 'module';

            const newChart: ChartConfig = {
                id: chart.id,
                title: chart.title,
                dimension: dimension,
                chartType: chart.chartType === 'stacked_bar' ? 'bar' : chart.chartType,
                colSpan: chart.colSpan,
                height: chart.height,
            };

            if (chart.id.includes('system') || chart.visible) {
                systemCharts.push(newChart);
            } else {
                userCharts.push(newChart);
            }
        });

        config.sections = [
            {
                id: 'section_system',
                title: '系统图表',
                type: 'system',
                charts: systemCharts
            },
            {
                id: 'section_user',
                title: '我的图表',
                type: 'user',
                charts: userCharts
            }
        ];
        delete config.charts;
    }

    return config as DashboardConfig;
}

// 计算看板单元格数值
export function computeBoardCellValue(
    col: BoardCellDef,
    row: BoardCellDef,
    colDim: ChartDimension,
    rowDim: ChartDimension,
    categoryGroups: Record<string, { total: number; resolved: number; unresolved: number }>,
    stats: { total: number; resolved: number; pending: number },
    categoryGroupByStatus?: { category_group: string; status: string; count: number }[],
    allRawData?: any[] // 可选，用于支持更多维度的聚合
): number {
    const colValues = col.values || ['__ALL__'];
    const rowValues = row.values || ['__ALL__'];
    const isColAll = colValues.includes('__ALL__');
    const isRowAll = rowValues.includes('__ALL__');

    // 如果都是“合计”，返回总数
    if (isColAll && isRowAll) return stats.total;

    // 特殊情况处理：保留对 category_group 的高性能映射支持
    if (colDim === 'category' && rowDim === 'status' && categoryGroupByStatus) {
        // ... 原有的逻辑，但适配新的字段名 ...
        const groups = new Set<string>();
        if (isColAll) {
            groups.add('__ALL__');
        } else {
            for (const cat of colValues) {
                groups.add(categoryToGroup(cat));
            }
        }

        const statuses = rowValues;

        if (groups.has('__ALL__')) {
            return categoryGroupByStatus
                .filter(d => statuses.includes(d.status))
                .reduce((sum, d) => sum + d.count, 0);
        }

        if (isRowAll) {
            let sum = 0;
            for (const group of groups) {
                sum += categoryGroups[group]?.total || 0;
            }
            return sum;
        }

        return categoryGroupByStatus
            .filter(d => groups.has(d.category_group) && statuses.includes(d.status))
            .reduce((sum, d) => sum + d.count, 0);
    }

    // 默认情况：如果有全量数据 (boardPivot)，进行通用聚合
    if (allRawData) {
        return allRawData.filter(item => {
            // 检查行匹配 (使用 boardPivot 中的通用键名 rowVal)
            if (!isRowAll) {
                const itemRowVal = item.rowVal;
                if (!rowValues.includes(itemRowVal)) return false;
            }
            // 检查列匹配 (使用 boardPivot 中的通用键名 colVal)
            if (!isColAll) {
                const itemColVal = item.colVal;
                if (!colValues.includes(itemColVal)) return false;
            }
            return true;
        }).reduce((sum, item) => sum + (item.count || 0), 0);
    }

    return 0;
}

// 获取单元格对应的查询参数
export function getBoardCellQueryParams(
    dim: ChartDimension,
    cell: BoardCellDef
): Record<string, string> {
    const values = cell.values || ['__ALL__'];
    if (values.includes('__ALL__')) return {};

    // 特殊处理分类
    if (dim === 'category') {
        const groups = Array.from(new Set(values.map(v => categoryToGroup(v))));
        return { category_group: groups.join(',') };
    }

    return { [dim]: values.join(',') };
}

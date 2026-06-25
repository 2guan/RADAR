/**
 * @file ChartEditor.tsx
 * @description PAMS 系统功能页面 / 提供 [dashboard/ChartEditor.tsx] 相关的业务操作 UI 界面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, Radio, Space, Divider, message, Card, InputNumber, Button as AntButton, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { DashboardConfig, ChartConfig, ChartDimension, ChartType } from './dashboardConfig';
import { DIMENSION_OPTIONS, CHART_TYPE_OPTIONS } from './dashboardConfig';
import type { DictItem } from '@/types';
import CustomColorPicker from './CustomColorPicker';

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

interface Props {
    open: boolean;
    onClose: () => void;
    onSave: (chart: ChartConfig) => void;
    initialData?: ChartConfig;
    dicts: Record<string, DictItem[]>;
    boardConfig: DashboardConfig['board']; // To load presets
}

export default function ChartEditor({ open, onClose, onSave, initialData, dicts, boardConfig }: Props) {
    const [form] = Form.useForm();
    const chartType = Form.useWatch('chartType', form);
    const dimension = Form.useWatch('dimension', form);
    const xAxisDimension = Form.useWatch('xAxisDimension', form);

    useEffect(() => {
        if (open) {
            if (initialData) {
                // Convert Record<string, any> to array for Form.List
                const filterList = initialData.filters
                    ? Object.entries(initialData.filters).map(([dim, val]) => {
                        // Special handling for date range: convert strings to dayjs
                        if ((dim === 'created_at_day' || dim === 'plan_fix_time_day') && Array.isArray(val) && val.length === 2) {
                            return { dim, val: [dayjs(val[0]), dayjs(val[1])] };
                        }
                        return { dim, val };
                    })
                    : [];
                form.setFieldsValue({
                    ...initialData,
                    filterList,
                    groups: initialData.groups || [],
                    xAxisGroups: initialData.xAxisGroups || []
                });
            } else {
                form.setFieldsValue({
                    title: '新图表',
                    dimension: 'category',
                    chartType: 'pie',
                    colSpan: 12,
                    height: 220,
                    filterList: [],
                    groups: [],
                    xAxisGroups: [],
                });
            }
        }
    }, [open, initialData, form]);

    const handleOk = async () => {
        try {
            const { filterList, groups: groupList, xAxisGroups: xAxisGroupList, ...values } = await form.validateFields();

            // Convert back to Record<string, any>
            const filters: Record<string, any> = {};
            if (filterList && Array.isArray(filterList)) {
                filterList.forEach((f: any) => {
                    if (f.dim && f.val !== undefined) {
                        // Special handling for date range: convert dayjs to strings
                        if ((f.dim === 'created_at_day' || f.dim === 'plan_fix_time_day') && Array.isArray(f.val) && f.val.length === 2) {
                            filters[f.dim] = [
                                f.val[0].format('YYYY-MM-DD'),
                                f.val[1].format('YYYY-MM-DD')
                            ];
                        } else {
                            filters[f.dim] = f.val;
                        }
                    }
                });
            }

            const processGroup = (g: any) => {
                const base = {
                    label: g.label,
                    values: g.values,
                    color: typeof g.color === 'string' ? g.color : (g.color?.toRgbString?.() || g.color)
                };
                if (values.chartType === 'table' && g.subDimension) {
                    return {
                        ...base,
                        subDimension: g.subDimension,
                        subGroups: (g.subGroups || []).filter((sg: any) => sg.label && sg.values?.length > 0).map((sg: any) => {
                            const sgBase = {
                                label: sg.label,
                                values: sg.values,
                                color: typeof sg.color === 'string' ? sg.color : (sg.color?.toRgbString?.() || sg.color)
                            };
                            if (sg.subDimension) {
                                return {
                                    ...sgBase,
                                    subDimension: sg.subDimension,
                                    subGroups: (sg.subGroups || []).filter((ssg: any) => ssg.label && ssg.values?.length > 0).map((ssg: any) => ({
                                        label: ssg.label,
                                        values: ssg.values,
                                        color: typeof ssg.color === 'string' ? ssg.color : (ssg.color?.toRgbString?.() || ssg.color)
                                    }))
                                };
                            }
                            return sgBase;
                        })
                    };
                }
                return base;
            };

            const groups = (groupList || [])
                .filter((g: any) => g.label && g.values?.length > 0)
                .map(processGroup);

            const xAxisGroups = (xAxisGroupList || [])
                .filter((g: any) => g.label && g.values?.length > 0)
                .map(processGroup);

            const supportsXAxis = ['table', 'stacked_bar', 'stacked_bar_horizontal', 'line', 'area'].includes(values.chartType);

            onSave({
                ...initialData,
                ...values,
                xAxisDimension: supportsXAxis ? values.xAxisDimension : undefined,
                filters,
                groups,
                xAxisGroups: supportsXAxis ? xAxisGroups : [],
                id: initialData?.id || `chart_${Date.now()}`,
            });
            onClose();
        } catch (error: any) {
            console.error('Validation failed:', error);
            if (error.errorFields && error.errorFields.length > 0) {
                message.error(`表单验证失败: ${error.errorFields[0].errors[0]}`);
            }
        }
    };

    const getFilterOptions = (dim: string) => {
        const dictMap: Record<string, string> = {
            status: 'issue_status',
            category: 'issue_category',
            detailed_classification: 'issue_detailed_classification',
            urgency: 'issue_urgency',
            handling_method: 'issue_handling_method',
            business_group: 'business_group',
            module: 'module',
            system: 'system',
            round: 'issue_round',
        };
        const dictCode = dictMap[dim];
        const options = dictCode ? (dicts[dictCode] || []).map(d => ({ label: d.item_value || d.item_key, value: d.item_key })) : [];
        
        // Add a special "All items" option that matches the dimension itself
        // This allows users to set a global color while maintaining individual items (non-aggregating wildcard)
        const dimLabel = DIMENSION_OPTIONS.find(o => o.value === dim)?.label || dim;
        options.unshift({ label: `所有${dimLabel} (统一设置颜色)`, value: dim });
        
        // Add "Unassigned" for date dimensions
        if (dim === 'created_at_day' || dim === 'plan_fix_time_day') {
            options.push({ label: '未填写/未分配', value: '未分配' });
        }

        return options;
    };

    const handleLoadPresets = (dim: string | undefined, onSet: (presets: any[]) => void) => {
        if (!dim) return;

        // Read current filter conditions
        const filterList: { dim: string; val: string[] }[] = form.getFieldValue('filterList') || [];

        if (boardConfig?.columnConfig?.dimension === dim) {
            const presets = boardConfig.columnConfig.items
                ?.filter((col: any) => !col.values.includes('__ALL__'))
                .map((col: any) => ({
                    label: col.label,
                    values: col.values,
                    color: col.color
                })) || [];
            onSet(presets);
        } else if (boardConfig?.rowConfig?.dimension === dim) {
            const presets = boardConfig.rowConfig.items
                ?.filter((row: any) => !row.values.includes('__ALL__'))
                .map((row: any) => ({
                    label: row.label,
                    values: row.values,
                    color: row.color
                })) || [];
            onSet(presets);
        } else {
            const dictMap: Record<string, string> = {
                business_group: 'business_group',
                module: 'module',
                system: 'system',
                urgency: 'issue_urgency',
                handling_method: 'issue_handling_method',
                round: 'issue_round',
                category: 'issue_category',
                detailed_classification: 'issue_detailed_classification'
            };
            const dictCode = dictMap[dim];
            if (!dictCode || !dicts[dictCode]) {
                message.info('当前维度暂无匹配的预设配置');
                return;
            }

            let allItems = dicts[dictCode];

            // Apply filter conditions
            if (filterList.length > 0) {
                if (dim === 'system') {
                    // 3-level hierarchy stored in JSON description: {"bg": "...", "module": "..."}
                    const bgFilter = filterList.find(f => f.dim === 'business_group');
                    const moduleFilter = filterList.find(f => f.dim === 'module');
                    const systemFilter = filterList.find(f => f.dim === 'system');

                    allItems = allItems.filter(item => {
                        let parsedDesc: any = {};
                        try {
                            parsedDesc = item.description ? JSON.parse(item.description) : {};
                        } catch (e) {
                            // Fallback if description is not JSON
                            parsedDesc = { bg: item.description };
                        }

                        // Filter by Business Group
                        if (bgFilter && bgFilter.val?.length > 0) {
                            if (!bgFilter.val.includes(parsedDesc.bg)) return false;
                        }

                        // Filter by Module
                        if (moduleFilter && moduleFilter.val?.length > 0) {
                            if (!moduleFilter.val.includes(parsedDesc.module)) return false;
                        }

                        // Filter by System itself
                        if (systemFilter && systemFilter.val?.length > 0) {
                            if (!systemFilter.val.includes(item.item_key)) return false;
                        }

                        return true;
                    });
                } else if (dim === 'module') {
                    // Check if module has parent info in description
                    const bgFilter = filterList.find(f => f.dim === 'business_group');
                    const moduleFilter = filterList.find(f => f.dim === 'module');

                    allItems = allItems.filter(item => {
                        let parsedDesc: any = {};
                        try {
                            parsedDesc = item.description ? JSON.parse(item.description) : {};
                        } catch (e) {
                            parsedDesc = { bg: item.description };
                        }

                        if (bgFilter && bgFilter.val?.length > 0 && parsedDesc.bg) {
                            if (!bgFilter.val.includes(parsedDesc.bg)) return false;
                        }

                        if (moduleFilter && moduleFilter.val?.length > 0) {
                            if (!moduleFilter.val.includes(item.item_key)) return false;
                        }

                        return true;
                    });
                } else {
                    // For other dimensions, filter directly by matching filter on the same dimension
                    const sameFilter = filterList.find(f => f.dim === dim);
                    if (sameFilter && sameFilter.val?.length > 0) {
                        allItems = allItems.filter(d => sameFilter.val.includes(d.item_key));
                    }
                }
            }

            if (allItems.length === 0) {
                message.warning('当前过滤条件下没有匹配的预设项，请检查过滤条件');
                return;
            }

            const presets = allItems.map(d => ({
                label: d.item_value,
                values: [d.item_key],
                color: undefined
            }));
            onSet(presets);
            message.success(`已加载 ${presets.length} 条预设${filterList.length > 0 ? '（已按过滤条件筛选）' : ''}`);
        }
    };

    return (
        <Modal
            title={initialData ? '编辑图表' : '新增图表'}
            open={open}
            onOk={handleOk}
            onCancel={onClose}
            width={600}
            destroyOnHidden={true}
            okText="保存"
            cancelText="取消"
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    colSpan: 12,
                    height: 350,
                    chartType: 'pie'
                }}
            >
                <Form.Item
                    name="title"
                    label="图表标题"
                    rules={[{ required: true, message: '请输入图表标题' }]}
                >
                    <Input placeholder="例如：问题分类分布" />
                </Form.Item>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <Form.Item name="dimension" label="主要维度 (纵轴/分类)" rules={[{ required: true, message: '请选择主维度' }]}>
                        <Select options={DIMENSION_OPTIONS} placeholder="选择统计主维度" allowClear />
                    </Form.Item>

                    <Form.Item
                        name="chartType"
                        label="图表类型"
                        rules={[{ required: true, message: '请选择类型' }]}
                    >
                        <Select
                            options={CHART_TYPE_OPTIONS}
                            placeholder="选择展示方式"
                            onChange={(val) => {
                                const supportsXAxis = ['table', 'stacked_bar', 'stacked_bar_horizontal', 'line', 'area'].includes(val);
                                if (!supportsXAxis) {
                                    form.setFieldsValue({ xAxisDimension: undefined, xAxisGroups: [] });
                                }
                            }}
                        />
                    </Form.Item>
                </div>

                {(chartType === 'table' || chartType === 'stacked_bar' || chartType === 'stacked_bar_horizontal' || chartType === 'line' || chartType === 'area') && (
                    <Form.Item
                        name="xAxisDimension"
                        label="次要维度 (堆叠/横轴)"
                        tooltip="用于表格透视或柱状图堆叠展示"
                    >
                        <Select
                            options={[{ label: '无 (单一维度)', value: null }, ...DIMENSION_OPTIONS]}
                            placeholder="选择堆叠或横轴维度"
                            allowClear
                        />
                    </Form.Item>
                )}

                <Divider style={{ margin: '12px 0' }}>图表过滤条件</Divider>

                <Form.List name="filterList">
                    {(fields, { add, remove }) => (
                        <>
                            {fields.map(({ key, name, ...restField }) => (
                                <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                                    <Form.Item
                                        {...restField}
                                        name={[name, 'dim']}
                                        rules={[{ required: true, message: '选择维度' }]}
                                        style={{ width: 180, marginBottom: 0 }}
                                    >
                                        <Select
                                            options={DIMENSION_OPTIONS}
                                            placeholder="选择维度"
                                            onChange={() => {
                                                // Reset value when dimension changes
                                                const currentFilters = form.getFieldValue('filterList');
                                                currentFilters[name].val = undefined;
                                                form.setFieldsValue({ filterList: currentFilters });
                                            }}
                                        />
                                    </Form.Item>

                                    <Form.Item
                                        noStyle
                                        shouldUpdate={(prevValues, curValues) =>
                                            prevValues.filterList?.[name]?.dim !== curValues.filterList?.[name]?.dim
                                        }
                                    >
                                        {() => {
                                            const dim = form.getFieldValue(['filterList', name, 'dim']);
                                            if (dim === 'created_at_day' || dim === 'plan_fix_time_day') {
                                                return (
                                                    <Form.Item
                                                        {...restField}
                                                        name={[name, 'val']}
                                                        rules={[{ required: true, message: '选择时间范围' }]}
                                                        style={{ width: 280, marginBottom: 0 }}
                                                    >
                                                        <DatePicker.RangePicker size="small" style={{ width: '100%' }} />
                                                    </Form.Item>
                                                );
                                            }
                                            return (
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'val']}
                                                    rules={[{ required: true, message: '选择值' }]}
                                                    style={{ width: 280, marginBottom: 0 }}
                                                >
                                                    <Select
                                                        mode="multiple"
                                                        options={getFilterOptions(dim)}
                                                        placeholder="选择一个或多个值"
                                                        allowClear
                                                        showSearch
                                                        filterOption={(input, option) =>
                                                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase()) ||
                                                            (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                                                        }
                                                    />
                                                </Form.Item>
                                            );
                                        }}
                                    </Form.Item>

                                    <DeleteOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                                </Space>
                            ))}
                            <AntButton
                                type="dashed"
                                onClick={() => add()}
                                block
                                icon={<PlusOutlined />}
                                style={{ marginTop: 8 }}
                            >
                                添加过滤条件
                            </AntButton>
                        </>
                    )}
                </Form.List>

                <Divider style={{ margin: '12px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: 480 }}>
                        <span>主要维度分组归并 (纵轴)</span>
                        <AntButton size="small" type="link" onClick={() => handleLoadPresets(dimension, presets => form.setFieldValue('groups', presets))}>加载预设</AntButton>
                    </div>
                </Divider>

                <Form.List name="groups">
                    {(fields, { add, remove }) => (
                        <>
                            {fields.map(({ key, name, ...restField }) => (
                                <Card key={key} size="small" style={{ marginBottom: 8, background: '#fafafa' }} styles={{ body: { padding: '8px 12px' } }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'label']}
                                            rules={[{ required: true, message: '标签' }]}
                                            style={{ flex: 1, marginBottom: 0 }}
                                        >
                                            <Input placeholder="显示标签" size="small" />
                                        </Form.Item>
                                        <Form.Item
                                            {...restField}
                                            name={[name, 'color']}
                                            style={{ marginBottom: 0 }}
                                        >
                                            <CustomColorPicker size="small" allowClear />
                                        </Form.Item>
                                        <DeleteOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                                    </div>
                                    {(dimension === 'created_at_day' || dimension === 'plan_fix_time_day') && (
                                        <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>快捷选时:</span>
                                            <DatePicker.RangePicker 
                                                size="small" 
                                                style={{ flex: 1 }}
                                                placeholder={['开始', '结束']}
                                                onChange={(dates) => {
                                                    if (dates && dates[0] && dates[1]) {
                                                        const expanded = getDatesInRange(dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD'));
                                                        const currentValues = form.getFieldValue(['groups', name, 'values']) || [];
                                                        const newValues = Array.from(new Set([...currentValues, ...expanded]));
                                                        form.setFieldValue(['groups', name, 'values'], newValues);
                                                    }
                                                }}
                                            />
                                        </div>
                                    )}
                                    <Form.Item
                                        {...restField}
                                        name={[name, 'values']}
                                        rules={[{ required: true, message: '选择值' }]}
                                        style={{ marginBottom: 0 }}
                                    >
                                        <Select
                                            mode="tags"
                                            size="small"
                                            placeholder="包含的原始值"
                                            options={getFilterOptions(dimension)}
                                            maxTagCount="responsive"
                                            showSearch
                                            filterOption={(input, option) =>
                                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase()) ||
                                                (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                                            }
                                        />
                                    </Form.Item>
                                    
                                    {chartType === 'table' && (
                                        <>
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'subDimension']}
                                                style={{ marginBottom: 8 }}
                                                label={<span style={{ fontSize: 12, color: '#666' }}>二级维度</span>}
                                            >
                                                <Select
                                                    size="small"
                                                    placeholder="无二级维度"
                                                    options={[{ label: '无', value: '' }, ...DIMENSION_OPTIONS]}
                                                    allowClear
                                                />
                                            </Form.Item>

                                            <Form.Item
                                                noStyle
                                                shouldUpdate={(prevValues, curValues) => {
                                                    return prevValues?.groups?.[name]?.subDimension !== curValues?.groups?.[name]?.subDimension;
                                                }}
                                            >
                                                {() => {
                                                    const subDim = form.getFieldValue(['groups', name, 'subDimension']);
                                                    if (!subDim) return null;
                                                    return (
                                                        <div style={{ marginLeft: 16, paddingLeft: 12, borderLeft: '2px solid #e8e8e8', marginBottom: 8 }}>
                                                            <div style={{ fontSize: 12, marginBottom: 8, color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span>子维度分组归并 (必填):</span>
                                                                <AntButton size="small" type="link" onClick={() => handleLoadPresets(subDim, presets => form.setFieldValue(['groups', name, 'subGroups'], presets))}>加载预设</AntButton>
                                                            </div>
                                                            <Form.List name={[name, 'subGroups']}>
                                                                {(subFields, { add: addSub, remove: removeSub }) => (
                                                                    <>
                                                                        {subFields.map(({ key, name: subName, ...restSubField }) => (
                                                                            <div key={key} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed #e8e8e8' }}>
                                                                                <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
                                                                                    <Form.Item {...restSubField} name={[subName, 'label']} style={{ marginBottom: 0, width: 90 }} rules={[{ required: true }]}>
                                                                                        <Input size="small" placeholder="显示标签"/>
                                                                                    </Form.Item>
                                                                                    <Form.Item {...restSubField} name={[subName, 'color']} style={{ marginBottom: 0 }}>
                                                                                        <CustomColorPicker size="small" allowClear />
                                                                                    </Form.Item>
                                                                                    <Form.Item {...restSubField} name={[subName, 'values']} style={{ marginBottom: 0, flex: 1 }} rules={[{ required: true }]}>
                                                                                        <Select mode="tags" size="small" placeholder="包含项" options={getFilterOptions(subDim)} maxTagCount="responsive" />
                                                                                    </Form.Item>
                                                                                    <DeleteOutlined onClick={() => removeSub(subName)} style={{ color: '#ff4d4f' }} />
                                                                                </div>
                                                                                
                                                                                {/* Level 3 */}
                                                                                <Form.Item
                                                                                    {...restSubField}
                                                                                    name={[subName, 'subDimension']}
                                                                                    style={{ marginBottom: 8 }}
                                                                                    label={<span style={{ fontSize: 11, color: '#888' }}>三级维度</span>}
                                                                                >
                                                                                    <Select
                                                                                        size="small"
                                                                                        placeholder="无三级维度"
                                                                                        options={[{ label: '无', value: '' }, ...DIMENSION_OPTIONS]}
                                                                                        allowClear
                                                                                    />
                                                                                </Form.Item>

                                                                                <Form.Item
                                                                                    noStyle
                                                                                    shouldUpdate={(prevValues, curValues) => {
                                                                                        return prevValues?.groups?.[name]?.subGroups?.[subName]?.subDimension !== curValues?.groups?.[name]?.subGroups?.[subName]?.subDimension;
                                                                                    }}
                                                                                >
                                                                                    {() => {
                                                                                        const subSubDim = form.getFieldValue(['groups', name, 'subGroups', subName, 'subDimension']);
                                                                                        if (!subSubDim) return null;
                                                                                        return (
                                                                                            <div style={{ marginLeft: 16, paddingLeft: 12, borderLeft: '2px solid #f0f0f0', marginBottom: 8 }}>
                                                                                                <div style={{ fontSize: 11, marginBottom: 8, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                                    <span>三级分组归并 (必填):</span>
                                                                                                    <AntButton size="small" type="link" onClick={() => handleLoadPresets(subSubDim, presets => form.setFieldValue(['groups', name, 'subGroups', subName, 'subGroups'], presets))} style={{ fontSize: 11 }}>加载预设</AntButton>
                                                                                                </div>
                                                                                                <Form.List name={[subName, 'subGroups']}>
                                                                                                    {(subSubFields, { add: addSubSub, remove: removeSubSub }) => (
                                                                                                        <>
                                                                                                            {subSubFields.map(({ key: subSubKey, name: subSubName, ...restSubSubField }) => (
                                                                                                                <div key={subSubKey} style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
                                                                                                                    <Form.Item {...restSubSubField} name={[subSubName, 'label']} style={{ marginBottom: 0, width: 80 }} rules={[{ required: true }]}>
                                                                                                                        <Input size="small" placeholder="显示标签"/>
                                                                                                                    </Form.Item>
                                                                                                                    <Form.Item {...restSubSubField} name={[subSubName, 'color']} style={{ marginBottom: 0 }}>
                                                                                                                        <CustomColorPicker size="small" allowClear />
                                                                                                                    </Form.Item>
                                                                                                                    <Form.Item {...restSubSubField} name={[subSubName, 'values']} style={{ marginBottom: 0, flex: 1 }} rules={[{ required: true }]}>
                                                                                                                        <Select mode="tags" size="small" placeholder="包含项" options={getFilterOptions(subSubDim)} maxTagCount="responsive" />
                                                                                                                    </Form.Item>
                                                                                                                    <DeleteOutlined onClick={() => removeSubSub(subSubName)} style={{ color: '#ff4d4f' }} />
                                                                                                                </div>
                                                                                                            ))}
                                                                                                            <AntButton type="dashed" size="small" onClick={() => addSubSub()} block icon={<PlusOutlined />} style={{ fontSize: 11 }}>添加三级分组</AntButton>
                                                                                                        </>
                                                                                                    )}
                                                                                                </Form.List>
                                                                                            </div>
                                                                                        );
                                                                                    }}
                                                                                </Form.Item>
                                                                            </div>
                                                                        ))}
                                                                        <AntButton type="dashed" size="small" onClick={() => addSub()} block icon={<PlusOutlined />}>添加子分组</AntButton>
                                                                    </>
                                                                )}
                                                            </Form.List>
                                                        </div>
                                                    );
                                                }}
                                            </Form.Item>
                                        </>
                                    )}
                                </Card>
                            ))}
                            <AntButton type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="small">
                                添加主要维度分组
                            </AntButton>
                        </>
                    )}
                </Form.List>

                {(chartType === 'table' || chartType === 'stacked_bar' || chartType === 'stacked_bar_horizontal' || chartType === 'line' || chartType === 'area') && xAxisDimension && (
                    <>
                        <Divider style={{ margin: '12px 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: 480 }}>
                                <span>次要维度分组归并 (横轴)</span>
                                <AntButton size="small" type="link" onClick={() => handleLoadPresets(xAxisDimension, presets => form.setFieldValue('xAxisGroups', presets))}>加载预设</AntButton>
                            </div>
                        </Divider>

                        <Form.List name="xAxisGroups">
                            {(fields, { add, remove }) => (
                                <>
                                    {fields.map(({ key, name, ...restField }) => (
                                        <Card key={key} size="small" style={{ marginBottom: 8, background: '#fafafa' }} styles={{ body: { padding: '8px 12px' } }}>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'label']}
                                                    rules={[{ required: true, message: '标签' }]}
                                                    style={{ flex: 1, marginBottom: 0 }}
                                                >
                                                    <Input placeholder="显示标签" size="small" />
                                                </Form.Item>
                                                <Form.Item
                                                    {...restField}
                                                    name={[name, 'color']}
                                                    style={{ marginBottom: 0 }}
                                                >
                                                    <CustomColorPicker size="small" allowClear />
                                                </Form.Item>
                                                <DeleteOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                                            </div>
                                            {(xAxisDimension === 'created_at_day' || xAxisDimension === 'plan_fix_time_day') && (
                                                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 12, color: '#666', whiteSpace: 'nowrap' }}>快捷选时:</span>
                                                    <DatePicker.RangePicker 
                                                        size="small" 
                                                        style={{ flex: 1 }}
                                                        placeholder={['开始', '结束']}
                                                        onChange={(dates) => {
                                                            if (dates && dates[0] && dates[1]) {
                                                                const expanded = getDatesInRange(dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD'));
                                                                const currentValues = form.getFieldValue(['xAxisGroups', name, 'values']) || [];
                                                                const newValues = Array.from(new Set([...currentValues, ...expanded]));
                                                                form.setFieldValue(['xAxisGroups', name, 'values'], newValues);
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            )}
                                            <Form.Item
                                                {...restField}
                                                name={[name, 'values']}
                                                rules={[{ required: true, message: '选择值' }]}
                                                style={{ marginBottom: 0 }}
                                            >
                                                <Select
                                                    mode="tags"
                                                    size="small"
                                                    placeholder="包含的原始值"
                                                    options={getFilterOptions(xAxisDimension)}
                                                    maxTagCount="responsive"
                                                    showSearch
                                                    filterOption={(input, option) =>
                                                        (option?.label ?? '').toLowerCase().includes(input.toLowerCase()) ||
                                                        (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                                                    }
                                                />
                                            </Form.Item>

                                            {chartType === 'table' && (
                                                <>
                                                    <Form.Item
                                                        {...restField}
                                                        name={[name, 'subDimension']}
                                                        style={{ marginBottom: 8 }}
                                                        label={<span style={{ fontSize: 12, color: '#666' }}>二级维度</span>}
                                                    >
                                                        <Select
                                                            size="small"
                                                            placeholder="无二级维度"
                                                            options={[{ label: '无', value: '' }, ...DIMENSION_OPTIONS]}
                                                            allowClear
                                                        />
                                                    </Form.Item>

                                                    <Form.Item
                                                        noStyle
                                                        shouldUpdate={(prevValues, curValues) => {
                                                            return prevValues?.xAxisGroups?.[name]?.subDimension !== curValues?.xAxisGroups?.[name]?.subDimension;
                                                        }}
                                                    >
                                                        {() => {
                                                            const subDim = form.getFieldValue(['xAxisGroups', name, 'subDimension']);
                                                            if (!subDim) return null;
                                                            return (
                                                                <div style={{ marginLeft: 16, paddingLeft: 12, borderLeft: '2px solid #e8e8e8', marginBottom: 8 }}>
                                                                    <div style={{ fontSize: 12, marginBottom: 8, color: '#666', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <span>子维度分组归并 (必填):</span>
                                                                        <AntButton size="small" type="link" onClick={() => handleLoadPresets(subDim, presets => form.setFieldValue(['xAxisGroups', name, 'subGroups'], presets))}>加载预设</AntButton>
                                                                    </div>
                                                                    <Form.List name={[name, 'subGroups']}>
                                                                        {(subFields, { add: addSub, remove: removeSub }) => (
                                                                            <>
                                                                                {subFields.map(({ key, name: subName, ...restSubField }) => (
                                                                                    <div key={key} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px dashed #e8e8e8' }}>
                                                                                        <div style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
                                                                                            <Form.Item {...restSubField} name={[subName, 'label']} style={{ marginBottom: 0, width: 90 }} rules={[{ required: true }]}>
                                                                                                <Input size="small" placeholder="显示标签"/>
                                                                                            </Form.Item>
                                                                                            <Form.Item {...restSubField} name={[subName, 'color']} style={{ marginBottom: 0 }}>
                                                                                                <CustomColorPicker size="small" allowClear />
                                                                                            </Form.Item>
                                                                                            <Form.Item {...restSubField} name={[subName, 'values']} style={{ marginBottom: 0, flex: 1 }} rules={[{ required: true }]}>
                                                                                                <Select mode="tags" size="small" placeholder="包含项" options={getFilterOptions(subDim)} maxTagCount="responsive" />
                                                                                            </Form.Item>
                                                                                            <DeleteOutlined onClick={() => removeSub(subName)} style={{ color: '#ff4d4f' }} />
                                                                                        </div>
                                                                                        
                                                                                        {/* Level 3 */}
                                                                                        <Form.Item
                                                                                            {...restSubField}
                                                                                            name={[subName, 'subDimension']}
                                                                                            style={{ marginBottom: 8 }}
                                                                                            label={<span style={{ fontSize: 11, color: '#888' }}>三级维度</span>}
                                                                                        >
                                                                                            <Select
                                                                                                size="small"
                                                                                                placeholder="无三级维度"
                                                                                                options={[{ label: '无', value: '' }, ...DIMENSION_OPTIONS]}
                                                                                                allowClear
                                                                                            />
                                                                                        </Form.Item>

                                                                                        <Form.Item
                                                                                            noStyle
                                                                                            shouldUpdate={(prevValues, curValues) => {
                                                                                                return prevValues?.xAxisGroups?.[name]?.subGroups?.[subName]?.subDimension !== curValues?.xAxisGroups?.[name]?.subGroups?.[subName]?.subDimension;
                                                                                            }}
                                                                                        >
                                                                                            {() => {
                                                                                                const subSubDim = form.getFieldValue(['xAxisGroups', name, 'subGroups', subName, 'subDimension']);
                                                                                                if (!subSubDim) return null;
                                                                                                return (
                                                                                                    <div style={{ marginLeft: 16, paddingLeft: 12, borderLeft: '2px solid #f0f0f0', marginBottom: 8 }}>
                                                                                                        <div style={{ fontSize: 11, marginBottom: 8, color: '#888', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                                            <span>三级分组归并 (必填):</span>
                                                                                                            <AntButton size="small" type="link" onClick={() => handleLoadPresets(subSubDim, presets => form.setFieldValue(['xAxisGroups', name, 'subGroups', subName, 'subGroups'], presets))} style={{ fontSize: 11 }}>加载预设</AntButton>
                                                                                                        </div>
                                                                                                        <Form.List name={[subName, 'subGroups']}>
                                                                                                            {(subSubFields, { add: addSubSub, remove: removeSubSub }) => (
                                                                                                                <>
                                                                                                                    {subSubFields.map(({ key: subSubKey, name: subSubName, ...restSubSubField }) => (
                                                                                                                        <div key={subSubKey} style={{ display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center' }}>
                                                                                                                            <Form.Item {...restSubSubField} name={[subSubName, 'label']} style={{ marginBottom: 0, width: 80 }} rules={[{ required: true }]}>
                                                                                                                                <Input size="small" placeholder="显示标签"/>
                                                                                                                            </Form.Item>
                                                                                                                            <Form.Item {...restSubSubField} name={[subSubName, 'color']} style={{ marginBottom: 0 }}>
                                                                                                                                <CustomColorPicker size="small" allowClear />
                                                                                                                            </Form.Item>
                                                                                                                            <Form.Item {...restSubSubField} name={[subSubName, 'values']} style={{ marginBottom: 0, flex: 1 }} rules={[{ required: true }]}>
                                                                                                                                <Select mode="tags" size="small" placeholder="包含项" options={getFilterOptions(subSubDim)} maxTagCount="responsive" />
                                                                                                                            </Form.Item>
                                                                                                                            <DeleteOutlined onClick={() => removeSubSub(subSubName)} style={{ color: '#ff4d4f' }} />
                                                                                                                        </div>
                                                                                                                    ))}
                                                                                                                    <AntButton type="dashed" size="small" onClick={() => addSubSub()} block icon={<PlusOutlined />} style={{ fontSize: 11 }}>添加三级分组</AntButton>
                                                                                                                </>
                                                                                                            )}
                                                                                                        </Form.List>
                                                                                                    </div>
                                                                                                );
                                                                                            }}
                                                                                        </Form.Item>
                                                                                    </div>
                                                                                ))}
                                                                                <AntButton type="dashed" size="small" onClick={() => addSub()} block icon={<PlusOutlined />}>添加子分组</AntButton>
                                                                            </>
                                                                        )}
                                                                    </Form.List>
                                                                </div>
                                                            );
                                                        }}
                                                    </Form.Item>
                                                </>
                                            )}
                                        </Card>
                                    ))}
                                    <AntButton type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="small">
                                        添加次要维度分组
                                    </AntButton>
                                </>
                            )}
                        </Form.List>
                    </>
                )}

                <Divider style={{ margin: '12px 0' }} />

                <Space size="large" style={{ display: 'flex' }}>
                    <Form.Item
                        name="colSpan"
                        label="布局角色"
                        rules={[{ required: true }]}
                    >
                        <Radio.Group>
                            <Radio.Button value={12}>半宽 (50%)</Radio.Button>
                            <Radio.Button value={24}>全宽 (100%)</Radio.Button>
                        </Radio.Group>
                    </Form.Item>

                    <Form.Item
                        name="height"
                        label="图表高度 (px)"
                        rules={[{ required: true }]}
                        tooltip="设置为 0 表示自动适配高度（仅对表格有效）"
                    >
                        <InputNumber min={0} max={1000} step={50} style={{ width: 120 }} />
                    </Form.Item>
                </Space>

                <p style={{ fontSize: 12, color: '#8c8c8c', marginTop: 8 }}>
                    提示：你可以根据需要灵活组合维度和图表类型。
                </p>
            </Form>
        </Modal>
    );
}

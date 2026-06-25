/**
 * @file DictEditor.tsx
 * @description PAMS 系统功能页面 / 提供 [config/components/DictEditor.tsx] 相关的业务操作 UI 界面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useState, useEffect } from 'react';
import { 
    Table, Button, Space, Card, Modal, Form, Input, 
    InputNumber, message, Popconfirm, Tag, Tooltip, 
    Row, Col, Flex, Typography, Grid 
} from 'antd';
import { 
    PlusOutlined, DeleteOutlined, 
    UploadOutlined, DownloadOutlined, StarFilled, 
    InfoCircleOutlined, SearchOutlined, ClearOutlined
} from '@ant-design/icons';
import EditOutlined from '@ant-design/icons/EditOutlined';
import type { ColumnsType } from 'antd/es/table';
import type { DictItem, DictCode, ApiResponse } from '@/types';
import { pamsFetch } from '@/lib/api-client';

const { useBreakpoint } = Grid;
const { Title, Text } = Typography;
const fetch = pamsFetch;

export function DictEditorActionButtons({ 
    record, 
    dictCode, 
    handleEdit, 
    handleDelete, 
    handleSetDefault 
}: { 
    record: DictItem, 
    dictCode: string,
    handleEdit: (r: DictItem) => void,
    handleDelete: (id: number) => void,
    handleSetDefault?: (r: DictItem) => void
}) {
    return (
        <Space size={0}>
            {['issue_round', 'issue_category', 'issue_detailed_classification', 'issue_urgency'].includes(dictCode) && handleSetDefault && (
                <Tooltip title={record.is_default_val === 1 ? '当前为默认' : '设为默认'}>
                    <Button
                        type="link"
                        size="small"
                        icon={<StarFilled style={{ color: record.is_default_val === 1 ? '#faad14' : '#d9d9d9' }} />}
                        onClick={() => handleSetDefault(record)}
                    />
                </Tooltip>
            )}
            <Tooltip title="编辑">
                <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleEdit(record)}
                />
            </Tooltip>
            <Popconfirm
                title="确定删除此项吗？"
                onConfirm={() => handleDelete(record.dict_id)}
                disabled={dictCode === 'user_role' && ['SUPER_ADMIN', 'ADMIN', 'GUEST'].includes(record.item_key)}
            >
                <Tooltip title={dictCode === 'user_role' && ['SUPER_ADMIN', 'ADMIN', 'GUEST'].includes(record.item_key) ? '核心角色，不可删除' : '删除'}>
                    <Button
                        type="link"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={dictCode === 'user_role' && ['SUPER_ADMIN', 'ADMIN', 'GUEST'].includes(record.item_key)}
                    />
                </Tooltip>
            </Popconfirm>
        </Space>
    );
}

interface DictEditorProps {
    dictCode: DictCode;
    title: string;
    description?: string;
    extraFormItems?: React.ReactNode;
    columns?: ColumnsType<DictItem> | ((actions: { 
        handleEdit: (r: DictItem) => void, 
        handleDelete: (id: number) => void, 
        handleSetDefault: (r: DictItem) => void 
    }) => ColumnsType<DictItem>);
    onDataLoaded?: (data: DictItem[]) => void;
    batchPlaceholder?: string;
    parseBatchLine?: (line: string, index: number) => Partial<DictItem> | null;
    beforeSubmit?: (values: any) => any;
    beforeEdit?: (record: DictItem) => any;
    hideDescription?: boolean;
    itemNameLabel?: string;
    itemKeyLabel?: string;
    renderMobileCardExtra?: (item: DictItem) => React.ReactNode;
}

export default function DictEditor({ 
    dictCode, 
    title, 
    description,
    extraFormItems,
    columns: customColumns,
    onDataLoaded,
    batchPlaceholder,
    parseBatchLine,
    beforeSubmit,
    beforeEdit,
    hideDescription,
    itemNameLabel,
    itemKeyLabel,
    renderMobileCardExtra
}: DictEditorProps) {
    const screens = useBreakpoint();
    const isMobile = !screens.md;
    
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<DictItem[]>([]);
    const [filteredData, setFilteredData] = useState<DictItem[]>([]);
    const [searchText, setSearchText] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [editingItem, setEditingItem] = useState<DictItem | null>(null);
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Batch Import State
    const [batchModalVisible, setBatchModalVisible] = useState(false);
    const [batchText, setBatchText] = useState('');
    const [batchLoading, setBatchLoading] = useState(false);

    useEffect(() => {
        fetchData();
    }, [dictCode]);

    useEffect(() => {
        if (searchText) {
            const filtered = data.filter(item => 
                item.item_value.toLowerCase().includes(searchText.toLowerCase()) ||
                item.item_key.toLowerCase().includes(searchText.toLowerCase())
            );
            setFilteredData(filtered);
        } else {
            setFilteredData(data);
        }
    }, [searchText, data]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/PAMS/api/dicts?dict_code=${dictCode}`);
            const json: ApiResponse<DictItem[]> = await res.json();
            if (json.success && json.data) {
                setData(json.data);
                if (onDataLoaded) onDataLoaded(json.data);
            } else {
                message.error(json.error || '获取数据失败');
            }
        } catch (error) {
            message.error('获取数据失败');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = () => {
        setEditingItem(null);
        form.resetFields();
        form.setFieldsValue({
            dict_code: dictCode,
            sort_order: (data.length + 1) * 10,
        });
        setModalVisible(true);
    };

    const handleEdit = (record: DictItem) => {
        setEditingItem(record);
        if (beforeEdit) {
            form.setFieldsValue(beforeEdit(record));
        } else {
            form.setFieldsValue(record);
        }
        setModalVisible(true);
    };

    const handleDelete = async (id: number) => {
        try {
            const res = await fetch(`/PAMS/api/dicts/${id}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) {
                message.success('删除成功');
                fetchData();
            } else {
                message.error(json.error || '删除失败');
            }
        } catch (error) {
            message.error('删除失败');
        }
    };

    const handleSubmit = async (values: any) => {
        setSubmitting(true);
        try {
            let finalValues = { ...values, dict_code: dictCode };
            if (beforeSubmit) {
                finalValues = beforeSubmit(finalValues);
            }

            const url = editingItem
                ? `/PAMS/api/dicts/${editingItem.dict_id}`
                : '/PAMS/api/dicts';
            const method = editingItem ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalValues),
            });

            const json = await res.json();
            if (json.success) {
                message.success(editingItem ? '更新成功' : '创建成功');
                setModalVisible(false);
                fetchData();
            } else {
                message.error(json.error || '操作失败');
            }
        } catch (error) {
            message.error('操作失败');
        } finally {
            setSubmitting(false);
        }
    };

    const handleClearAll = async () => {
        try {
            const res = await fetch(`/PAMS/api/dicts/clear?code=${dictCode}`, { method: 'DELETE' });
            const json = await res.json();
            if (json.success) {
                message.success('清空成功');
                fetchData();
            } else {
                message.error(json.error || '清空失败');
            }
        } catch (error) {
            message.error('清空失败');
        }
    };

    const handleSetDefault = async (record: DictItem) => {
        try {
            const res = await fetch('/PAMS/api/dicts/default', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dict_code: dictCode,
                    item_key: record.item_key,
                }),
            });
            const json = await res.json();
            if (json.success) {
                message.success('设置默认值成功');
                fetchData();
            } else {
                message.error(json.error || '设置默认值失败');
            }
        } catch (error) {
            message.error('设置默认值失败');
        }
    };

    const handleExport = () => {
        const exportData = filteredData.map(item => ({
            '键值 (Key)': item.item_key,
            '显示值 (Value)': item.item_value,
            '排序': item.sort_order,
            '描述': item.description || '',
            '是否默认': item.is_default_val === 1 ? '是' : '否'
        }));

        const headers = ['键值 (Key)', '显示值 (Value)', '排序', '描述', '是否默认'];
        const escapeCsv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
        const csv = [
            headers.map(escapeCsv).join(','),
            ...exportData.map(row => headers.map(header => escapeCsv((row as any)[header])).join(','))
        ].join('\n');
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${title}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleBatchUpload = async () => {
        if (!batchText.trim()) {
            message.warning('请输入要导入的数据');
            return;
        }

        setBatchLoading(true);
        try {
            const lines = batchText.trim().split('\n');
            const items = lines.map((line, index) => {
                if (parseBatchLine) return parseBatchLine(line, index);
                
                const parts = line.split(/[,，\t]+/).map(s => s.trim());
                if (parts.length === 0 || !parts[0]) return null;
                
                return {
                    item_key: parts[0],
                    item_value: parts[1] || parts[0],
                    sort_order: (index + 1) * 10
                };
            }).filter(Boolean);

            if (items.length === 0) {
                message.error('无法解析数据，请检查格式');
                return;
            }

            const res = await fetch('/PAMS/api/dicts/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dict_code: dictCode, items }),
            });

            const json = await res.json();
            if (json.success) {
                message.success(json.message);
                setBatchModalVisible(false);
                setBatchText('');
                fetchData();
            } else {
                message.error(json.error || '批量导入失败');
            }
        } catch (error) {
            message.error('批量导入失败');
        } finally {
            setBatchLoading(false);
        }
    };

    const hasAnyDescription = data.some(item => item.description && item.description.trim() !== '');

    const defaultColumns: ColumnsType<DictItem> = [
        {
            title: '显示值 (Value)',
            dataIndex: 'item_value',
            key: 'item_value',
            width: 150,
            render: (text, record) => (
                <Space size={4}>
                    <span>{text}</span>
                    {record.is_default_val === 1 && <Tag color="gold" icon={<StarFilled />} style={{ margin: 0 }}>默认</Tag>}
                </Space>
            )
        },
        {
            title: '键值 (Key)',
            dataIndex: 'item_key',
            key: 'item_key',
            width: 150,
        },
        {
            title: '排序',
            dataIndex: 'sort_order',
            key: 'sort_order',
            width: 80,
            sorter: (a, b) => a.sort_order - b.sort_order,
        },
        ...(!hideDescription && hasAnyDescription ? [{
            title: '描述',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
        } as any] : []),
        {
            title: '操作',
            key: 'action',
            width: 120,
            align: 'right',
            render: (_, record) => (
                <DictEditorActionButtons 
                    record={record} 
                    dictCode={dictCode} 
                    handleEdit={handleEdit} 
                    handleDelete={handleDelete} 
                    handleSetDefault={handleSetDefault} 
                />
            ),
        },
    ];

    const columns = typeof customColumns === 'function' 
        ? customColumns({ handleEdit, handleDelete, handleSetDefault }) 
        : (customColumns || defaultColumns);

    const renderCard = (item: DictItem) => (
        <Card 
            size="small" 
            style={{ marginBottom: 12, borderRadius: 0 }}
            title={
                <Space size={4}>
                    <Text strong>{item.item_value}</Text>
                    {item.is_default_val === 1 && <StarFilled style={{ color: '#faad14' }} />}
                </Space>
            }
            extra={
                <DictEditorActionButtons 
                    record={item} 
                    dictCode={dictCode} 
                    handleEdit={handleEdit} 
                    handleDelete={handleDelete} 
                    handleSetDefault={handleSetDefault} 
                />
            }
        >
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px 0', fontSize: 13 }}>
                <Text type="secondary">{itemKeyLabel || '键值'}:</Text>
                <Text>{item.item_key}</Text>
                
                {renderMobileCardExtra && renderMobileCardExtra(item)}
                
                <Text type="secondary">排序:</Text>
                <Text>{item.sort_order}</Text>
                {!hideDescription && hasAnyDescription && item.description && (
                    <>
                        <Text type="secondary">描述:</Text>
                        <Text ellipsis>{item.description}</Text>
                    </>
                )}
            </div>

        </Card>
    );

    const isCoreRole = dictCode === 'user_role' && editingItem && ['SUPER_ADMIN', 'ADMIN', 'GUEST'].includes(editingItem.item_key);

    return (
        <div style={{ background: 'transparent' }}>
            <div style={{ marginBottom: 12 }}>
                <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                    <div>
                        <Title level={5} style={{ margin: 0, fontSize: 14 }}>{title}</Title>
                        {description && <Text type="secondary" style={{ fontSize: 12 }}>{description}</Text>}
                    </div>
                    <Space wrap style={{ marginLeft: 'auto' }}>
                        <Input
                            placeholder="搜索名称或键值..."
                            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                            allowClear
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            style={{ width: isMobile ? '100%' : 200 }}
                        />
                        <Tooltip title="导出 Excel">
                            <Button icon={<DownloadOutlined />} onClick={handleExport} />
                        </Tooltip>
                        <Popconfirm
                            title="确定清空当前列表所有自定义内容吗？"
                            onConfirm={handleClearAll}
                        >
                            <Tooltip title="清空列表">
                                <Button danger icon={<ClearOutlined />} />
                            </Tooltip>
                        </Popconfirm>
                        <Tooltip title="批量导入">
                            <Button icon={<UploadOutlined />} onClick={() => setBatchModalVisible(true)} />
                        </Tooltip>
                        <Tooltip title="新增配置">
                            <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd} />
                        </Tooltip>
                    </Space>
                </Flex>
            </div>

            {isMobile ? (
                <Table
                    dataSource={filteredData}
                    loading={loading}
                    rowKey="dict_id"
                    showHeader={false}
                    pagination={{
                        current: currentPage,
                        onChange: page => setCurrentPage(page),
                        pageSize: 10,
                        size: 'small',
                        hideOnSinglePage: true
                    }}
                    columns={[{ key: 'card', render: (_, item) => renderCard(item) }]}
                />
            ) : (
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="dict_id"
                    loading={loading}
                    size="small"
                    pagination={{
                        current: currentPage,
                        pageSize: pageSize,
                        onChange: (p, s) => { setCurrentPage(p); setPageSize(s); },
                        showSizeChanger: true,
                        showTotal: total => `共 ${total} 条`
                    }}
                />
            )}

            <Modal
                title={editingItem ? '编辑配置' : '新增配置'}
                open={modalVisible}
                onCancel={() => setModalVisible(false)}
                onOk={form.submit}
                confirmLoading={submitting}
                destroyOnHidden={true}
                forceRender
            >
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item label={itemNameLabel || "显示值"} name="item_value" rules={[{ required: true }]}>
                                <Input placeholder={itemNameLabel ? `请输入${itemNameLabel}` : "界面显示的名称"} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item label={itemKeyLabel || "键值"} name="item_key" rules={[{ required: true }]}>
                                <Input placeholder={itemKeyLabel ? `请输入${itemKeyLabel}` : "数据库存储的值"} disabled={!!isCoreRole} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Form.Item label="排序" name="sort_order" rules={[{ required: true }]}>
                        <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    {typeof extraFormItems === 'function' ? extraFormItems(editingItem) : extraFormItems}
                    {!hideDescription && (
                        <Form.Item label="描述" name="description">
                            <Input.TextArea placeholder="可选描述信息" rows={2} />
                        </Form.Item>
                    )}
                </Form>
            </Modal>

            <Modal
                title={`批量导入 - ${title}`}
                open={batchModalVisible}
                onCancel={() => setBatchModalVisible(false)}
                onOk={handleBatchUpload}
                confirmLoading={batchLoading}
                width={600}
            >
                <div style={{ marginBottom: 12 }}>
                    <AlertMessage text="支持 CSV 格式、空格或制表符分隔。格式：键值, 显示值" />
                </div>
                <Input.TextArea
                    rows={10}
                    value={batchText}
                    onChange={e => setBatchText(e.target.value)}
                    placeholder={batchPlaceholder || "例如：\nBJ, 北京\nSH, 上海"}
                />
            </Modal>
        </div>
    );
}

function AlertMessage({ text }: { text: string }) {
    return (
        <div style={{ 
            padding: '8px 12px', 
            background: 'var(--radar-primary-soft)', 
            border: '1px solid var(--radar-primary-fade)', 
            borderRadius: 0, 
            fontSize: 13,
            color: 'var(--radar-ink)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
        }}>
            <InfoCircleOutlined style={{ color: 'var(--radar-primary)' }} />
            {text}
        </div>
    );
}

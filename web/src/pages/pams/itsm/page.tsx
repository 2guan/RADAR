/**
 * @file page.tsx
 * @description PAMS ITSM 数据整合与第三方工单列表处理页面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useEffect, useState } from 'react';
import { App, Table, Button, Space, Input, message, Form, Upload, Modal, List, Card, Grid, Collapse, Tooltip, Select, Typography } from 'antd';
import styles from '../issue-table.module.css';
import { SearchOutlined, ExportOutlined, ReloadOutlined, UploadOutlined, DownloadOutlined, FilterOutlined, RobotOutlined, LinkOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { toBeijingTime } from '@/lib/timezone';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { useAuth } from '@/components/AuthProvider';
import { hasFeaturePermission } from '@/lib/permissions-client';
import { ITSM_COLUMNS } from '@/lib/itsm-mapper';
import { pamsFetch } from '@/lib/api-client';

const { useBreakpoint } = Grid;
const { Text } = Typography;
const fetch = pamsFetch;

export default function ITSMPage() {
    const { message, modal } = App.useApp();
    const { user, permissions } = useAuth();
    const screens = useBreakpoint();
    const navigate = useNavigate();
    const router = { push: (path: string) => navigate(path) };
    const [tickets, setTickets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [filters, setFilters] = useState<Record<string, string>>({});

    const [importModalVisible, setImportModalVisible] = useState(false);
    const [importing, setImporting] = useState(false);

    useEffect(() => {
        fetchTickets();
    }, [page, pageSize, filters]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setPage(1);
    }, [filters]);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const cleanFilters = Object.fromEntries(
                Object.entries(filters).filter(([_, v]) => v != null && v !== '')
            );
            const params = new URLSearchParams({
                page: String(page),
                pageSize: String(pageSize),
                ...cleanFilters,
            });
            const res = await fetch(`/PAMS/api/itsm?${params}`);
            const data = await res.json();
            if (data.items) {
                setTickets(data.items);
                setTotal(data.total);
            }
        } catch (error) {
            message.error('获取工单列表失败');
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        try {
            const cleanFilters = Object.fromEntries(
                Object.entries(filters).filter(([_, v]) => v != null && v !== '')
            );
            const params = new URLSearchParams(cleanFilters as any);
            const res = await fetch(`/PAMS/api/itsm/export?${params}`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `itsm_${dayjs().format('YYYY-MM-DD')}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            message.success('导出成功');
        } catch {
            message.error('导出失败');
        }
    };

    const handleClearAll = () => {
        modal.confirm({
            title: '确定要清空所有ITSM工单吗？',
            content: '此操作不可撤销，数据表中全部工单将被永久删除。',
            okText: '确定清空',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const res = await fetch('/PAMS/api/itsm/clear', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                        message.success(`已清空 ${data.deleted} 条工单`);
                        fetchTickets();
                    } else {
                        message.error(data.error || '清空失败');
                    }
                } catch {
                    message.error('请求失败');
                }
            }
        });
    };

    const handleDownloadTemplate = () => {
        fetch('/PAMS/api/itsm/template')
            .then(res => res.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'itsm_template.xlsx';
                a.click();
                window.URL.revokeObjectURL(url);
            })
            .catch(() => message.error('下载模板失败'));
    };

    const handleImportUpload = async (file: File) => {
        setImporting(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/PAMS/api/itsm/import', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            if (data.success) {
                message.success(`成功导入 ${data.count} 条工单`);
                setImportModalVisible(false);
                fetchTickets();
            } else {
                message.error(data.error || '导入失败');
            }
        } catch (error) {
            message.error('导入失败');
        } finally {
            setImporting(false);
        }
        return false; // Prevent default upload
    };

    const handleRowClick = (record: any) => {
        router.push(`/pams/itsmdetail/${record.id}`);
    };

    const handleConvertToIssue = (record: any, e: React.MouseEvent) => {
        e.stopPropagation();
        modal.confirm({
            title: '使用大模型转换为问题',
            content: '大模型将根据工单包含的内容，抽取信息建立一个新问题（编号与本工单一致，轮次为"投产"）。大概需要30秒-1分钟。',
            okText: '开始转换',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const res = await fetch(`/PAMS/api/itsm/${record.id}/convert`, {
                        method: 'POST',
                    });
                    const data = await res.json();
                    if (data.success) {
                        message.success('成功转为问题单！');
                        fetchTickets(); // refresh list
                    } else {
                        message.error(data.error || '转换失败');
                    }
                } catch (error) {
                    message.error('请求转换接口失败');
                }
            }
        });
    };

    const cellStyle = { fontSize: 12 };

    const columns: ColumnsType<any> = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 100, fixed: 'left', ellipsis: true, onCell: () => ({ style: cellStyle }) },
        { title: '工单状态', dataIndex: 'ticket_status', key: 'ticket_status', width: 100, ellipsis: true, onCell: () => ({ style: cellStyle }), onHeaderCell: () => ({ style: cellStyle }) },
        { 
            title: '工单名称', 
            dataIndex: 'ticket_name', 
            key: 'ticket_name', 
            width: 200, 
            onCell: () => ({ style: cellStyle }), 
            onHeaderCell: () => ({ style: cellStyle }),
            render: (text: string) => (
                <div style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'normal',
                    wordBreak: 'break-all',
                }} title={text}>
                    {text}
                </div>
            )
        },
        { 
            title: '详述', 
            dataIndex: 'detail', 
            key: 'detail', 
            width: 300, 
            onCell: () => ({ style: cellStyle }), 
            onHeaderCell: () => ({ style: cellStyle }),
            render: (text: string) => (
                <div style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'normal',
                    wordBreak: 'break-all',
                }} title={text}>
                    {text}
                </div>
            )
        },
        { title: '创建人', dataIndex: 'creator', key: 'creator', width: 100, ellipsis: true, onCell: () => ({ style: cellStyle }), onHeaderCell: () => ({ style: cellStyle }) },
        { title: '创建单位（部门）', dataIndex: 'creator_dept', key: 'creator_dept', width: 150, ellipsis: true, onCell: () => ({ style: cellStyle }), onHeaderCell: () => ({ style: cellStyle }) },
        { title: '建单人联系方式', dataIndex: 'creator_contact', key: 'creator_contact', width: 150, ellipsis: true, onCell: () => ({ style: cellStyle }), onHeaderCell: () => ({ style: cellStyle }) },
        {
            title: '操作',
            key: 'action',
            fixed: 'right',
            width: 80,
            render: (_, record) => (
                <Space size={4} onClick={(e) => e.stopPropagation()}>
                    {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
                        <Tooltip title={record.is_converted ? '已转为问题' : '转成问题'}>
                            <Button 
                                type="text"
                                size="small"
                                icon={<RobotOutlined />}
                                disabled={!!record.is_converted}
                                onClick={(e) => handleConvertToIssue(record, e)}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title={!record.is_converted ? '尚未转为问题' : '跳转到问题详情'}>
                        <Button 
                            type="text"
                            size="small"
                            icon={<LinkOutlined />}
                            disabled={!record.is_converted}
                            onClick={() => router.push(`/pams/issues/`)}
                        />
                    </Tooltip>
                </Space>
            ),
        }
    ];

    return (
        <div style={{ padding: screens.xs ? 0 : 24 }}>
            <Collapse
                style={{ marginBottom: 16 }}
                items={[
                    {
                        key: '1',
                        label: <Space><FilterOutlined /><span>检索</span></Space>,
                        children: (
                            <Space wrap>
                                <Input
                                    placeholder="按ID搜索"
                                    allowClear
                                    onChange={(e) => setFilters(prev => ({ ...prev, id: e.target.value }))}
                                />
                                <Input
                                    placeholder="工单状态"
                                    allowClear
                                    onChange={(e) => setFilters(prev => ({ ...prev, ticket_status: e.target.value }))}
                                />
                                <Input
                                    placeholder="工单名称"
                                    allowClear
                                    onChange={(e) => setFilters(prev => ({ ...prev, ticket_name: e.target.value }))}
                                />
                                <Input
                                    placeholder="详述"
                                    allowClear
                                    onChange={(e) => setFilters(prev => ({ ...prev, detail: e.target.value }))}
                                />
                                <Input
                                    placeholder="创建人"
                                    allowClear
                                    onChange={(e) => setFilters(prev => ({ ...prev, creator: e.target.value }))}
                                />
                                <Input
                                    placeholder="创建单位"
                                    allowClear
                                    onChange={(e) => setFilters(prev => ({ ...prev, creator_dept: e.target.value }))}
                                />
                                <Input
                                    placeholder="建单人联系方式"
                                    allowClear
                                    onChange={(e) => setFilters(prev => ({ ...prev, creator_contact: e.target.value }))}
                                />
                                <Select
                                    placeholder="是否转为问题"
                                    allowClear
                                    style={{ width: 140 }}
                                    onChange={(val) => setFilters(prev => ({ ...prev, is_converted: val }))}
                                    options={[
                                        { label: '已转为问题', value: '1' },
                                        { label: '未转为问题', value: '0' },
                                    ]}
                                />
                            </Space>
                        ),
                    },
                ]}
            />

            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button icon={<ReloadOutlined />} onClick={fetchTickets}>{screens.xs ? null : '刷新'}</Button>
                {!(screens.xs || (screens.sm && !screens.md)) && (
                    <>
                        <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>下载模板</Button>
                        {hasFeaturePermission(user, 'itsm:batch', permissions) && (
                            <Button icon={<UploadOutlined />} onClick={() => setImportModalVisible(true)}>批量导入</Button>
                        )}
                    </>
                )}
                {hasFeaturePermission(user, 'itsm:export', permissions) && (
                    <Button icon={<ExportOutlined />} onClick={handleExport}>{screens.xs ? null : '导出'}</Button>
                )}
                {hasFeaturePermission(user, 'itsm:batch', permissions) && !(screens.xs || (screens.sm && !screens.md)) && (
                    <Button icon={<DeleteOutlined />} danger onClick={handleClearAll}>清空</Button>
                )}
            </div>

            {screens.xs || (screens.sm && !screens.md) ? (
                <List
                    grid={{ gutter: 16, column: 1 }}
                    dataSource={tickets}
                    loading={loading}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        size: 'small',
                        onChange: (p, ps) => { setPage(p); setPageSize(ps); }
                    }}
                    renderItem={item => (
                        <List.Item onClick={() => handleRowClick(item)} style={{ cursor: 'pointer', padding: '0' }}>
                            <Card
                                size="small"
                                title={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className={styles.issueIdMain} title={item.id} style={screens.xs ? { fontSize: '13px' } : {}}>{item.id}</span>
                                        <div className={`${styles.statusBadge} ${item.ticket_status?.includes('处理') ? styles.statusProcessing :
                                            item.ticket_status?.includes('完成') || item.ticket_status?.includes('结') ? styles.statusSolved :
                                                item.ticket_status?.includes('验') ? styles.statusVerify : ''
                                            }`}>
                                            <span className={styles.statusBadgeDot}></span>
                                            {item.ticket_status}
                                        </div>
                                    </div>
                                }
                                extra={
                                    <Space size={4}>
                                        {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
                                            <Tooltip title={item.is_converted ? '已转为问题' : '转成问题'}>
                                                <Button 
                                                    type="text"
                                                    size="small"
                                                    icon={<RobotOutlined />}
                                                    disabled={!!item.is_converted}
                                                    style={{ padding: '0 4px' }}
                                                    onClick={(e) => handleConvertToIssue(item, e)}
                                                />
                                            </Tooltip>
                                        )}
                                        <Tooltip title={!item.is_converted ? '尚未转为问题' : '跳转到问题详情'}>
                                            <Button 
                                                type="text"
                                                size="small"
                                                icon={<LinkOutlined />}
                                                disabled={!item.is_converted}
                                                style={{ padding: '0 4px' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    router.push(`/pams/issues/`);
                                                }}
                                            />
                                        </Tooltip>
                                    </Space>
                                }
                            >
                                <div style={{ marginBottom: 8 }}>
                                    <Text strong>{item.ticket_name}</Text>
                                </div>
                                <div style={{ marginBottom: 8, fontSize: '13px', color: '#666' }}>
                                    {item.detail}
                                </div>
                                <div className={styles.peopleGrid}>
                                    <div className={styles.personCard}>
                                        <span className={`${styles.personTag} ${styles.tagReporter}`}>创建人</span>
                                        <span className={styles.personName}>{item.creator || '-'}</span>
                                    </div>
                                    <div className={styles.personCard} style={{ gridColumn: 'span 2' }}>
                                        <span className={`${styles.personTag} ${styles.tagHandler}`}>单位</span>
                                        <span className={styles.personName}>{item.creator_dept || '-'}</span>
                                    </div>
                                </div>
                                <div style={{ marginTop: 8 }}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>联系方式：{item.creator_contact || '-'}</Text>
                                </div>
                            </Card>
                        </List.Item>
                    )}
                />
            ) : (
                <Table
                    size="small"
                    columns={columns}
                    dataSource={tickets}
                    rowKey="id"
                    loading={loading}
                    scroll={{ x: 'max-content' }}
                    onRow={(record) => ({
                        onClick: () => handleRowClick(record),
                        style: { cursor: 'pointer', fontSize: 12 }
                    })}
                    pagination={{
                        current: page,
                        pageSize,
                        total,
                        showSizeChanger: true,
                        size: 'small',
                        onChange: (p, ps) => { setPage(p); setPageSize(ps); },
                    }}
                />
            )}

            <Modal
                title="导入ITSM工单"
                open={importModalVisible}
                onCancel={() => setImportModalVisible(false)}
                footer={null}
            >
                <div style={{ padding: '20px 0', textAlign: 'center' }}>
                    <Upload
                        accept=".xlsx,.xls"
                        beforeUpload={handleImportUpload}
                        showUploadList={false}
                        disabled={importing}
                    >
                        <Button icon={<UploadOutlined />} loading={importing} type="primary">
                            选择Excel文件（如果数据量大可能需要等待）
                        </Button>
                    </Upload>
                    <div style={{ marginTop: 16, color: '#666' }}>
                        支持批量新增或更新（按照调整后的 33 列字段导入）。如果 ID 相同将被覆盖更新。
                    </div>
                </div>
            </Modal>
        </div>
    );
}

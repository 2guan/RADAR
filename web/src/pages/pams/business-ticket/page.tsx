/**
 * @file page.tsx
 * @description PAMS 业务工单数据整合与第三方工单列表处理页面
 * @author hengguan
 * @date 2026-06-08
 */

'use client';

import React, { useEffect, useState } from 'react';
import { App, Table, Button, Space, Input, Form, Upload, Modal, List, Card, Grid, Collapse, Tooltip, Select, Typography, Row, Col, Tag } from 'antd';
import styles from '../issue-table.module.css';
import { SearchOutlined, ExportOutlined, ReloadOutlined, UploadOutlined, DownloadOutlined, FilterOutlined, LinkOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { useAuth } from '@/components/AuthProvider';
import { hasFeaturePermission } from '@/lib/permissions-client';
import { BUSINESS_TICKET_COLUMNS } from '@/lib/business-ticket-mapper';
import { pamsFetch } from '@/lib/api-client';

const { useBreakpoint } = Grid;
const { Text } = Typography;
const fetch = pamsFetch;

export default function BusinessTicketPage() {
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
            const res = await fetch(`/PAMS/api/business-ticket?${params}`);
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
            const res = await fetch(`/PAMS/api/business-ticket/export?${params}`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `business_tickets_${dayjs().format('YYYY-MM-DD')}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            message.success('导出成功');
        } catch {
            message.error('导出失败');
        }
    };

    const handleClearAll = () => {
        modal.confirm({
            title: '确定要清空所有业务工单吗？',
            content: '此操作不可撤销，数据表中全部工单将被永久删除。',
            okText: '确定清空',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const res = await fetch('/PAMS/api/business-ticket/clear', { method: 'POST' });
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
        fetch('/PAMS/api/business-ticket/template')
            .then(res => res.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'business_ticket_template.xlsx';
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
            const res = await fetch('/PAMS/api/business-ticket/import', {
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
        router.push(`/pams/business-ticketdetail/${record.id}`);
    };

    const handleFilterChange = (key: string, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const cellStyle = { fontSize: 12 };

    const columns: ColumnsType<any> = [
        { title: '序号', dataIndex: 'seq_no', key: 'seq_no', width: 70, fixed: 'left', onCell: () => ({ style: cellStyle }) },
        { title: '工单编号', dataIndex: 'ticket_no', key: 'ticket_no', width: 160, ellipsis: true, onCell: () => ({ style: cellStyle }) },
        { 
            title: '关联问题', 
            dataIndex: 'issue_control_no', 
            key: 'issue_control_no', 
            width: 150, 
            onCell: () => ({ style: cellStyle }),
            render: (text: string) => text ? <Tag color="blue">{text}</Tag> : '-'
        },
        { title: '所属板块', dataIndex: 'delivery_section', key: 'delivery_section', width: 120, ellipsis: true, onCell: () => ({ style: cellStyle }) },
        { title: '子系统/组件', dataIndex: 'subsystem', key: 'subsystem', width: 140, ellipsis: true, onCell: () => ({ style: cellStyle }) },
        { 
            title: '问题描述', 
            dataIndex: 'problem_description', 
            key: 'problem_description', 
            width: 250, 
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
        { title: '问题是否解决', dataIndex: 'is_problem_resolved', key: 'is_problem_resolved', width: 110, onCell: () => ({ style: cellStyle }) },
        {
            title: '操作',
            key: 'action',
            fixed: 'right',
            width: 80,
            render: (_, record) => (
                <Space size={4} onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={record.is_linked ? '跳转到关联问题' : '暂无关联问题'}>
                        <Button 
                            type="text"
                            size="small"
                            icon={<LinkOutlined />}
                            disabled={!record.is_linked}
                            onClick={() => router.push(`/pams/issues/`)}
                        />
                    </Tooltip>
                </Space>
            ),
        }
    ];

    const filterGroups = [
        {
            title: '基本信息 & 系统板块',
            fields: [
                { key: 'seq_no', placeholder: '序号' },
                { key: 'problem_register_date', placeholder: '问题登记日期' },
                { key: 'ticket_no', placeholder: '工单编号' },
                { key: 'problem_source', placeholder: '问题来源' },
                { key: 'delivery_section', placeholder: '交付件所属板块' },
                { key: 'subsystem', placeholder: '物理子系统/组件' },
                { key: 'province_assoc_dept', placeholder: '省联社主责部门' },
                { key: 'jinke_group', placeholder: '金科事业群' }
            ]
        },
        {
            title: '问题详情 & 管控争议',
            fields: [
                { key: 'problem_description', placeholder: '问题描述' },
                { key: 'jinke_initial_feedback', placeholder: '金科初步反馈意见' },
                { key: 'issue_control_no', placeholder: '问题管控工具编号' },
                { key: 'issue_control_status', placeholder: '问题管控工具状态' },
                { key: 'is_problem_resolved', placeholder: '问题是否解决' },
                { key: 'remarks', placeholder: '备注（解决反馈）' },
                { key: 'is_disputed', placeholder: '是否争议' },
                { key: 'is_converted_to_problem', placeholder: '是否转为问题' }
            ]
        },
        {
            title: '需求信息 & 联系人',
            fields: [
                { key: 'undertaken_req_tool_no', placeholder: '需求工具编号' },
                { key: 'current_handler', placeholder: '当前处理人' },
                { key: 'current_status', placeholder: '当前状态' },
                { key: 'is_demand_closed', placeholder: '需求是否关闭' },
                { key: 'reporter_dept_contact', placeholder: '提出部门联系人' },
                { key: 'jinke_contact_phone', placeholder: '金科联系人电话' }
            ]
        }
    ];

    return (
        <div style={{ padding: screens.xs ? 0 : 24 }}>
            <Collapse 
                style={{ marginBottom: 16 }}
                items={[
                    {
                        key: '1',
                        label: (
                            <Space>
                                <FilterOutlined />
                                <span>高级检索（共 36 个字段）</span>
                            </Space>
                        ),
                        children: (
                            <Form layout="vertical">
                                {filterGroups.map((group, groupIdx) => (
                                    <div key={groupIdx} style={{ marginBottom: groupIdx === filterGroups.length - 1 ? 0 : 16 }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 13, color: '#1890ff' }}>{group.title}</div>
                                        <Row gutter={[8, 8]}>
                                            {group.fields.map(field => (
                                                <Col xs={24} sm={12} md={8} lg={6} key={field.key}>
                                                    <Form.Item label={field.placeholder} style={{ marginBottom: 4 }} styles={{ label: { fontSize: 12, paddingBottom: 2 } }}>
                                                        <Input 
                                                            placeholder={`请输入${field.placeholder}`}
                                                            allowClear
                                                            size="small"
                                                            value={filters[field.key] || ''}
                                                            onChange={(e) => handleFilterChange(field.key, e.target.value)}
                                                        />
                                                    </Form.Item>
                                                </Col>
                                            ))}
                                        </Row>
                                    </div>
                                ))}
                                <Row justify="end" style={{ marginTop: 12 }}>
                                    <Button size="small" type="dashed" onClick={() => setFilters({})} style={{ marginRight: 8 }}>重置所有检索</Button>
                                    <Button size="small" type="primary" icon={<SearchOutlined />} onClick={fetchTickets}>执行检索</Button>
                                </Row>
                            </Form>
                        )
                    }
                ]}
            />

            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button icon={<ReloadOutlined />} onClick={fetchTickets}>{screens.xs ? null : '刷新'}</Button>
                {!(screens.xs || (screens.sm && !screens.md)) && (
                    <>
                        <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>下载模板</Button>
                        {hasFeaturePermission(user, 'business-ticket:batch', permissions) && (
                            <Button icon={<UploadOutlined />} onClick={() => setImportModalVisible(true)}>批量导入</Button>
                        )}
                    </>
                )}
                {hasFeaturePermission(user, 'business-ticket:export', permissions) && (
                    <Button icon={<ExportOutlined />} onClick={handleExport}>{screens.xs ? null : '导出'}</Button>
                )}
                {hasFeaturePermission(user, 'business-ticket:batch', permissions) && !(screens.xs || (screens.sm && !screens.md)) && (
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
                                        <span className={styles.issueIdMain} title={item.ticket_no} style={{ fontSize: '13px' }}>{item.ticket_no || item.id}</span>
                                        {item.current_status && (
                                            <div className={`${styles.statusBadge} ${styles.statusProcessing}`}>
                                                <span className={styles.statusBadgeDot}></span>
                                                {item.current_status}
                                            </div>
                                        )}
                                    </div>
                                }
                                extra={
                                    <Tooltip title={item.is_linked ? '跳转到关联问题' : '暂无关联问题'}>
                                        <Button 
                                            type="text"
                                            size="small"
                                            icon={<LinkOutlined />}
                                            disabled={!item.is_linked}
                                            style={{ padding: '0 4px' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                router.push(`/pams/issues/`);
                                            }}
                                        />
                                    </Tooltip>
                                }
                            >
                                <div style={{ marginBottom: 8, fontSize: '13px', fontWeight: 'bold' }}>
                                    板块/子系统：{item.delivery_section || '-'} / {item.subsystem || '-'}
                                </div>
                                <div style={{ marginBottom: 8, fontSize: '13px', color: '#666' }}>
                                    描述：{item.problem_description || '-'}
                                </div>
                                <div className={styles.peopleGrid}>
                                    <div className={styles.personCard}>
                                        <span className={`${styles.personTag} ${styles.tagReporter}`}>解决状态</span>
                                        <span className={styles.personName}>{item.is_problem_resolved || '-'}</span>
                                    </div>
                                    <div className={styles.personCard}>
                                        <span className={`${styles.personTag} ${styles.tagHandler}`}>来源</span>
                                        <span className={styles.personName}>{item.problem_source || '-'}</span>
                                    </div>
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
                title="导入业务工单"
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
                        支持批量新增或更新。如果 ID 或 工单编号 相同将被覆盖更新。
                    </div>
                </div>
            </Modal>
        </div>
    );
}

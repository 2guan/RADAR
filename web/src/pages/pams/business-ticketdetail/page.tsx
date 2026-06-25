/**
 * @file page.tsx
 * @description PAMS 业务工单详细展现与操作详情页面
 * @author hengguan
 * @date 2026-06-08
 */

'use client';

import React, { useEffect, useState } from 'react';
import { App, Descriptions, Card, Button, Space, Spin, Typography, Grid, Tag } from 'antd';
import { ArrowLeftOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { BUSINESS_TICKET_COLUMNS } from '@/lib/business-ticket-mapper';
import { useAuth } from '@/components/AuthProvider';
import { pamsFetch } from '@/lib/api-client';

const { Text } = Typography;
const { useBreakpoint } = Grid;
const fetch = pamsFetch;

const FIELD_GROUPS = [
    {
        title: '基本与系统信息',
        keys: [
            'seq_no', 'problem_register_date', 'ticket_no', 'problem_source',
            'delivery_section', 'subsystem', 'province_assoc_dept', 'jinke_group', 'register_time'
        ],
    },
    {
        title: '问题详情描述',
        keys: [
            'problem_description', 'attachments', 'jinke_initial_feedback', 
            'is_problem_resolved', 'remarks'
        ],
    },
    {
        title: '关联问题与管控',
        keys: [
            'issue_control_no', 'issue_control_status', 'issue_control_close_time', 'is_converted_to_problem'
        ],
    },
    {
        title: '争议排期 & 会议纪要',
        keys: [
            'both_parties_schedule', 'is_disputed', 'dispute_over_2_weeks', 
            'is_undertaken', 'is_submitted_to_province_assoc', 'meeting_minutes'
        ],
    },
    {
        title: '联系人信息',
        keys: [
            'reporter_dept_contact', 'reporter_contact_info', 'jinke_contact_phone'
        ],
    },
    {
        title: '需求管理信息',
        keys: [
            'undertaken_req_tool_no', 'current_handler', 'current_status', 'is_demand_closed',
            'expected_complete_time', 'operation_instruction_reason', 'next_step_processing', 
            'estimated_or_completed_time', 'demand_remarks'
        ],
    },
];

// Build key->label map from BUSINESS_TICKET_COLUMNS
const KEY_LABEL_MAP: Record<string, string> = Object.fromEntries(
    BUSINESS_TICKET_COLUMNS.map(c => [c.key, c.label])
);

export default function BusinessTicketDetail() {
    const { message } = App.useApp();
    const screens = useBreakpoint();
    const navigate = useNavigate();
    const router = { push: (path: string) => navigate(path), back: () => navigate(-1) };
    const params = useParams();
    const id = params?.id as string;
    const { user } = useAuth();
    
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (id) {
            fetchTicket(id);
        }
    }, [id]);

    const fetchTicket = async (ticketId: string) => {
        try {
            const res = await fetch(`/PAMS/api/business-ticket/${ticketId}`);
            const data = await res.json();
            if (data && !data.error) {
                setTicket(data);
            } else {
                message.error('无法获取工单详情');
            }
        } catch {
            message.error('请求异常');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div style={{ textAlign: 'center', marginTop: 100 }}><Spin size="large" /></div>;
    }

    if (!ticket) {
        return <div style={{ padding: 24 }}>未找到工单</div>;
    }

    // Determine if description/remarks should take full width (span 3)
    const getColumnCount = () => {
        if (screens.xxl || screens.xl) return 3;
        if (screens.lg || screens.md) return 2;
        return 1;
    };
    const colCount = getColumnCount();

    const getSpan = (key: string) => {
        if (['problem_description', 'remarks', 'meeting_minutes', 'demand_remarks'].includes(key)) {
            return colCount;
        }
        return 1;
    };

    return (
        <div style={{ padding: screens.xs ? 0 : '24px', maxWidth: 1400, margin: '0 auto' }}>
            <Card 
                size="small" 
                style={{ marginBottom: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                styles={{ header: { padding: '4px 12px' }, body: { padding: '8px 12px' } }}
                title={
                    <Space size={screens.xs ? 4 : 8}>
                        <Button 
                            icon={<ArrowLeftOutlined />} 
                            onClick={() => router.back()} 
                            type="text" 
                            size="small"
                            style={{ padding: 0, width: 24, height: 24 }}
                        />
                        <Text strong style={{ fontSize: screens.xs ? 14 : 16 }}>业务工单详情</Text>
                        <Tag color="blue" style={{ margin: 0, fontSize: 12 }}>{id}</Tag>
                    </Space>
                }
                extra={
                    <Space size={4}>
                        <Button
                            size="small"
                            type="primary"
                            icon={<LinkOutlined />}
                            onClick={() => router.push(`/pams/issues/${ticket.issue_control_no}`)}
                            disabled={!ticket?.is_linked}
                            style={screens.xs ? { fontSize: 12, padding: '0 4px' } : {}}
                        >
                            {!screens.xs ? "跳转问题详情" : "跳转问题"}
                        </Button>
                    </Space>
                }
            >
                <div style={{ wordBreak: 'break-all' }}>
                    <Text strong style={{ fontSize: screens.xs ? 15 : 18, color: '#1a1a1a' }}>{ticket.ticket_no ? `工单号：${ticket.ticket_no}` : `工单：${id}`}</Text>
                </div>
            </Card>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {FIELD_GROUPS.map(group => {
                    const groupCols = group.keys.filter(key => KEY_LABEL_MAP[key]);
                    if (groupCols.length === 0) return null;

                    return (
                        <Card key={group.title} title={group.title} size="small" style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                            <Descriptions
                                bordered
                                column={colCount}
                                size="small"
                            >
                                {groupCols.map(key => {
                                    const label = KEY_LABEL_MAP[key];
                                    const value = ticket[key];
                                    const span = getSpan(key);
                                    
                                    // Highlight large text fields or render them with breaks
                                    const renderedValue = (key === 'problem_description' || key === 'remarks' || key === 'meeting_minutes' || key === 'demand_remarks') && value ? (
                                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto' }}>
                                            {value}
                                        </div>
                                    ) : (
                                        value || '-'
                                    );

                                    // Special style for the linked issue control number
                                    if (key === 'issue_control_no' && value) {
                                        return (
                                            <Descriptions.Item key={key} label={label} span={span}>
                                                <Space>
                                                    <Tag color="blue">{value}</Tag>
                                                    {ticket.is_linked ? (
                                                        <Button 
                                                            type="link" 
                                                            size="small" 
                                                            style={{ padding: 0, height: 'auto' }} 
                                                            onClick={() => router.push(`/pams/issues/${value}`)}
                                                        >
                                                            查看关联问题详情
                                                        </Button>
                                                    ) : (
                                                        <span style={{ fontSize: 12, color: '#999' }}>(未在系统登记)</span>
                                                    )}
                                                </Space>
                                            </Descriptions.Item>
                                        );
                                    }

                                    return (
                                        <Descriptions.Item key={key} label={label} span={span}>
                                            {renderedValue}
                                        </Descriptions.Item>
                                    );
                                })}
                            </Descriptions>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * @file page.tsx
 * @description PAMS ITSM 工单详细流程展现与操作转化详情页面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useEffect, useState } from 'react';
import { App, Descriptions, Card, Button, message, Space, Spin, Typography, Modal, Grid, Tag } from 'antd';
import { ArrowLeftOutlined, RobotOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ITSM_COLUMNS } from '@/lib/itsm-mapper';
import { useAuth } from '@/components/AuthProvider';
import { toBeijingTime } from '@/lib/timezone';
import { pamsFetch } from '@/lib/api-client';

const { Text } = Typography;
const { useBreakpoint } = Grid;
const fetch = pamsFetch;

const FIELD_GROUPS = [
    {
        title: '工单基本信息',
        keys: [
            'processing_time', 'ticket_name', 'ticket_no', 'ticket_status', 'current_step', 
            'current_handler', 'ticket_type', 'creation_time', 'creator', 'last_update_time', 'id'
        ],
    },
    {
        title: '问题描述',
        keys: [
            'title', 'detail', 'creator_alt', 'creator_dept', 'creator_contact',
            'org_code', 'trans_code', 'app_system', 'is_system_error'
        ],
    },
    {
        title: '处理进度与方案',
        keys: [
            'occurrence_time', 'acceptance_time', 'resolve_time', 'solution', 
            'resolve_group', 'resolver', 'is_trigger_other'
        ],
    },
    {
        title: '附件与记录',
        keys: ['images', 'history_record', 'attachment'],
    },
    {
        title: '关闭与评价',
        keys: ['close_status', 'satisfaction_score', 'satisfaction_desc'],
    },
];

// Build key->label map from ITSM_COLUMNS
const KEY_LABEL_MAP: Record<string, string> = Object.fromEntries(
    ITSM_COLUMNS.map(c => [c.key, c.label])
);

export default function ITSMDetail() {
    const { message, modal } = App.useApp();
    const screens = useBreakpoint();
    const navigate = useNavigate();
    const router = { push: (path: string) => navigate(path), back: () => navigate(-1) };
    const params = useParams();
    const { user } = useAuth();
    const [ticket, setTicket] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [converting, setConverting] = useState(false);
    const [ticketId, setTicketId] = useState<string>('');

    useEffect(() => {
        if (params.id) {
            setTicketId(params.id);
            fetchTicket(params.id);
        }
    }, [params.id]);

    const fetchTicket = async (id: string) => {
        try {
            const res = await fetch(`/PAMS/api/itsm/${id}`);
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

    const handleConvertToIssue = () => {
        modal.confirm({
            title: '使用大模型转换为问题',
            content: '大模型将根据工单包含的内容，抽取信息建立一个新问题（编号与本工单一致，轮次为"投产"）。大概需要30秒-1分钟。',
            okText: '开始转换',
            cancelText: '取消',
            onOk: async () => {
                setConverting(true);
                try {
                    const res = await fetch(`/PAMS/api/itsm/${ticketId}/convert`, {
                        method: 'POST',
                    });
                    const data = await res.json();
                    if (data.success) {
                        message.success('成功转为问题单！');
                        router.push(`/pams/issues/${ticketId}`);
                    } else {
                        message.error(data.error || '转换失败');
                    }
                } catch (error) {
                    message.error('请求转换接口失败');
                } finally {
                    setConverting(false);
                }
            }
        });
    };

    if (loading) {
        return <div style={{ textAlign: 'center', marginTop: 100 }}><Spin size="large" /></div>;
    }

    if (!ticket) {
        return <div style={{ padding: 24 }}>未找到工单</div>;
    }

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
                        <Text strong style={{ fontSize: screens.xs ? 14 : 16 }}>工单详情</Text>
                        <Tag color="blue" style={{ margin: 0, fontSize: 12 }}>{ticketId}</Tag>
                    </Space>
                }
                extra={
                    <Space size={4}>
                        <Button
                            size="small"
                            icon={<LinkOutlined />}
                            onClick={() => router.push(`/pams/issues/${ticketId}`)}
                            disabled={!ticket?.is_converted}
                            style={screens.xs ? { fontSize: 12, padding: '0 4px' } : {}}
                        >
                            {!screens.xs && "跳转问题"}
                        </Button>
                        {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') && (
                            <Button
                                size="small"
                                type="primary"
                                icon={<RobotOutlined />}
                                loading={converting}
                                onClick={handleConvertToIssue}
                                disabled={!!ticket?.is_converted}
                                style={screens.xs ? { fontSize: 12, padding: '0 4px' } : {}}
                            >
                                {!screens.xs ? "AI 转换" : "AI"}
                            </Button>
                        )}
                    </Space>
                }
            >
                <div style={{ wordBreak: 'break-all' }}>
                    <Text strong style={{ fontSize: screens.xs ? 15 : 18, color: '#1a1a1a' }}>{ticket.ticket_name || ticket.ticket_no}</Text>
                </div>
            </Card>

            <Space orientation="vertical" style={{ width: '100%' }} size={16}>
                {FIELD_GROUPS.map(group => {
                    const groupCols = group.keys.filter(key => KEY_LABEL_MAP[key]);
                    if (groupCols.length === 0) return null;

                    return (
                        <Card key={group.title} title={group.title} size="small">
                            <Descriptions
                                bordered
                                column={{ xxl: 3, xl: 3, lg: 2, md: 2, sm: 1, xs: 1 }}
                                size="small"
                            >
                                {groupCols.map(key => {
                                    const label = KEY_LABEL_MAP[key];
                                    let value = ticket[key];
                                    if (label.endsWith('时间') && value) {
                                        value = toBeijingTime(value, 'YYYY.M.D HH:mm');
                                    }
                                    return (
                                        <Descriptions.Item key={key} label={label}>
                                            {value || '-'}
                                        </Descriptions.Item>
                                    );
                                })}
                            </Descriptions>
                        </Card>
                    );
                })}
            </Space>
        </div>
    );
}

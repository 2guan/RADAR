/**
 * @file page.tsx
 * @description PAMS 孔明工单处理步骤及转交追踪详情页面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useEffect, useState } from 'react';
import { App, Descriptions, Card, Button, message, Space, Spin, Typography, Modal, Grid, Tag } from 'antd';
import { ArrowLeftOutlined, RobotOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { KONGMING_COLUMNS } from '@/lib/kongming-mapper';
import { useAuth } from '@/components/AuthProvider';
import { toBeijingTime } from '@/lib/timezone';
import { pamsFetch } from '@/lib/api-client';

const { Text } = Typography;
const { useBreakpoint } = Grid;
const fetch = pamsFetch;

// Group fields semantically for better display
const FIELD_GROUPS = [
    {
        title: '基本信息',
        keys: ['ticket_name', 'ticket_no', 'ticket_status', 'urgency', 'current_step', 'ticket_type', 'creation_time', 'creator', 'last_update_time', 'ticket_issue_id', 'issue_no', 'current_stage'],
    },
    {
        title: '问题来源信息',
        keys: ['issue_source', 'directive_code', 'directive_group', 'directive_contact_id', 'directive_contact', 'directive_contact_phone', 'directive_contact_type', 'directive_meaning'],
    },
    {
        title: '任务信息',
        keys: ['task_no', 'task_name', 'task_desc', 'system_name'],
    },
    {
        title: '案例信息',
        keys: ['case_no', 'case_type', 'case_system', 'case_scenario', 'case_executor_org', 'case_contact', 'case_contact_id', 'case_contact_type', 'case_contact_phone'],
    },
    {
        title: '提出人/报告人信息',
        keys: ['issue_proposer', 'issue_proposer_name', 'proposer_org', 'issue_proposer_type', 'proposer_phone', 'issue_reporter', 'reporter_org', 'reporter_phone', 'reporter_type', 'reporter_name'],
    },
    {
        title: '问题详情',
        keys: ['issue_title', 'issue_occur_time', 'issue_app_system', 'issue_app_system_code', 'collab_system', 'issue_desc', 'issue_type', 'issue_impact', 'issue_root_system', 'issue_domain'],
    },
    {
        title: '责任组信息',
        keys: ['issue_group', 'issue_group_type', 'issue_group_id', 'issue_group_phone'],
    },
    {
        title: '处理情况',
        keys: ['related_ticket_no', 'expected_resolve_date', 'discard_reason', 'discard_time', 'issue_process_record'],
    },
    {
        title: '解决信息',
        keys: ['issue_solver', 'solver_org', 'solver_type', 'solver_name', 'solver_phone', 'issue_cause', 'issue_solution', 'followup_items'],
    },
    {
        title: '演练与验证',
        keys: ['drill_release', 'drill_round', 'submit_verify_time', 'verify_pass_time', 'issue_resolve_time', 'issue_resolved'],
    },
    {
        title: '超时信息',
        keys: ['is_timeout_accept', 'is_timeout_process', 'timeout_detail', 'timeout_minutes'],
    },
    {
        title: '其他',
        keys: ['created_time2', 'problem_file'],
    },
];

// Build key->label map from KONGMING_COLUMNS
const KEY_LABEL_MAP: Record<string, string> = Object.fromEntries(
    KONGMING_COLUMNS.map(c => [c.key, c.label])
);

export default function KongmingDetailPage() {
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
            const res = await fetch(`/PAMS/api/kongming/${id}`);
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
            content: '大模型将根据孔明工单包含的内容，抽取信息建立一个新问题（编号与问题工单id一致，轮次为"投产"）。大概需要30秒-1分钟。',
            okText: '开始转换',
            cancelText: '取消',
            onOk: async () => {
                setConverting(true);
                try {
                    const res = await fetch(`/PAMS/api/kongming/${ticketId}/convert`, {
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
        return <div style={{ padding: 24 }}>未找到孔明工单</div>;
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
                        <Text strong style={{ fontSize: screens.xs ? 14 : 16 }}>孔明工单</Text>
                        <Tag color="cyan" style={{ margin: 0, fontSize: 12 }}>{ticketId}</Tag>
                    </Space>
                }
                extra={
                    <Space size={4}>
                        <Button
                            size="small"
                            icon={<LinkOutlined />}
                            onClick={() => router.push(`/pams/issues/${ticket.ticket_issue_id}`)}
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
                    <Text strong style={{ fontSize: screens.xs ? 15 : 18, color: '#1a1a1a' }}>{ticket.ticket_name}</Text>
                </div>
            </Card>

            <Space orientation="vertical" style={{ width: '100%' }} size={16}>
                {FIELD_GROUPS.map(group => {
                    // Only render group if at least one field has a value
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

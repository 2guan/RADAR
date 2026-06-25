/**
 * @file LLMConfig.tsx
 * @description PAMS 系统功能页面 / 提供 [config/components/LLMConfig.tsx] 相关的业务操作 UI 界面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Spin, Space, Typography, Switch, Row, Col, Divider, Alert, Tooltip } from 'antd';
import { SaveOutlined, ApiOutlined, SafetyCertificateOutlined, MessageOutlined } from '@ant-design/icons';
import { pamsFetch } from '@/lib/api-client';

const { TextArea } = Input;
const { Title, Text } = Typography;
const fetch = pamsFetch;

interface AISetting {
    setting_id: number;
    setting_key: string;
    setting_value: string;
    description: string;
    updated_at: string;
}

export default function LLMConfig() {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [isChanged, setIsChanged] = useState(false);
    const [baseValues, setBaseValues] = useState<any>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const res = await fetch('/PAMS/api/ai-settings');
            const data = await res.json();
            if (data.success) {
                const formValues: Record<string, any> = {};
                data.data.forEach((setting: AISetting) => {
                    formValues[setting.setting_key] = setting.setting_value;
                });
                form.setFieldsValue(formValues);
                setBaseValues(formValues);
                setIsChanged(false);
            }
        } catch (error) {
            message.error('获取设置失败');
        } finally {
            setLoading(false);
        }
    };

    const handleValuesChange = (_: any, allValues: any) => {
        if (!baseValues) return;
        const changed = JSON.stringify(allValues) !== JSON.stringify(baseValues);
        setIsChanged(changed);
    };

    const handleSave = async (values: Record<string, string>) => {
        setSaving(true);
        try {
            const settingsToUpdate = Object.entries(values).map(([key, value]) => ({
                key,
                value: String(value)
            }));

            const res = await fetch('/PAMS/api/ai-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: settingsToUpdate })
            });

            const data = await res.json();
            if (data.success) {
                message.success('设置更新成功');
                setBaseValues(values);
                setIsChanged(false);
            } else {
                message.error(data.error || '保存失败');
            }
        } catch (error) {
            message.error('保存失败');
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        try {
            const res = await fetch('/PAMS/api/ai-settings/test', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                message.success(`连接成功！AI响应: ${data.response?.substring(0, 50) || '正常'}`);
            } else {
                message.error(data.error || '连接失败');
            }
        } catch (error) {
            message.error('连接失败');
        } finally {
            setTesting(false);
        }
    };

    return (
        <Form form={form} layout="vertical" onFinish={handleSave} onValuesChange={handleValuesChange}>
            {loading && <div style={{ padding: 16, textAlign: 'center' }}><Spin tip="加载配置中..."><div style={{ padding: 10 }} /></Spin></div>}
            <Card 
                title={<Space><ApiOutlined />接口基本配置</Space>} 
                size="small" 
                style={{ marginBottom: 16 }}
                extra={
                    <Space>
                        <Tooltip title="测试连接">
                            <Button icon={<ApiOutlined />} onClick={handleTestConnection} loading={testing} />
                        </Tooltip>
                        <Tooltip title="保存配置">
                            <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={saving} disabled={!isChanged} />
                        </Tooltip>
                    </Space>
                }
            >
                <Row gutter={24}>
                    <Col xs={24} md={12}>
                        <Form.Item label="API URL" name="openai_api_url" rules={[{ required: true }]}>
                            <Input placeholder="OpenAI 兼容接口地址" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                        <Form.Item label="API Token" name="openai_api_token" rules={[{ required: true }]}>
                            <Input.Password placeholder="API Key / Token" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                        <Form.Item label="模型名称" name="openai_model" rules={[{ required: true }]}>
                            <Input placeholder="例如: gpt-4, gemini-pro" />
                        </Form.Item>
                    </Col>
                </Row>
            </Card>

            <Card title={<Space><MessageOutlined />提示词模板配置</Space>} size="small">
                <Alert message="提示词决定了 AI 生成报告的风格与深度。修改后立即生效。" type="info" showIcon style={{ marginBottom: 16 }} />
                <Row gutter={[24, 16]}>
                    <Col xs={24} lg={12}>
                        <Form.Item label="单问题分析提示词" name="openai_prompt_single">
                            <TextArea rows={6} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} lg={12}>
                        <Form.Item label="投产问题报告提示词" name="openai_prompt_production">
                            <TextArea rows={6} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} lg={12}>
                        <Form.Item label="批量总结报告提示词" name="openai_prompt_summary">
                            <TextArea rows={6} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} lg={12}>
                        <Form.Item label="问题快报分析提示词" name="openai_prompt_quick_report">
                            <TextArea rows={6} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} lg={12}>
                        <Form.Item label="快捷日报提示词" name="openai_prompt_quick_daily">
                            <TextArea rows={6} />
                        </Form.Item>
                    </Col>
                </Row>
            </Card>
        </Form>
    );
}

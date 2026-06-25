/**
 * @file OtherConfig.tsx
 * @description RADAR 内 PAMS 系统配置：仅保留问题编号规则与问题详情二维码。
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Card, Form, Switch, Button, message, Space, List, Input, Tooltip, Row, Col } from 'antd';
import { SaveOutlined, QrcodeOutlined, SettingOutlined } from '@ant-design/icons';
import { pamsFetch } from '@/lib/api-client';

const fetch = pamsFetch;

export default function OtherConfig() {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
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
                const settings: Record<string, any> = {
                    issue_id_template: 'NX{YYYY}{MM}{DD}{SEQ3}',
                    issue_detail_qrcode_enabled: false,
                };
                data.data.forEach((s: any) => {
                    if (s.setting_key === 'issue_detail_qrcode_enabled') {
                        settings.issue_detail_qrcode_enabled = s.setting_value === 'true';
                    } else if (s.setting_key === 'issue_id_template' && s.setting_value) {
                        settings.issue_id_template = s.setting_value;
                    }
                });
                form.setFieldsValue(settings);
                setBaseValues(settings);
                setIsChanged(false);
            }
        } catch {
            message.error('获取设置失败');
        } finally {
            setLoading(false);
        }
    };

    const handleValuesChange = (_: any, allValues: any) => {
        if (!baseValues) return;
        setIsChanged(JSON.stringify(allValues) !== JSON.stringify(baseValues));
    };

    const handleSave = async (values: any) => {
        setSaving(true);
        try {
            const settings = Object.entries(values).map(([key, value]) => ({
                key,
                value: String(value),
            }));
            const res = await fetch('/PAMS/api/ai-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings }),
            });
            const data = await res.json();
            if (data.success) {
                message.success('设置更新成功');
                setBaseValues(values);
                setIsChanged(false);
            } else {
                message.error(data.error || '保存失败');
            }
        } catch {
            message.error('保存失败');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card
            title={<Space><SettingOutlined />其它设置</Space>}
            size="small"
            extra={
                <Tooltip title="保存配置">
                    <Button type="primary" icon={<SaveOutlined />} onClick={() => form.submit()} loading={saving} disabled={!isChanged} />
                </Tooltip>
            }
        >
            <Form form={form} layout="vertical" onFinish={handleSave} onValuesChange={handleValuesChange}>
                {loading && <div style={{ marginBottom: 16, color: '#8c8c8c' }}>加载配置中...</div>}
                <Row gutter={[24, 0]}>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            label={<Space><SettingOutlined />问题编号命名规则</Space>}
                            name="issue_id_template"
                            tooltip="支持占位符: {YYYY}(年), {YY}(短年份), {MM}(月), {DD}(日), {SEQ3}(3位序列), {SEQ4}(4位序列)"
                            rules={[{ required: true, message: '请输入编号规则' }]}
                        >
                            <Input placeholder="例如：NX{YYYY}{MM}{DD}{SEQ3}" />
                        </Form.Item>
                    </Col>
                </Row>

                <List itemLayout="horizontal">
                    <List.Item
                        actions={[<Form.Item key="qr" name="issue_detail_qrcode_enabled" valuePropName="checked" noStyle><Switch /></Form.Item>]}
                    >
                        <List.Item.Meta
                            avatar={<QrcodeOutlined style={{ fontSize: 24, color: 'var(--radar-primary)' }} />}
                            title="显示问题详情二维码"
                            description="开启后，在问题详情弹窗和手机详情页中显示用于快捷访问的二维码"
                        />
                    </List.Item>
                </List>
            </Form>
        </Card>
    );
}

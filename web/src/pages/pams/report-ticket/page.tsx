/**
 * @file page.tsx
 * @description PAMS 缺陷上报控制台 - 问题工单转问题版
 * @author hengguan
 * @date 2026-06-09
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Upload, message, Card, AutoComplete, Row, Col, Modal, Space, Grid, Image, Tooltip } from 'antd';
import { UploadOutlined, PlusOutlined, SendOutlined, ShareAltOutlined, DeleteOutlined } from '@ant-design/icons';
import { useAuth } from '@/components/AuthProvider';
import { useNavigate } from 'react-router-dom';
import type { UploadFile } from 'antd/es/upload/interface';
import type { DictItem } from '@/types';
import { extractPurePath } from '@/lib/urlUtils';
import { compressImage, validateUploadFile, isDocumentFile, getDocThumbDataUrl, UPLOAD_ACCEPT_STRING } from '@/lib/imageUtils';
import { pamsFetch } from '@/lib/api-client';

const { TextArea } = Input;
const fetch = pamsFetch;

export default function ReportTicketPage() {
    const [form] = Form.useForm();
    const screens = Grid.useBreakpoint();
    const { user } = useAuth();
    const navigate = useNavigate();
    const router = { push: (path: string) => navigate(path.startsWith('/pams') ? path : `/pams${path}`) };
    const [loading, setLoading] = useState(false);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState('');
    const [previewTitle, setPreviewTitle] = useState('');
    const [userOptions, setUserOptions] = useState<{ label: string; value: string; org: string; contact: string }[]>([]);

    // Ticket search states
    const [ticketOptions, setTicketOptions] = useState<{ value: string; label: string; record: any }[]>([]);
    const [ticketInputValue, setTicketInputValue] = useState('');
    const [selectedTicket, setSelectedTicket] = useState<any>(null);

    // Smart Fill State
    const [smartFillText, setSmartFillText] = useState('');
    const [smartFilling, setSmartFilling] = useState(false);
    const [unmatchedFields, setUnmatchedFields] = useState<Set<string>>(new Set());

    // Dictionary Options State
    const [dicts, setDicts] = useState<Record<string, DictItem[]>>({
        issue_category: [],
        issue_detailed_classification: [],
        module: [],
        system: [],
        business_group: [],
        organization: [],
    });

    useEffect(() => {
        if (user) {
            form.setFieldsValue({
                tracker_name: user.real_name,
                tracker_org: user.organization,
                tracker_contact: user.contact,
                category: '工单问题',
                detailed_classification: '工单阻塞问题',
            });
        } else {
            // For guest, try to load last usage
            const lastTrackerName = localStorage.getItem('guest_tracker_name');
            const lastTrackerContact = localStorage.getItem('guest_tracker_contact');
            const lastTrackerOrg = localStorage.getItem('guest_tracker_org');

            form.setFieldsValue({
                tracker_name: lastTrackerName,
                tracker_contact: lastTrackerContact,
                tracker_org: lastTrackerOrg,
                category: '工单问题',
                detailed_classification: '工单阻塞问题',
            });
        }
    }, [user, form]);

    useEffect(() => {
        fetchDicts();
    }, []);

    const fetchDicts = async () => {
        try {
            const types = ['issue_category', 'issue_detailed_classification', 'module', 'system', 'business_group', 'organization'];
            const results = await Promise.all(
                types.map(type => fetch(`/PAMS/api/dicts?dict_code=${type}`).then(res => res.json()))
            );

            const newDicts: Record<string, DictItem[]> = { ...dicts };
            types.forEach((type, index) => {
                if (results[index].success) {
                    newDicts[type] = results[index].data;
                }
            });
            setDicts(newDicts);

        } catch (error) {
            console.error('Failed to fetch dicts', error);
        }
    };

    const handleTicketSearch = async (value: string) => {
        setTicketInputValue(value);
        if (!value) {
            setTicketOptions([]);
            return;
        }
        try {
            const res = await fetch(`/PAMS/api/business-ticket?ticket_no=${encodeURIComponent(value)}`);
            const data = await res.json();
            const items = data.items || data.data?.items || [];
            if (items.length) {
                setTicketOptions(
                    items.map((item: any) => ({
                        value: item.ticket_no,
                        label: `${item.ticket_no} - ${item.subsystem || '无系统信息'} - ${item.problem_description?.substring(0, 30) || '无描述'}`,
                        record: item,
                    }))
                );
            }
        } catch (err) {
            console.error('搜索工单失败', err);
        }
    };

    const handleTicketSelect = (value: string, option: any) => {
        const ticket = option.record;
        if (!ticket) return;
        setSelectedTicket(ticket);
        setTicketInputValue(ticket.ticket_no);
        
        // Auto-fill values
        const updates: any = {
            work_order_no: ticket.ticket_no,
        };
        
        if (ticket.problem_description) {
            updates.summary = ticket.problem_description.substring(0, 100);
            let detailsVal = ticket.problem_description;
            if (ticket.remarks) {
                detailsVal += `\n备注：${ticket.remarks}`;
            }
            updates.details = detailsVal;
        }
        
        // Subsystem matching
        if (ticket.subsystem) {
            const subsystemVal = ticket.subsystem.trim().toLowerCase();
            // Find matching system in dicts.system
            let matchedSystem = dicts.system.find(item => 
                item.item_key.toLowerCase() === subsystemVal || 
                item.item_value.toLowerCase() === subsystemVal
            );
            
            if (!matchedSystem) {
                // Inclusion match
                matchedSystem = dicts.system.find(item => 
                    subsystemVal.includes(item.item_key.toLowerCase()) || 
                    item.item_key.toLowerCase().includes(subsystemVal) ||
                    subsystemVal.includes(item.item_value.toLowerCase()) || 
                    item.item_value.toLowerCase().includes(subsystemVal)
                );
            }
            
            if (matchedSystem) {
                updates.system = matchedSystem.item_key;
                // Trigger system change logic to set business_group and module
                if (matchedSystem.description) {
                    try {
                        const descObj = JSON.parse(matchedSystem.description);
                        if (typeof descObj === 'object') {
                            updates.business_group = descObj.bg;
                            updates.module = descObj.module;
                        } else {
                            updates.business_group = matchedSystem.description;
                            updates.module = undefined;
                        }
                    } catch (e) {
                        updates.business_group = matchedSystem.description;
                        updates.module = undefined;
                    }
                } else {
                    updates.business_group = undefined;
                    updates.module = undefined;
                }
            } else {
                updates.system = undefined;
                updates.module = undefined;
                updates.business_group = undefined;
            }
        } else {
            updates.system = undefined;
            updates.module = undefined;
            updates.business_group = undefined;
        }
        
        form.setFieldsValue(updates);
        message.success('已自动带入工单数据');
    };

    const handleTicketChange = (val: string) => {
        setTicketInputValue(val);
        if (!val) {
            setSelectedTicket(null);
            form.setFieldsValue({
                work_order_no: undefined,
            });
        }
    };

    const handleSearchUser = async (value: string) => {
        if (!value) {
            setUserOptions([]);
            return;
        }
        try {
            const res = await fetch(`/PAMS/api/users?search=${encodeURIComponent(value)}&pageSize=10`);
            const data = await res.json();
            if (data.success) {
                setUserOptions(data.data.items.map((u: any) => ({
                    label: `${u.real_name} (${u.username})`,
                    value: u.username,
                    name: u.real_name,
                    org: u.organization,
                    contact: u.contact
                })));
            }
        } catch {
            console.error('搜索用户失败');
        }
    };

    const handleShare = () => {
        const url = window.location.origin + '/#/pams/report-ticket';
        navigator.clipboard.writeText(url);
        message.success('上报页链接已复制到剪贴板');
    };

    const handleUserSelect = (value: string, option: any) => {
        if (form.getFieldValue('selectingField') === 'reporter') {
            form.setFieldsValue({
                reporter_name: option.name,
                reporter_org: option.org,
                reporter_contact: option.contact
            });
        } else {
            form.setFieldsValue({
                tracker_name: option.name,
                tracker_org: option.org,
                tracker_contact: option.contact
            });
        }
    };

    const onFinish = async (values: Record<string, unknown>) => {
        setLoading(true);
        try {
            const attachments = fileList.map(file => {
                const rawUrl = file.response?.data?.url || file.url;
                return extractPurePath(rawUrl);
            }).filter(Boolean);

            if (values.tracker_name) {
                localStorage.setItem('guest_tracker_name', values.tracker_name as string);
            }
            if (values.tracker_contact) {
                localStorage.setItem('guest_tracker_contact', values.tracker_contact as string);
            }
            if (values.tracker_org) {
                localStorage.setItem('guest_tracker_org', values.tracker_org as string);
            }

            const res = await fetch('/PAMS/api/issues', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...values,
                    attachments,
                }),
            });

            const data = await res.json();
            if (data.success) {
                message.success('提交成功');
                router.push('/my-issues');
            } else {
                message.error(data.error || '提交失败');
            }
        } catch (error) {
            console.error('Submit error:', error);
            message.error('提交失败，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    const handleSystemChange = (value: string) => {
        const systemItem = dicts.system.find(item => item.item_key === value);
        if (systemItem && systemItem.description) {
            try {
                const descObj = JSON.parse(systemItem.description);
                if (typeof descObj === 'object') {
                    form.setFieldValue('business_group', descObj.bg);
                    form.setFieldValue('module', descObj.module);
                    return;
                }
            } catch (e) {
                form.setFieldValue('business_group', systemItem.description);
                form.setFieldValue('module', undefined);
            }
        } else {
            form.setFieldValue('business_group', undefined);
            form.setFieldValue('module', undefined);
        }
    };

    const handleSmartFill = async () => {
        if (!smartFillText.trim()) {
            message.warning('请输入要解析的文本');
            return;
        }

        setSmartFilling(true);
        try {
            const res = await fetch('/PAMS/api/issues/smart-fill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: smartFillText })
            });

            const data = await res.json();
            if (data.success && data.data) {
                const result = data.data;
                const newUnmatched = new Set<string>();

                const updates: any = {};

                if (result.reporter_name) {
                    updates.reporter_name = result.reporter_name;
                    if (result.unmatched_fields.includes('reporter_name')) {
                        newUnmatched.add('reporter_name');
                    }
                }

                if (result.reporter_org) {
                    updates.reporter_org = result.reporter_org;
                    if (result.unmatched_fields.includes('reporter_org')) {
                        newUnmatched.add('reporter_org');
                    }
                }

                if (result.reporter_contact) {
                    updates.reporter_contact = result.reporter_contact;
                }

                if (result.summary) {
                    updates.summary = result.summary;
                }

                if (result.details) {
                    updates.details = result.details;
                }

                if (result.system) {
                    updates.system = result.system;
                    if (result.unmatched_fields.includes('system')) {
                        newUnmatched.add('system');
                    }
                    handleSystemChange(result.system);
                }

                form.setFieldsValue(updates);
                setUnmatchedFields(newUnmatched);

                let successMsg = '智能填入成功';
                if (newUnmatched.size > 0) {
                    successMsg += `，${newUnmatched.size}个字段需要手动确认（已用蓝色字体标记）`;
                }
                message.success(successMsg);
            } else {
                message.error(data.error || '智能填入失败');
            }
        } catch (error) {
            console.error('[Smart Fill] Error:', error);
            message.error('智能填入失败，请检查网络或稍后重试');
        } finally {
            setSmartFilling(false);
        }
    };

    const handleCancelPreview = () => setPreviewOpen(false);

    const handlePreview = async (file: UploadFile) => {
        const fileName = file.name || '';
        if (isDocumentFile(fileName)) {
            const url = file.url || file.response?.data?.url;
            if (url) {
                const link = document.createElement('a');
                link.href = url;
                link.download = fileName;
                link.target = '_blank';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
            return;
        }
        if (!file.url && !file.preview) {
            file.preview = await getBase64(file.originFileObj as any);
        }
        const url = file.url || (file.preview as string);
        setPreviewImage(url);
        setPreviewOpen(true);
        setPreviewTitle(fileName || url.substring(url.lastIndexOf('/') + 1));
    };

    const getBase64 = (file: File): Promise<string> =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
        });

    const handleUploadChange = ({ fileList: newFileList }: { fileList: UploadFile[] }) => {
        const processed = newFileList.map(f => {
            const fname = f.name || '';
            if (isDocumentFile(fname) && !f.thumbUrl) {
                return { ...f, thumbUrl: getDocThumbDataUrl(fname) };
            }
            return f;
        });
        setFileList(processed);
    };

    const ISSUE_TEMPLATE = `请详细描述问题，要包含以下内容：
【问题现象描述】
【界面菜单】页面菜单信息
【全局流水号】页面报错中的流水号
【操作步骤】
【测试数据】用户信息、客户信息、账户信息等
【报错信息描述+错误代码】可以截图`;

    const VERSION_CHANGE_TEMPLATE = `请详细描述换版情况，要包含以下内容：
【情况说明】描述问题发生的现象、原因等。
【解决方案】描述问题解决的方式，程序、参数、数据修改的详细内容。`;

    const handleFillTemplate = (template: string) => {
        const currentDetails = form.getFieldValue('details') || '';
        if (currentDetails.trim()) {
            Modal.confirm({
                title: '确认覆盖',
                content: '当前已有内容，是否覆盖？',
                onOk: () => form.setFieldValue('details', template)
            });
        } else {
            form.setFieldValue('details', template);
        }
    };

    return (
        <div className="pams-page-container">
            {/* 粘性头部 */}
            <div className="pams-sticky-header">
                <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500, color: '#333' }}>问题上报 (工单)</h2>
                        <Space>
                            <Button
                                icon={<ShareAltOutlined />}
                                onClick={handleShare}
                            />
                            <Button
                                type="primary"
                                icon={<SendOutlined />}
                                onClick={() => form.submit()}
                                loading={loading}
                            >
                                提交问题
                            </Button>
                        </Space>
                    </div>
                </div>
            </div>

            {/* 可滚动的内容区域 */}
            <div className="pams-scroll-content">
                <div style={{ maxWidth: 1000, margin: '0 auto' }}>
                    <Card size="small" style={{ marginBottom: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                        <Form
                            form={form}
                            layout="vertical"
                            onFinish={onFinish}
                        >
                            {/* Smart Fill Section - Compact */}
                            <div style={{ marginBottom: 16, padding: '12px', background: 'var(--radar-primary-soft)', borderRadius: 0, border: '1px solid var(--radar-primary-fade)' }}>
                                <div style={{ marginBottom: 4, fontSize: '13px', fontWeight: 500 }}>
                                    智能填入
                                    <Tooltip title="粘贴包含问题信息的文本，AI会自动识别并填入表单。蓝色字体的字段表示未匹配到，需要手动确认。">
                                        <span style={{ marginLeft: 4, color: '#999', cursor: 'help', fontSize: '12px' }}>(?)</span>
                                    </Tooltip>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: '200px' }}>
                                        <TextArea
                                            rows={3}
                                            value={smartFillText}
                                            onChange={(e) => setSmartFillText(e.target.value)}
                                            placeholder="粘贴问题描述文本（报障人、机构、联系方式、问题概述、详情、系统等）..."
                                            style={{ fontSize: '13px' }}
                                        />
                                    </div>
                                    <div style={{ width: screens.xs ? '100%' : 'auto' }}>
                                        <Button
                                            type="primary"
                                            onClick={handleSmartFill}
                                            loading={smartFilling}
                                            disabled={!smartFillText.trim()}
                                            block={!screens.sm}
                                            style={{ backgroundColor: '#389e0d', borderColor: '#389e0d', color: '#fff' }}
                                        >
                                            智能填入
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* 关联工单编号 */}
                            <Row gutter={16}>
                                <Col span={24}>
                                    <Form.Item label="关联工单" required tooltip="输入工单编号进行联想匹配选择">
                                        <AutoComplete
                                            value={ticketInputValue}
                                            options={ticketOptions}
                                            onSearch={handleTicketSearch}
                                            onSelect={handleTicketSelect}
                                            onChange={handleTicketChange}
                                            placeholder="请输入工单编号并选择匹配项..."
                                            defaultActiveFirstOption={false}
                                            suffixIcon={null}
                                            filterOption={false}
                                            notFoundContent={null}
                                            allowClear
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            {/* 提出人信息 */}
                            <Row gutter={16}>
                                <Col xs={24} sm={8}>
                                    <Form.Item label="跟踪人" name="tracker_name" rules={[{ required: true, message: '请输入跟踪人姓名' }]}>
                                        <AutoComplete
                                            options={userOptions}
                                            onSearch={handleSearchUser}
                                            onSelect={handleUserSelect}
                                            onFocus={() => form.setFieldValue('selectingField', 'tracker')}
                                            placeholder="请输入跟踪人的姓名并选择"
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={8}>
                                    <Form.Item label="所属机构" name="tracker_org" rules={[{ required: true, message: '请输入所属机构' }]}>
                                        <Select placeholder="选择或由上一步自动带出">
                                            {dicts.organization?.map(item => (
                                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={8}>
                                    <Form.Item label="联系方式" name="tracker_contact" rules={[{ required: true, pattern: /^[0-9]+$/, message: '请输入纯数字' }]}>
                                        <Input placeholder="常用手机号" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            {/* 报障人信息 */}
                            <Row gutter={16}>
                                <Col xs={24} sm={8}>
                                    <Form.Item
                                        label="报障人 (选填)"
                                        name="reporter_name"
                                    >
                                        <AutoComplete
                                            options={userOptions}
                                            onSearch={handleSearchUser}
                                            onSelect={handleUserSelect}
                                            onFocus={() => form.setFieldValue('selectingField', 'reporter')}
                                            placeholder="请输入报障人的姓名并选择"
                                            style={unmatchedFields.has('reporter_name') ? { color: '#1890ff' } : {}}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={8}>
                                    <Form.Item
                                        label="所属机构 (选填)"
                                        name="reporter_org"
                                        help={unmatchedFields.has('reporter_org') ? <span style={{ color: '#1890ff' }}>未匹配到，请手动确认</span> : undefined}
                                    >
                                        <Select placeholder="选择或由上一步自动带出" allowClear>
                                            {dicts.organization?.map(item => (
                                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={8}>
                                    <Form.Item label="联系方式 (选填)" name="reporter_contact" rules={[{ pattern: /^[0-9]*$/, message: '请输入纯数字' }]}>
                                        <Input placeholder="常用手机号" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            {/* 隐藏的工单编号表单项 */}
                            <Form.Item name="work_order_no" hidden>
                                <Input />
                            </Form.Item>

                            {/* 问题分类和详细分类 */}
                            <Row gutter={16}>
                                <Col xs={24} sm={12}>
                                    <Form.Item label="问题分类" name="category" rules={[{ required: true, message: '请选择问题分类' }]}>
                                        <Select placeholder="请选择问题分类">
                                            {dicts.issue_category?.map(item => (
                                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12}>
                                    <Form.Item label="详细分类" name="detailed_classification" rules={[{ required: true, message: '请选择详细分类' }]}>
                                        <Select placeholder="请选择详细分类">
                                            {dicts.issue_detailed_classification?.map(item => (
                                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item
                                label="问题概述"
                                name="summary"
                                rules={[{ required: true, message: '请输入问题概述' }, { max: 100, message: '问题概述不超过100字' }]}
                            >
                                <Input maxLength={100} showCount placeholder="一句话描述问题" />
                            </Form.Item>

                            <Form.Item
                                label={
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <span>问题详情</span>
                                        <a style={{ fontSize: 12 }} onClick={() => handleFillTemplate(ISSUE_TEMPLATE)}>填入问题模板</a>
                                        <a style={{ fontSize: 12 }} onClick={() => handleFillTemplate(VERSION_CHANGE_TEMPLATE)}>填入换版模板</a>
                                    </div>
                                }
                                name="details"
                                rules={[{ required: true, message: '请输入问题详情' }]}
                            >
                                <TextArea rows={7} placeholder={ISSUE_TEMPLATE} />
                            </Form.Item>

                            <Form.Item
                                label="所属系统"
                                name="system"
                                rules={[{ required: true, message: '请选择所属系统' }]}
                                help={unmatchedFields.has('system') ? <span style={{ color: '#1890ff' }}>未匹配到，请手动选择</span> : undefined}
                            >
                                <Select placeholder="请选择受影响的系统" onChange={handleSystemChange} showSearch optionFilterProp="children"
                                    filterOption={(input, option) => {
                                        if (!option) return false;
                                        const { children } = option;
                                        const str = String(children || '').toLowerCase();
                                        return str.includes(input.toLowerCase());
                                    }}
                                >
                                    {dicts.system.map(item => (
                                        <Select.Option key={item.item_key} value={item.item_key}>{`${item.item_key}-${item.item_value}`}</Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>

                            <Form.Item label="问题截图/附件 (图片或文档, 单个 < 10MB)">
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
                                    <Upload
                                        className="mobile-upload-compact"
                                        action="/api/pams/upload"
                                        headers={{
                                            'X-Requested-By': 'RADAR',
                                            Authorization: `Bearer ${localStorage.getItem('radar_token') || ''}`,
                                        }}
                                        listType="picture-card"
                                        fileList={fileList}
                                        onPreview={handlePreview}
                                        onChange={handleUploadChange}
                                        accept={UPLOAD_ACCEPT_STRING}
                                        beforeUpload={async (file) => {
                                            const error = validateUploadFile(file);
                                            if (error) {
                                                message.error(error);
                                                return Upload.LIST_IGNORE;
                                            }

                                            if (isDocumentFile(file.name)) {
                                                return file;
                                            }

                                            try {
                                                message.loading({ content: '正在压缩图片...', key: 'compress' });
                                                const compressedFile = await compressImage(file, {
                                                    maxWidth: 2560,
                                                    maxHeight: 2560,
                                                    quality: 0.9,
                                                    maxSizeMB: 2
                                                });
                                                message.success({ content: '图片压缩完成', key: 'compress', duration: 1 });
                                                return compressedFile;
                                            } catch (err) {
                                                message.error({ content: '图片压缩失败', key: 'compress' });
                                                return Upload.LIST_IGNORE;
                                            }
                                        }}

                                        onRemove={() => {
                                            return new Promise((resolve) => {
                                                Modal.confirm({
                                                    title: '确认删除',
                                                    content: '确定要删除这张截图吗？',
                                                    okText: '确认',
                                                    cancelText: '取消',
                                                    onOk: () => resolve(true),
                                                    onCancel: () => resolve(false),
                                                });
                                            });
                                        }}
                                    >
                                        {fileList.length < 9 && (
                                            <div>
                                                <PlusOutlined />
                                                <div style={{ marginTop: 8 }}>上传</div>
                                            </div>
                                        )}
                                    </Upload>
                                    {screens.md && fileList.length < 9 && (
                                        <div
                                            tabIndex={0}
                                            style={{
                                                width: 102,
                                                height: 102,
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: '1px dashed #d9d9d9',
                                                borderRadius: 8,
                                                color: '#999',
                                                cursor: 'pointer',
                                                fontSize: 12,
                                                textAlign: 'center',
                                                transition: 'border-color 0.3s',
                                            }}
                                            onFocus={(e) => {
                                                e.currentTarget.style.borderColor = '#1677ff';
                                            }}
                                            onBlur={(e) => {
                                                e.currentTarget.style.borderColor = '#d9d9d9';
                                            }}
                                            onPaste={async (e) => {
                                                const items = e.clipboardData?.items;
                                                if (!items) return;

                                                for (const item of Array.from(items)) {
                                                    if (item.type.startsWith('image/')) {
                                                        const blob = item.getAsFile();
                                                        if (!blob) continue;

                                                        const file = new File([blob], `paste_${Date.now()}.png`, { type: blob.type });

                                                        const error = validateUploadFile(file);
                                                        if (error) {
                                                            message.error(error);
                                                            return;
                                                        }

                                                        try {
                                                            message.loading({ content: '处理中...', key: 'paste' });

                                                            const compressedFile = await compressImage(file, {
                                                                maxWidth: 2560,
                                                                maxHeight: 2560,
                                                                quality: 0.9,
                                                                maxSizeMB: 2
                                                            });

                                                            const formData = new FormData();
                                                            formData.append('file', compressedFile);

                                                            const response = await fetch('/PAMS/api/upload', {
                                                                method: 'POST',
                                                                body: formData,
                                                            });

                                                            const data = await response.json();
                                                            if (data.success && data.data?.url) {
                                                                 const newFile: UploadFile = {
                                                                    uid: `-paste-${Date.now()}`,
                                                                    name: compressedFile.name,
                                                                    status: 'done',
                                                                    url: data.data.url,
                                                                };
                                                                setFileList(prev => [...prev, newFile]);
                                                                message.success({ content: '粘贴成功', key: 'paste' });
                                                            } else {
                                                                message.error({ content: '上传失败', key: 'paste' });
                                                            }
                                                        } catch (err) {
                                                            message.error({ content: '处理失败', key: 'paste' });
                                                        }
                                                        break;
                                                    }
                                                }
                                            }}
                                        >
                                            📋<br />Ctrl+V<br />粘贴
                                        </div>
                                    )}
                                </div>
                            </Form.Item>

                            <Row gutter={16}>
                                <Col xs={24} sm={12}>
                                    <Form.Item label="所属板块" name="module">
                                        <Select placeholder="系统关联板块" disabled>
                                            {dicts.module.map(item => (
                                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12}>
                                    <Form.Item label="所属实施机构" name="business_group">
                                        <Select placeholder="系统关联实施机构" disabled>
                                            {dicts.business_group.map(item => (
                                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                            </Row>
                        </Form>
                    </Card>
                </div>
            </div>

            <Modal open={previewOpen} title={previewTitle} footer={null} onCancel={handleCancelPreview}>
                <Image
                    alt="preview"
                    style={{ width: '100%' }}
                    src={previewImage}
                    preview={{
                        mask: '点击放大',
                    }}
                />
            </Modal>
        </div>
    );
}

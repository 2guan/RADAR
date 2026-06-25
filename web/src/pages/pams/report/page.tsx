/**
 * @file page.tsx
 * @description PAMS 缺陷故障在线申报提报（技术人及游客）页面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Form, Input, Select, Button, Upload, message, Card, AutoComplete, Row, Col, Modal, Radio, Space, Grid, Image, Divider, Tooltip } from 'antd';
import { UploadOutlined, PlusOutlined, SendOutlined, ShareAltOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useAuth } from '@/components/AuthProvider';
import { useNavigate } from 'react-router-dom';
import type { UploadFile } from 'antd/es/upload/interface';
import type { DictItem } from '@/types';
import { extractPurePath } from '@/lib/urlUtils';
import { compressImage, validateUploadFile, isDocumentFile, getDocThumbDataUrl, UPLOAD_ACCEPT_STRING } from '@/lib/imageUtils';
import { pamsFetch } from '@/lib/api-client';

const { TextArea } = Input;
const fetch = pamsFetch;

export default function ReportReporterPage() {
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
    const [caseOptions, setCaseOptions] = useState<{ value: string; label: string; case_id: string; scenario: string }[]>([]);
    const [caseInputValue, setCaseInputValue] = useState('');
    const [linkedCases, setLinkedCases] = useState<{ case_id: string; case_name: string }[]>([]);
    const [userOptions, setUserOptions] = useState<{ label: string; value: string; org: string; contact: string }[]>([]);

    // Smart Fill State
    const [smartFillText, setSmartFillText] = useState('');
    const [smartFilling, setSmartFilling] = useState(false);
    const [unmatchedFields, setUnmatchedFields] = useState<Set<string>>(new Set());

    // Dictionary Options State
    const [dicts, setDicts] = useState<Record<string, DictItem[]>>({
        issue_category: [],
        module: [],
        system: [],
        business_group: [],
        organization: [],
    });

    useEffect(() => {
        if (user) {
            form.setFieldsValue({
                reporter_name: user.real_name,
                reporter_org: user.organization,
                reporter_contact: user.contact,
                category: '未分类',
            });
        } else {
            // For guest, try to load last usage
            const lastReporterName = localStorage.getItem('guest_reporter_name');
            const lastReporterContact = localStorage.getItem('guest_reporter_contact');
            const lastReporterOrg = localStorage.getItem('guest_reporter_org');

            form.setFieldsValue({
                reporter_name: lastReporterName,
                reporter_contact: lastReporterContact,
                reporter_org: lastReporterOrg,
                category: '未分类',
            });
        }
    }, [user, form]);

    useEffect(() => {
        fetchDicts();
    }, []);

    const fetchDicts = async () => {
        try {
            const types = ['issue_category', 'module', 'system', 'business_group', 'organization'];
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

            // Set default category if found
            const defaultCategory = newDicts.issue_category?.find(item => item.is_default_val === 1);
            if (defaultCategory) {
                form.setFieldValue('category', defaultCategory.item_key);
            }

        } catch (error) {
            console.error('Failed to fetch dicts', error);
        }
    };

    const handleCaseSearch = async (value: string) => {
        setCaseInputValue(value);
        if (!value) {
            setCaseOptions([]);
            return;
        }
        try {
            const res = await fetch(`/PAMS/api/cases?keyword=${encodeURIComponent(value)}`);
            const data = await res.json();
            if (data.success) {
                setCaseOptions(
                    data.data.items.map((item: { case_id: string; scenario: string; system: string }) => ({
                        value: `${item.case_id} - ${item.scenario || '无场景描述'}`,
                        label: `${item.case_id} - ${item.scenario || '无场景描述'} - ${item.system || '无系统信息'}`,
                        case_id: item.case_id,
                        scenario: item.scenario || '无场景描述',
                    }))
                );
            }
        } catch {
            console.error('搜索案例失败');
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
        const url = window.location.origin + '/#/pams/report';
        navigator.clipboard.writeText(url);
        message.success('上报页链接已复制到剪贴板');
    };

    const handleUserSelect = (value: string, option: any) => {
        form.setFieldsValue({
            reporter_name: option.name,
            reporter_org: option.org,
            reporter_contact: option.contact
        });
    };

    const handleCaseSelect = (value: string, option: any) => {
        if (option?.case_id) {
            // Check if already linked
            if (linkedCases.some(c => c.case_id === option.case_id)) {
                message.warning('该案例已关联');
                return;
            }
            // Add to linked cases
            setLinkedCases(prev => [...prev, { case_id: option.case_id, case_name: option.scenario }]);
            setCaseInputValue('');
            setCaseOptions([]);
        }
    };

    const onFinish = async (values: Record<string, unknown>) => {
        setLoading(true);
        try {
            const attachments = fileList.map(file => {
                const rawUrl = file.response?.data?.url || file.url;
                return extractPurePath(rawUrl);
            }).filter(Boolean);

            if (values.reporter_name) {
                localStorage.setItem('guest_reporter_name', values.reporter_name as string);
            }
            if (values.reporter_contact) {
                localStorage.setItem('guest_reporter_contact', values.reporter_contact as string);
            }
            if (values.reporter_org) {
                localStorage.setItem('guest_reporter_org', values.reporter_org as string);
            }

            const res = await fetch('/PAMS/api/issues', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    ...values,
                    tracker_name: '',
                    tracker_org: '',
                    tracker_contact: '',
                    attachments,
                    linked_cases: linkedCases,
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

                // Populate form fields
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
                    // Trigger system change to auto-fill business_group and module
                    handleSystemChange(result.system);
                }

                // Update form
                form.setFieldsValue(updates);

                // Update linked cases
                if (result.linked_cases && result.linked_cases.length > 0) {
                    setLinkedCases(result.linked_cases);
                }

                setUnmatchedFields(newUnmatched);

                // Show success message with details
                let successMsg = '智能填入成功';
                if (newUnmatched.size > 0) {
                    successMsg += `，${newUnmatched.size}个字段需要手动确认（已用蓝色字体标记）`;
                }
                message.success(successMsg);

                // Log confidence scores
                if (result.match_confidence) {
                    console.log('[Smart Fill] Match confidence:', result.match_confidence);
                }
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
        // Document files: download instead of preview
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
        // For document files, set thumbUrl so picture-card shows emoji instead of broken image
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
                        <h2 style={{ margin: 0, fontSize: 12, fontWeight: 400, color: '#888' }}>　　请详细填写问题，快速上报</h2>
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
                            {/* 报障人信息 */}
                            <Row gutter={16}>
                                <Col xs={24} sm={8}>
                                    <Form.Item label="报障人" name="reporter_name" rules={[{ required: true, message: '请输入报障人姓名' }]}>
                                        <AutoComplete
                                            options={userOptions}
                                            onSearch={handleSearchUser}
                                            onSelect={handleUserSelect}
                                            placeholder="请输入报障人的姓名并选择"
                                        />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={8}>
                                    <Form.Item label="所属机构" name="reporter_org" rules={[{ required: true, message: '请输入所属机构' }]}>
                                        <Select placeholder="选择或由上一步自动带出">
                                            {dicts.organization?.map(item => (
                                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                                            ))}
                                        </Select>
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={8}>
                                    <Form.Item label="联系方式" name="reporter_contact" rules={[{ required: true, pattern: /^[0-9]+$/, message: '请输入纯数字' }]}>
                                        <Input placeholder="常用手机号" />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Row gutter={16}>
                                <Col span={24}>
                                    <Form.Item label="关联案例 (选填)">
                                        <AutoComplete
                                            value={caseInputValue}
                                            options={caseOptions}
                                            onSearch={handleCaseSearch}
                                            onSelect={handleCaseSelect}
                                            onChange={(value) => setCaseInputValue(value || '')}
                                            placeholder="输入案例 ID 或关键字搜索添加..."
                                            defaultActiveFirstOption={false}
                                            suffixIcon={null}
                                            filterOption={false}
                                            notFoundContent={null}
                                            allowClear
                                            style={{ marginBottom: linkedCases.length > 0 ? 8 : 0 }}
                                        />
                                        {linkedCases.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                {linkedCases.map((caseItem, index) => (
                                                    <div key={caseItem.case_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: 'var(--radar-bg)', border: '1px solid var(--radar-border)', borderRadius: 0 }}>
                                                        <span style={{ flex: 1, fontSize: 12 }}>
                                                            {caseItem.case_id}{caseItem.case_name ? ` - ${caseItem.case_name}` : ''}
                                                        </span>
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            danger
                                                            icon={<DeleteOutlined />}
                                                            onClick={() => {
                                                                setLinkedCases(prev => prev.filter((_, i) => i !== index));
                                                            }}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Form.Item name="category" hidden>
                                <Input />
                            </Form.Item>

                            <Form.Item label="问题概述" name="summary" rules={[{ required: true, message: '请输入问题概述' }, { max: 100, message: '问题概述不超过100字' }]}>
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

                            <Form.Item label="所属系统" name="system" rules={[{ required: true, message: '请选择所属系统' }]}>
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

                                            // Document files: upload directly without compression
                                            if (isDocumentFile(file)) {
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
                                    {/* Paste box - only on desktop, same size as upload button */}
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

                            {/* Smart Fill Section - Moved to Bottom */}
                            <div style={{ marginTop: 16, padding: '12px', background: 'var(--radar-primary-soft)', borderRadius: 0, border: '1px solid var(--radar-primary-fade)' }}>
                                <div style={{ marginBottom: 4, fontSize: '13px', fontWeight: 500 }}>
                                    智能填入
                                    <Tooltip title="粘贴包含问题信息的文本，AI会自动识别并填入表单。蓝色字体的字段表示未匹配到，需要手动修改。">
                                        <span style={{ marginLeft: 4, color: '#999', cursor: 'help', fontSize: '12px' }}>(?)</span>
                                    </Tooltip>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: '200px' }}>
                                        <TextArea
                                            rows={4}
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

/**
 * @file page.tsx
 * @description PAMS 常见典型问题自助库与 FAQ 列表展示页面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { App, Collapse, Empty, Spin, Tag, Card, Input, Select, Space, Button, Modal, message, Drawer, Form, Row, Col, Typography, Upload, Grid, Image } from 'antd';
import { QuestionCircleOutlined, BulbOutlined, CheckCircleOutlined, SearchOutlined, ReloadOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SaveOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { UploadFile, RcFile, UploadProps } from 'antd/es/upload/interface';
import { useAuth } from '@/components/AuthProvider';
import { pamsFetch } from '@/lib/api-client';

const { TextArea } = Input;
const { Paragraph } = Typography;
const { useBreakpoint } = Grid;
const fetch = pamsFetch;

interface CommonIssue {
    id: number;
    summary: string;
    cause: string;
    solution: string;
    screenshots: string; // JSON string
    tags: string; // JSON string
    created_by: string;
    created_at: string;
    updated_at: string;
}

interface DictItem {
    dict_code: string;
    item_key: string;
    item_value: string;
}

export default function FAQPage() {
    const { message, modal } = App.useApp();
    const { user } = useAuth();
    const screens = useBreakpoint();
    const [faqs, setFaqs] = useState<CommonIssue[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchKeyword, setSearchKeyword] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [tags, setTags] = useState<DictItem[]>([]);

    // Admin State
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [currentIssue, setCurrentIssue] = useState<CommonIssue | null>(null);
    const [savingIssue, setSavingIssue] = useState(false);
    const [fileList, setFileList] = useState<UploadFile[]>([]);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImage, setPreviewImage] = useState('');
    const [form] = Form.useForm();

    const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.username === 'admin';

    useEffect(() => {
        fetchFAQs();
        fetchTags();
    }, []);

    const fetchTags = async () => {
        try {
            const res = await fetch('/PAMS/api/dicts?dict_code=issue_tag');
            const data = await res.json();
            if (data.success) {
                setTags(data.data);
            }
        } catch (e) {
            console.error('Failed to fetch tags', e);
        }
    };

    const fetchFAQs = async () => {
        setLoading(true);
        try {
            // Fetch all for client-side filtering (better UX for FAQ style)
            const res = await fetch(`/PAMS/api/common-issues?pageSize=1000&_t=${new Date().getTime()}`);
            const data = await res.json();
            if (data.success) {
                setFaqs(data.data.items);
            }
        } catch (error) {
            console.error('获取常见问题失败:', error);
            message.error('获取常见问题失败');
        } finally {
            setLoading(false);
        }
    };

    // Calculate all available tags from data + dicts
    const availableTags = useMemo(() => {
        const uniqueTags = new Set<string>();
        // Add tags from existing issues
        faqs.forEach(faq => {
            try {
                const t = JSON.parse(faq.tags || '[]');
                if (Array.isArray(t)) t.forEach((tag: string) => uniqueTags.add(tag));
            } catch { }
        });
        // Add tags from dictionary
        tags.forEach(t => uniqueTags.add(t.item_key));
        return Array.from(uniqueTags);
    }, [faqs, tags]);

    const filteredFaqs = faqs.filter(faq => {
        const matchesKeyword = searchKeyword === '' ||
            faq.summary.toLowerCase().includes(searchKeyword.toLowerCase()) ||
            (faq.cause && faq.cause.toLowerCase().includes(searchKeyword.toLowerCase())) ||
            (faq.solution && faq.solution.toLowerCase().includes(searchKeyword.toLowerCase()));

        let issueTags: string[] = [];
        try { issueTags = JSON.parse(faq.tags || '[]'); } catch { }

        const matchesTag = !selectedTag || issueTags.includes(selectedTag);

        return matchesKeyword && matchesTag;
    });

    // --- Admin Handlers ---

    const handleCreate = () => {
        setCurrentIssue(null);
        form.resetFields();
        setFileList([]);
        setDrawerVisible(true);
    };

    const handleEdit = (e: React.MouseEvent, record: CommonIssue) => {
        e.stopPropagation();
        setCurrentIssue(record);

        // Parse JSON fields
        let parsedTags = [];
        try { parsedTags = JSON.parse(record.tags || '[]'); } catch { }

        let parsedScreenshots = [];
        try { parsedScreenshots = JSON.parse(record.screenshots || '[]'); } catch { }

        form.setFieldsValue({
            summary: record.summary,
            cause: record.cause,
            solution: record.solution,
            tags: parsedTags,
        });

        // Set file list for upload
        const files = parsedScreenshots.map((url: string, index: number) => {
            // Handle potential double prefixing or missing prefix
            const fullUrl = url.startsWith('http') || url.startsWith('/PAMS') || url.startsWith('/api/')
                ? url
                : `/PAMS${url.startsWith('/') ? '' : '/'}${url}`;

            return {
                uid: `-${index}`,
                name: `Screenshot ${index + 1}`,
                status: 'done',
                url: fullUrl,
                response: { data: { url } } // Mock response structure for consistency
            };
        });
        setFileList(files as UploadFile[]);

        setDrawerVisible(true);
    };

    const handleDelete = (e: React.MouseEvent, record: CommonIssue) => {
        e.stopPropagation();
        modal.confirm({
            title: '确认删除',
            icon: <ExclamationCircleOutlined />,
            content: `确定要删除此常见问题吗？此操作不可恢复。`,
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const res = await fetch(`/PAMS/api/common-issues/${record.id}`, {
                        method: 'DELETE',
                    });
                    const data = await res.json();
                    if (data.success) {
                        message.success('删除成功');
                        fetchFAQs();
                    } else {
                        message.error(data.error || '删除失败');
                    }
                } catch {
                    message.error('删除请求失败');
                }
            },
        });
    };

    const handleSave = async (values: any) => {
        setSavingIssue(true);
        try {
            // Process screenshots
            const screenshots = fileList.map(file => {
                if (file.response && file.response.data && file.response.data.url) {
                    return file.response.data.url;
                }
                if (file.url) {
                    // Strip /PAMS prefix for storage if present
                    return file.url.replace(/^\/PAMS/, '');
                }
                return null;
            }).filter(Boolean);

            const payload = {
                ...values,
                screenshots,
                created_by: currentIssue ? currentIssue.created_by : user?.real_name || user?.username,
            };

            let url = '/PAMS/api/common-issues';
            let method = 'POST';
            if (currentIssue) {
                url = `/PAMS/api/common-issues/${currentIssue.id}`;
                method = 'PUT';
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();

            if (data.success) {
                message.success(currentIssue ? '更新成功' : '创建成功');
                setDrawerVisible(false);
                fetchFAQs();
            } else {
                message.error(data.error || '保存失败');
            }
        } catch (e) {
            message.error('保存失败');
        } finally {
            setSavingIssue(false);
        }
    };

    const uploadProps: UploadProps = {
        name: 'file',
        action: '/api/pams/upload',
        headers: {
            'X-Requested-By': 'RADAR',
            Authorization: `Bearer ${localStorage.getItem('radar_token') || ''}`,
        },
        listType: 'picture-card',
        fileList,
        onChange: ({ fileList: newFileList }) => setFileList(newFileList),
        onPreview: async (file) => {
            if (!file.url && !file.preview) {
                file.preview = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file.originFileObj as RcFile);
                    reader.onload = () => resolve(reader.result as string);
                });
            }
            setPreviewImage(file.url || (file.preview as string));
            setPreviewOpen(true);
        }
    };

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: 100 }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div>
            {/* Header Card */}
            <Card style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <QuestionCircleOutlined style={{ fontSize: 32, color: '#1677ff' }} />
                        <div>
                            <h2 style={{ margin: 0 }}>常见问题</h2>
                            <p style={{ margin: 0, color: '#666' }}>
                                收录常见问题解决方案。
                            </p>
                        </div>
                    </div>
                    <Space>
                        <Button icon={<ReloadOutlined />} onClick={fetchFAQs}>
                            {screens.xs ? null : '刷新'}
                        </Button>
                        {isAdmin && (
                            <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
                                {screens.xs ? null : '新增'}
                            </Button>
                        )}
                    </Space>
                </div>
            </Card>

            {/* Filter Bar */}
            <div style={{ marginBottom: 24, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Input.Search
                    placeholder="搜索关键词 (问题、原因、解决方案)"
                    size="large"
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    style={{ flex: 1, minWidth: 200 }}
                    allowClear
                />
                <Select
                    placeholder="按标签筛选"
                    size="large"
                    allowClear
                    style={{ minWidth: 160 }}
                    value={selectedTag}
                    onChange={setSelectedTag}
                    showSearch
                    optionFilterProp="children"
                >
                    {availableTags.map(tag => (
                        <Select.Option key={tag} value={tag}>{tag}</Select.Option>
                    ))}
                </Select>

            </div>

            {/* List */}
            {filteredFaqs.length === 0 ? (
                <Empty description="暂无常见问题" />
            ) : (
                <Collapse
                    accordion
                    items={filteredFaqs.map((faq, index) => {
                        let faqTags: string[] = [];
                        try { faqTags = JSON.parse(faq.tags || '[]'); } catch { }

                        let faqScreenshots: string[] = [];
                        try { faqScreenshots = JSON.parse(faq.screenshots || '[]'); } catch { }


                        return {
                            key: faq.id,
                            label: (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
                                    <span style={{
                                        width: 20,
                                        height: 20,
                                        borderRadius: 0,
                                        background: '#1677ff',
                                        color: '#fff',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 11,
                                        flexShrink: 0,
                                        marginTop: 2
                                    }}>
                                        {index + 1}
                                    </span>
                                    <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{faq.summary}</span>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {faqTags.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                                                {faqTags.map((tag: string) => {
                                                    const tagColors = ['purple', 'magenta', 'volcano', 'orange', 'gold', 'cyan', 'blue', 'geekblue'];
                                                    const hashCode = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                                                    return <Tag key={tag} color={tagColors[hashCode % tagColors.length]} style={{ margin: 0, fontSize: '10px', lineHeight: '18px' }}>{tag}</Tag>;
                                                })}
                                            </div>
                                        )}

                                        {isAdmin && (
                                            <Space size={2}>
                                                <Button size="small" type="text" icon={<EditOutlined />} onClick={(e) => handleEdit(e, faq)} />
                                                <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => handleDelete(e, faq)} />
                                            </Space>
                                        )}
                                    </div>
                                </div>
                            ),
                            children: (
                                <div>
                                    {faq.cause && (
                                        <div style={{ marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <BulbOutlined style={{ color: '#faad14', fontSize: '12px' }} />
                                                <strong style={{ fontSize: '13px' }}>问题原因</strong>
                                            </div>
                                            <div style={{
                                                padding: '8px 12px',
                                                background: '#fffbe6',
                                                borderRadius: 0,
                                                border: '1px solid #ffe58f',
                                                whiteSpace: 'pre-wrap',
                                                fontSize: '13px',
                                                lineHeight: 1.5
                                            }}>
                                                {faq.cause}
                                            </div>
                                        </div>
                                    )}

                                    {faq.solution && (
                                        <div style={{ marginBottom: 8 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '12px' }} />
                                                <strong style={{ fontSize: '13px' }}>解决方案</strong>
                                            </div>
                                            <div style={{
                                                padding: '8px 12px',
                                                background: '#f6ffed',
                                                borderRadius: 0,
                                                border: '1px solid #b7eb8f',
                                                whiteSpace: 'pre-wrap',
                                                fontSize: '13px',
                                                lineHeight: 1.5
                                            }}>
                                                {faq.solution}
                                            </div>
                                        </div>
                                    )}

                                    {faqScreenshots.length > 0 && (
                                        <div style={{ marginTop: 8 }}>
                                            <Image.PreviewGroup>
                                                <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                                                    {faqScreenshots.map((url, i) => {
                                                        const fullUrl = url.startsWith('http') || url.startsWith('/PAMS') || url.startsWith('/api/')
                                                            ? url
                                                            : `/PAMS${url.startsWith('/') ? '' : '/'}${url}`;
                                                        return (
                                                            <Image
                                                                key={i}
                                                                src={fullUrl}
                                                                alt={`screenshot-${i}`}
                                                                height={100}
                                                                style={{ border: '1px solid #eee', cursor: 'pointer', objectFit: 'cover', borderRadius: 0 }}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </Image.PreviewGroup>
                                        </div>
                                    )}

                                    {!faq.cause && !faq.solution && (
                                        <div style={{ color: '#999' }}>暂无原因分析和解决方案</div>
                                    )}
                                </div>
                            ),
                        };
                    })}
                />
            )}

            {/* Admin Drawer */}
            <Drawer
                title={currentIssue ? "编辑常见问题" : "新增常见问题"}
                onClose={() => setDrawerVisible(false)}
                open={drawerVisible}
                styles={{ wrapper: { width: screens.xs ? '100%' : 720 } }}
                extra={
                    <Space>
                        <Button onClick={() => setDrawerVisible(false)}>取消</Button>
                        <Button type="primary" onClick={() => form.submit()} loading={savingIssue} icon={<SaveOutlined />}>
                            保存
                        </Button>
                    </Space>
                }
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleSave}
                >
                    <Form.Item name="summary" label="问题概述" rules={[{ required: true, message: '请输入问题概述' }]}>
                        <Input placeholder="一句话描述问题" />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={24}>
                            <Form.Item name="tags" label="问题标签">
                                <Select mode="multiple" placeholder="选择或输入标签" tokenSeparators={[',']}>
                                    {tags.map(tag => (
                                        <Select.Option key={tag.item_key} value={tag.item_key}>{tag.item_value}</Select.Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item name="cause" label="问题原因">
                        <TextArea rows={6} placeholder="详细描述问题发生的原因" />
                    </Form.Item>

                    <Form.Item name="solution" label="解决方案">
                        <TextArea rows={6} placeholder="详细描述解决步骤" />
                    </Form.Item>

                    <Form.Item label="截图">
                        <Upload {...uploadProps}>
                            {fileList.length >= 8 ? null : <div><PlusOutlined /><div style={{ marginTop: 8 }}>上传</div></div>}
                        </Upload>
                    </Form.Item>
                </Form>
            </Drawer>

            <Modal open={previewOpen} footer={null} onCancel={() => setPreviewOpen(false)}>
                <img alt="preview" style={{ width: '100%' }} src={previewImage} />
            </Modal>
        </div>
    );
}


/**
 * @file page.tsx
 * @description PAMS 系统智能分析报告管理与查看页面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Card, Input, Button, Descriptions, message, Typography, Select, Space, Spin, Modal, Grid, Flex } from 'antd';
import { fetchClient } from '@/lib/api-client';

const { TextArea } = Input;
const { Title, Text } = Typography;

const { useBreakpoint } = Grid;

export default function AnalystPage() {
    const screens = useBreakpoint();
    // ---- Single Issue Analysis State ----
    const [issueIdInput, setIssueIdInput] = useState('');
    const [issue, setIssue] = useState<any>(null);
    const [searching, setSearching] = useState(false);
    const [reportText, setReportText] = useState('');
    const [generating, setGenerating] = useState(false);

    // ---- Production Issue Report State ----
    const [prodIssueIdInput, setProdIssueIdInput] = useState('');
    const [prodIssue, setProdIssue] = useState<any>(null);
    const [searchingProd, setSearchingProd] = useState(false);
    const [prodReportText, setProdReportText] = useState('');
    const [generatingProd, setGeneratingProd] = useState(false);

    // ---- Batch Summary Analysis State ----
    const [bgOptions, setBgOptions] = useState<{ label: string, value: string }[]>([]);
    const [roundOptions, setRoundOptions] = useState<{ label: string, value: string }[]>([]);
    const [selectedBgs, setSelectedBgs] = useState<string[]>([]);
    const [selectedRounds, setSelectedRounds] = useState<string[]>([]);
    const [summaryText, setSummaryText] = useState('');
    const [generatingSummary, setGeneratingSummary] = useState(false);
    const [summaryCount, setSummaryCount] = useState<number | null>(null);

    // ---- Prompt Editor State ----
    const [isPromptModalVisible, setIsPromptModalVisible] = useState(false);
    const [currentPromptType, setCurrentPromptType] = useState<'single' | 'summary' | 'production' | null>(null);
    const [customSinglePrompt, setCustomSinglePrompt] = useState('');
    const [customSummaryPrompt, setCustomSummaryPrompt] = useState('');
    const [customProdPrompt, setCustomProdPrompt] = useState('');
    const [editingPromptText, setEditingPromptText] = useState('');

    useEffect(() => {
        // Fetch dictionaries and default prompts on mount
        const fetchData = async () => {
            try {
                const [dictRes, promptRes] = await Promise.all([
                    fetchClient('/PAMS/api/dicts'),
                    fetchClient('/PAMS/api/analyst/prompts')
                ]);

                const dictJson = await dictRes.json();
                if (dictJson.success) {
                    const bgs = dictJson.data.filter((d: any) => d.dict_code === 'business_group').map((d: any) => ({ label: d.item_value, value: d.item_key }));
                    const rounds = dictJson.data.filter((d: any) => d.dict_code === 'issue_round').map((d: any) => ({ label: d.item_value, value: d.item_key }));
                    setBgOptions(bgs);
                    setRoundOptions(rounds);
                }

                const promptJson = await promptRes.json();
                if (promptJson.success) {
                    setCustomSinglePrompt(promptJson.data.single);
                    setCustomSummaryPrompt(promptJson.data.summary);
                    setCustomProdPrompt(promptJson.data.production);
                }
            } catch (e) {
                console.error('Failed to fetch initial data', e);
            }
        };
        fetchData();
    }, []);

    const handleSearch = async () => {
        if (!issueIdInput.trim()) {
            message.warning('请输入问题编号');
            return;
        }

        setSearching(true);
        setIssue(null);
        setReportText('');
        try {
            const res = await fetchClient(`/PAMS/api/issues/${issueIdInput.trim()}`);
            const json = await res.json();
            if (json.success) {
                setIssue(json.data);
            } else {
                message.error(json.error || '未找到该问题');
            }
        } catch (e) {
            message.error('查询异常');
        } finally {
            setSearching(false);
        }
    };

    const handleGenerate = async () => {
        if (!issue) return;

        setGenerating(true);
        setReportText(''); // Clear previous report
        try {
            const res = await fetchClient(`/PAMS/api/analyst/generate`, {
                method: 'POST',
                body: JSON.stringify({ 
                    issue_id: issue.issue_id,
                    custom_prompt: customSinglePrompt || undefined
                })
            });
            const json = await res.json();
            if (json.success && json.data) {
                setReportText(json.data.report);
                message.success('分析报告生成成功');
            } else {
                message.error(json.error || '生成失败');
            }
        } catch (e) {
            message.error('生成请求失败');
        } finally {
            setGenerating(false);
        }
    };

    const handleSearchProd = async () => {
        if (!prodIssueIdInput.trim()) {
            message.warning('请输入问题编号');
            return;
        }

        setSearchingProd(true);
        setProdIssue(null);
        setProdReportText('');
        try {
            const res = await fetchClient(`/PAMS/api/issues/${prodIssueIdInput.trim()}`);
            const json = await res.json();
            if (json.success) {
                setProdIssue(json.data);
            } else {
                message.error(json.error || '未找到该问题');
            }
        } catch (e) {
            message.error('查询异常');
        } finally {
            setSearchingProd(false);
        }
    };

    const handleGenerateProd = async () => {
        if (!prodIssue) return;

        setGeneratingProd(true);
        setProdReportText(''); 
        try {
            const res = await fetchClient(`/PAMS/api/analyst/generate`, {
                method: 'POST',
                body: JSON.stringify({ 
                    issue_id: prodIssue.issue_id,
                    custom_prompt: customProdPrompt || undefined
                })
            });
            const json = await res.json();
            if (json.success && json.data) {
                setProdReportText(json.data.report);
                message.success('投产问题报告生成成功');
            } else {
                message.error(json.error || '生成失败');
            }
        } catch (e) {
            message.error('生成请求失败');
        } finally {
            setGeneratingProd(false);
        }
    };

    const handleGenerateSummary = async () => {
        setGeneratingSummary(true);
        setSummaryText('');
        setSummaryCount(null);
        try {
            const res = await fetchClient(`/PAMS/api/analyst/summary`, {
                method: 'POST',
                body: JSON.stringify({ 
                    business_groups: selectedBgs,
                    rounds: selectedRounds,
                    custom_prompt: customSummaryPrompt || undefined
                })
            });
            const json = await res.json();
            if (json.success && json.data) {
                setSummaryText(json.data.report);
                setSummaryCount(json.data.count);
                message.success('总结报告生成成功');
            } else {
                message.error(json.error || '总结报告生成失败');
            }
        } catch (e) {
            message.error('总结报告生成请求失败');
        } finally {
            setGeneratingSummary(false);
        }
    };

    const handleDownload = (text: string, filename: string) => {
        if (!text) return;
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const openPromptModal = (type: 'single' | 'summary' | 'production') => {
        setCurrentPromptType(type);
        if (type === 'single') setEditingPromptText(customSinglePrompt);
        else if (type === 'summary') setEditingPromptText(customSummaryPrompt);
        else setEditingPromptText(customProdPrompt);
        setIsPromptModalVisible(true);
    };

    const handleSavePrompt = () => {
        if (currentPromptType === 'single') {
            setCustomSinglePrompt(editingPromptText);
        } else if (currentPromptType === 'summary') {
            setCustomSummaryPrompt(editingPromptText);
        } else {
            setCustomProdPrompt(editingPromptText);
        }
        setIsPromptModalVisible(false);
        message.success('提示词已临时保存，将在本次生成中生效');
    };

    return (
        <div style={{ padding: screens.xs ? 0 : 24, maxWidth: 1000, margin: '0 auto' }}>


            {/* Single Issue Analysis Section */}
            <Card title="单问题深入分析" bordered={false} style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 24 }}>
                    <Space direction={screens.xs ? 'vertical' : 'horizontal'} style={{ width: '100%' }} size={screens.xs ? 12 : 'middle'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: screens.xs ? '100%' : 'auto' }}>
                            <Input
                                placeholder="请输入问题编号"
                                value={issueIdInput}
                                onChange={(e) => setIssueIdInput(e.target.value)}
                                onPressEnter={handleSearch}
                                style={{ flex: 1, minWidth: screens.xs ? 0 : 300 }}
                            />
                            <Button type="primary" onClick={handleSearch} loading={searching}>
                                查询
                            </Button>
                        </div>
                        {!screens.xs && <div style={{ width: 1, height: 24, background: '#e8e8e8' }}></div>}
                        <Flex gap={8} wrap="wrap" vertical={screens.xs} style={{ width: screens.xs ? '100%' : 'auto' }}>
                            <Button 
                                type="primary" 
                                onClick={handleGenerate} 
                                loading={generating}
                                disabled={!issue || searching}
                                block={screens.xs}
                            >
                                {generating ? (screens.xs ? '生成中...' : '正在调用大模型生成...') : '生成问题分析报告'}
                            </Button>
                            <Button 
                                onClick={() => openPromptModal('single')}
                                disabled={generating}
                                block={screens.xs}
                            >
                                编辑提示词
                            </Button>
                            {reportText && !generating && (
                                <Button 
                                    onClick={() => handleDownload(reportText, `分析报告_${issue?.issue_id || '未知'}.txt`)}
                                    block={screens.xs}
                                >
                                    下载
                                </Button>
                            )}
                        </Flex>
                    </Space>
                </div>

                {issue && (
                    <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
                        <Descriptions.Item label="问题编号">
                            <span 
                                className="issue-id-header-fixed"
                                style={issue.issue_id && issue.issue_id.length > 14 ? { fontSize: issue.issue_id.length > 17 ? '0.8rem' : '0.9rem' } : {}}
                            >
                                {issue.issue_id}
                            </span>
                        </Descriptions.Item>
                        <Descriptions.Item label="状态">{issue.status || '-'}</Descriptions.Item>
                        <Descriptions.Item label="问题分类">{issue.category || '-'}</Descriptions.Item>
                        <Descriptions.Item label="详细分类">{issue.detailed_classification || '-'}</Descriptions.Item>
                        <Descriptions.Item label="问题概述" span={2}>{issue.summary || '-'}</Descriptions.Item>
                    </Descriptions>
                )}

                {(reportText || generating) && (
                    <div>
                        <TextArea
                            value={reportText}
                            onChange={(e) => setReportText(e.target.value)}
                            placeholder={generating ? "生成中，请稍候..." : "生成的分析报告将显示在此处，也可手动编辑。"}
                            autoSize={{ minRows: 15, maxRows: 30 }}
                            disabled={generating}
                        />
                    </div>
                )}
            </Card>
            
            {/* Production Issue Report Section */}
            <Card title="生成投产问题报告" bordered={false} style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 24 }}>
                    <Space direction={screens.xs ? 'vertical' : 'horizontal'} style={{ width: '100%' }} size={screens.xs ? 12 : 'middle'}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: screens.xs ? '100%' : 'auto' }}>
                            <Input
                                placeholder="请输入问题编号"
                                value={prodIssueIdInput}
                                onChange={(e) => setProdIssueIdInput(e.target.value)}
                                onPressEnter={handleSearchProd}
                                style={{ flex: 1, minWidth: screens.xs ? 0 : 300 }}
                            />
                            <Button type="primary" onClick={handleSearchProd} loading={searchingProd}>
                                查询
                            </Button>
                        </div>
                        {!screens.xs && <div style={{ width: 1, height: 24, background: '#e8e8e8' }}></div>}
                        <Flex gap={8} wrap="wrap" vertical={screens.xs} style={{ width: screens.xs ? '100%' : 'auto' }}>
                            <Button 
                                type="primary" 
                                onClick={handleGenerateProd} 
                                loading={generatingProd}
                                disabled={!prodIssue || searchingProd}
                                block={screens.xs}
                            >
                                {generatingProd ? (screens.xs ? '生成中...' : '正在调用大模型生成...') : '生成投产问题报告'}
                            </Button>
                            <Button 
                                onClick={() => openPromptModal('production')}
                                disabled={generatingProd}
                                block={screens.xs}
                            >
                                编辑提示词
                            </Button>
                            {prodReportText && !generatingProd && (
                                <Button 
                                    onClick={() => handleDownload(prodReportText, `投产问题报告_${prodIssue?.issue_id || '未知'}.txt`)}
                                    block={screens.xs}
                                >
                                    下载
                                </Button>
                            )}
                        </Flex>
                    </Space>
                </div>

                {prodIssue && (
                    <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
                        <Descriptions.Item label="问题编号">
                            <span 
                                className="issue-id-header-fixed"
                                style={prodIssue.issue_id && prodIssue.issue_id.length > 14 ? { fontSize: prodIssue.issue_id.length > 17 ? '0.8rem' : '0.9rem' } : {}}
                            >
                                {prodIssue.issue_id}
                            </span>
                        </Descriptions.Item>
                        <Descriptions.Item label="状态">{prodIssue.status || '-'}</Descriptions.Item>
                        <Descriptions.Item label="问题分类">{prodIssue.category || '-'}</Descriptions.Item>
                        <Descriptions.Item label="详细分类">{prodIssue.detailed_classification || '-'}</Descriptions.Item>
                        <Descriptions.Item label="问题概述" span={2}>{prodIssue.summary || '-'}</Descriptions.Item>
                    </Descriptions>
                )}

                {(prodReportText || generatingProd) && (
                    <div>
                        <TextArea
                            value={prodReportText}
                            onChange={(e) => setProdReportText(e.target.value)}
                            placeholder={generatingProd ? "生成中，请稍候..." : "生成的投产问题报告将显示在此处，也可手动编辑。"}
                            autoSize={{ minRows: 15, maxRows: 30 }}
                            disabled={generatingProd}
                        />
                    </div>
                )}
            </Card>

            {/* Batch Summary Report Section */}
            <Card title="批量总结报告" bordered={false}>
                <div style={{ marginBottom: 24 }}>
                    <Flex vertical={screens.xs} gap={screens.xs ? 12 : 16} align={screens.xs ? 'stretch' : 'center'} style={{ flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: screens.xs ? '1: 1 100%' : 'none' }}>
                            <span style={{ whiteSpace: 'nowrap' }}>实施机构:</span>
                            <Select
                                mode="multiple"
                                allowClear
                                style={{ flex: 1, minWidth: screens.xs ? 0 : 250 }}
                                placeholder="选择实施机构"
                                options={bgOptions}
                                value={selectedBgs}
                                onChange={setSelectedBgs}
                                maxTagCount="responsive"
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: screens.xs ? '1: 1 100%' : 'none' }}>
                            <span style={{ whiteSpace: 'nowrap' }}>轮次:</span>
                            <Select
                                mode="multiple"
                                allowClear
                                style={{ flex: 1, minWidth: screens.xs ? 0 : 250 }}
                                placeholder="选择问题轮次"
                                options={roundOptions}
                                value={selectedRounds}
                                onChange={setSelectedRounds}
                                maxTagCount="responsive"
                            />
                        </div>
                        <Flex gap={8} wrap="wrap" vertical={screens.xs} style={{ width: screens.xs ? '100%' : 'auto', marginTop: screens.xs ? 8 : 0 }}>
                            <Button type="primary" onClick={handleGenerateSummary} loading={generatingSummary} block={screens.xs}>
                                {generatingSummary ? '正在总结...' : '生成总结报告'}
                            </Button>
                            <Button onClick={() => openPromptModal('summary')} disabled={generatingSummary} block={screens.xs}>
                                编辑提示词
                            </Button>
                            {summaryText && !generatingSummary && (
                                <Button onClick={() => handleDownload(summaryText, `总结报告.txt`)} block={screens.xs}>
                                    下载
                                </Button>
                            )}
                        </Flex>
                    </Flex>
                </div>

                {summaryCount !== null && !generatingSummary && (
                     <div style={{ marginBottom: 16 }}>
                         <Text type="secondary">报告已生成，共包含 {summaryCount} 条符合条件的问题数据。</Text>
                     </div>
                )}

                {(summaryText || generatingSummary) && (
                    <div style={{ position: 'relative' }}>
                        {generatingSummary && (
                            <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, textAlign: 'center' }}>
                                <Spin size="large" />
                                <div style={{ marginTop: 16, color: '#1677ff', fontWeight: 500 }}>正在深度分析并生成总结，请耐心等待（可能需要几十秒）...</div>
                            </div>
                        )}
                        <TextArea
                            value={summaryText}
                            onChange={(e) => setSummaryText(e.target.value)}
                            placeholder={generatingSummary ? "" : "生成的总结报告将显示在此处。"}
                            autoSize={{ minRows: 20, maxRows: 40 }}
                            disabled={generatingSummary}
                            style={generatingSummary ? { opacity: 0.5 } : {}}
                        />
                    </div>
                )}
            </Card>

            <Modal
                title={
                    currentPromptType === 'single' ? "编辑单问题分析提示词" : 
                    currentPromptType === 'summary' ? "编辑批量总结提示词" : "编辑投产问题报告提示词"
                }
                open={isPromptModalVisible}
                onOk={handleSavePrompt}
                onCancel={() => setIsPromptModalVisible(false)}
                width={800}
                okText="临时保存并关闭"
                cancelText="取消"
            >
                <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">
                        在此处修改发送给大模型的系统提示词模板。修改后的提示词仅在当前页面本次生成中生效，刷新页面后将恢复系统默认配置。
                    </Text>
                </div>
                <TextArea
                    value={editingPromptText}
                    onChange={(e) => setEditingPromptText(e.target.value)}
                    autoSize={{ minRows: 15, maxRows: 25 }}
                />
            </Modal>
        </div>
    );
}

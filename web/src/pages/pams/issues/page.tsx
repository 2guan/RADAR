/**
 * @file page.tsx
 * @description PAMS 核心问题全量管理与批处理任务列表页面
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useEffect, useState } from 'react';
import { App, Table, Button, Space, Tag, Input, Select, message, Drawer, Typography, Divider, Upload, Modal, List, Card, Grid, Tooltip, DatePicker } from 'antd';
import { SearchOutlined, ExportOutlined, ReloadOutlined, PlusOutlined, ShareAltOutlined, DeleteOutlined, UploadOutlined, DownloadOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import EditOutlined from '@ant-design/icons/EditOutlined';
import { IssueDetailView } from '@/components/IssueDetailView';
import type { ColumnsType } from 'antd/es/table';
import type { Issue, DictItem } from '@/types';
import { toBeijingTime } from '@/lib/timezone';
import dayjs from 'dayjs';
import { useAuth } from '@/components/AuthProvider';
import { hasFeaturePermission } from '@/lib/permissions-client';
import styles from '../issue-table.module.css';
import { pamsFetch } from '@/lib/api-client';

const { Text } = Typography;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const fetch = pamsFetch;

/**
 * 状态标识与 Ant Design 预设颜色的对照映射字典
 */
const statusColors: Record<string, string> = {
    '提出': 'blue',
    '处理中': 'orange',
    '已查明原因': 'purple',
    '待验证': 'cyan',
    '重现': 'red',
    '已解决': 'green',
};

/**
 * PAMS 全量问题列表与高级批处理管理页面组件
 * @description 支持极其复杂的组合多条件模糊检索、分页拉取、表格排序。
 * 针对大批量业务场景，支持“Excel 模版下载与增量批量导入”、“问题单多字段文本批量对齐调整”、“批量摆渡发版情况更新”、“全量/条件 Excel 导出”等企业级功能。
 * 具备自适应响应式能力：在手机或平板窄屏端自动折叠为大卡片瀑布流布局，在 PC 桌面宽屏端呈现高性能固定列数据网格表格。
 */
export default function IssuesPage() {
    const { message, modal } = App.useApp();
    /** 租户或用户的会话凭证及前端 RBAC 权限大对象 */
    const { user, permissions } = useAuth();
    /** AntD 响应式断点检测 Hook (xs, sm, md, lg 等) */
    const screens = useBreakpoint();

    // 页面基本状态
    /** 当前页码渲染的缺陷数组 */
    const [issues, setIssues] = useState<Issue[]>([]);
    /** 列表加载时的骨架屏/Loading 遮罩开关 */
    const [loading, setLoading] = useState(true);
    /** 满足当前筛选条件的总条数，用于分页器 pagination */
    const [total, setTotal] = useState(0);
    /** 当前所在的页码，从 1 开始 */
    const [page, setPage] = useState(1);
    /** 每页展示的条数 */
    const [pageSize, setPageSize] = useState(20);
    /** 高级组合筛选的条件字典对象 KV 映射 */
    const [filters, setFilters] = useState<Record<string, string>>({});
    /** 更多筛选条件折叠栏的开闭状态 */
    const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
    /** 问题单详情 Drawer 抽屉的开启状态 */
    const [drawerVisible, setDrawerVisible] = useState(false);
    /** 当前处于选中或查看详情状态下的问题单实体数据 */
    const [currentIssue, setCurrentIssue] = useState<Issue | null>(null);

    // 辅助与分析状态
    /** 分析内容文本暂存 */
    const [analysisContent, setAnalysisContent] = useState('');
    /** 正在提交分析日志的异步 loading */
    const [submittingAnalysis, setSubmittingAnalysis] = useState(false);
    /** 正在保存修改缺陷字段的异步 loading */
    const [savingIssue, setSavingIssue] = useState(false);
    /** 筛选轮次是否已从字典接口完成初始化的标记，用于解决生命周期竞态问题 */
    const [roundInitialized, setRoundInitialized] = useState(false);

    // 导入模态框状态
    /** 批量 Excel 导入弹窗可见性 */
    const [importModalVisible, setImportModalVisible] = useState(false);
    /** 正在进行文件上传与解析导入的 loading 状态 */
    const [importing, setImporting] = useState(false);
    /** 导入执行完后，后端返回的校验与错误摘要报告 */
    const [importResult, setImportResult] = useState<{
        total: number;
        successCount: number;
        errorCount: number;
        errors: { row: number; message: string }[];
    } | null>(null);

    // 批量文本调整状态
    /** 批量调整多行文本 Modal 可见性 */
    const [batchAdjustModalVisible, setBatchAdjustModalVisible] = useState(false);
    /** 用户填写的批量调整多行规范文本（每行：ID + 间隔 + 目标值） */
    const [batchAdjustText, setBatchAdjustText] = useState('');
    /** 当前选择调整的问题单物理字段名（如 'round', 'status', 'handler_name' 等） */
    const [batchAdjustField, setBatchAdjustField] = useState('round');
    /** 正在提交批量调整请求的 loading 状态 */
    const [updatingBatchAdjust, setUpdatingBatchAdjust] = useState(false);

    // 批量更新发版情况状态
    /** 批量更新发版情况弹框的可见性 */
    const [batchUpdateModalVisible, setBatchUpdateModalVisible] = useState(false);
    /** 用户填写的批量更新发版多行字符串（每行：ID + 间隔 + 版本编号 + 间隔 + 发版情况） */
    const [batchUpdateText, setBatchUpdateText] = useState('');
    /** 正在提交批量更新发版情况的 loading 状态 */
    const [updatingBatch, setUpdatingBatch] = useState(false);

    // 用户下拉联想搜索缓存
    /** 干系人（跟踪人、报障人、处理人）模糊搜索后缓存的匹配项列表 */
    const [userOptions, setUserOptions] = useState<{ label: string, value: string, org: string, contact: string }[]>([]);
    const [trackerOptions, setTrackerOptions] = useState<{ label: string, value: string }[]>([]);
    const [reporterOptions, setReporterOptions] = useState<{ label: string, value: string }[]>([]);
    const [handlerOptions, setHandlerOptions] = useState<{ label: string, value: string }[]>([]);

    // 字典选项状态缓存
    /** 系统加载出的全部数据字典集合 */
    const [dicts, setDicts] = useState<Record<string, DictItem[]>>({
        issue_status: [],
        issue_category: [],
        issue_detailed_classification: [],
        issue_round: [],
        module: [],
        system: [],
        business_group: [],
        organization: [],
        issue_urgency: [],
        issue_handling_method: [],
    });
    /** 数据库里现存的去重后的发版状态描述词集合，用于筛选项联想 */
    const [releaseStatusOptions, setReleaseStatusOptions] = useState<string[]>([]);

    // 监听分页与筛选变化，重新拉取列表
    useEffect(() => {
        if (roundInitialized) {
            fetchIssues();
        }
    }, [page, pageSize, filters, roundInitialized]);

    // 只要筛选条件一发生任何变动，自动将分页归零重置到第 1 页
    useEffect(() => {
        setPage(1);
    }, [filters]);

    // 页面加载时的字典初始化生命周期
    useEffect(() => {
        // 第一步 (快速通道)：优先获取筛选轮次字典，以快速解锁缺陷列表渲染阻塞，提升首屏 FCP
        fetch('/PAMS/api/dicts?dict_code=issue_round')
            .then(res => res.json())
            .then(res => {
                if (res.success) {
                    setDicts(prev => ({ ...prev, issue_round: res.data }));
                }
            })
            .catch(e => console.error('Fast round fetch failed', e));

        // 第二步 (后台静默)：异步拉取系统全量数据字典与已存发版状态选项
        fetchDicts();
        fetchReleaseStatusOptions();
    }, []);

    /**
     * 异步拉取系统中已录入的所有历史发版状态选项列表
     * @description 用于在高级筛选的“发版情况”中提供去重后的动态下拉选项。
     */
    const fetchReleaseStatusOptions = async () => {
        try {
            const res = await fetch('/PAMS/api/issues/release-status-list');
            const data = await res.json();
            if (data.success) {
                setReleaseStatusOptions(data.data);
            }
        } catch (e) {
            console.error('Failed to fetch release status options', e);
        }
    };

    // 监听字典加载，自动初始化默认筛选轮次
    useEffect(() => {
        if (!roundInitialized && dicts.issue_round.length > 0) {
            const defaultItem = dicts.issue_round.find(d => d.is_default_val === 1);
            if (defaultItem) {
                // 如果字典中有设置默认轮次值，则将其设为初始筛选条件
                setFilters(prev => ({ ...prev, round: defaultItem.item_key }));
            }
            setRoundInitialized(true);
        }
    }, [dicts.issue_round, roundInitialized]);

    /**
     * 批量异步获取系统全局数据字典大对象
     * @description 合并请求以优化首屏加载性能。获取后在前端根据 dict_code 字典大类编码进行本地分组归类，并灌入各个下拉菜单状态中。
     */
    const fetchDicts = async () => {
        try {
            const res = await fetch('/PAMS/api/dicts');
            const data = await res.json();

            if (data.success && Array.isArray(data.data)) {
                const newDicts: Record<string, DictItem[]> = {
                    issue_status: [],
                    issue_category: [],
                    issue_detailed_classification: [],
                    issue_round: [],
                    issue_tag: [],
                    module: [],
                    system: [],
                    business_group: [],
                    organization: [],
                    issue_urgency: [],
                    issue_handling_method: []
                };

                // 在本地进行一次性遍历并归类
                data.data.forEach((item: DictItem & { dict_code: string }) => {
                    if (newDicts[item.dict_code]) {
                        newDicts[item.dict_code].push(item);
                    }
                });

                setDicts(newDicts);
            }
        } catch (error) {
            console.error('Failed to fetch dicts', error);
        }
    };

    /**
     * 分页模糊检索缺陷问题单列表的核心方法
     * @description 将前端当前的 filters 字典进行浅拷贝清洗（剔除空值），附带分页参数，且默认传递 `enforce_category_permission: true` 以确保接口基于当前登录人的角色权限（例如报障人只能看到所属分类等）进行底层 SQL 物理行隔离筛选。
     */
    const fetchIssues = async () => {
        setLoading(true);
        try {
            // 清理无用的空字符串或 undefined 筛选属性
            const cleanFilters = Object.fromEntries(
                Object.entries(filters).filter(([_, v]) => v != null && v !== '')
            );
            const params = new URLSearchParams({
                page: String(page),
                pageSize: String(pageSize),
                enforce_category_permission: 'true', // 强校验分类查看权限
                ...cleanFilters,
            });
            const res = await fetch(`/PAMS/api/issues?${params}`);
            const data = await res.json();
            if (data.success) {
                setIssues(data.data.items);
                setTotal(data.data.total);
            }
        } catch (error) {
            message.error('获取问题列表失败');
        } finally {
            setLoading(false);
        }
    };

    /**
     * 导出符合当前筛选条件的 Excel 缺陷列表文件
     * @description 将当前筛选条件作为参数发送到后端 `/PAMS/api/issues/export`，后端动态生成 Office Open XML 电子表格。
     * 接收到二进制 Blob 流后，使用 URL.createObjectURL 动态生成下载链接，模拟点击事件以触发浏览器的标准文件保存下载动作。
     */
    const handleExport = async () => {
        try {
            const cleanFilters = Object.fromEntries(
                Object.entries(filters).filter(([_, v]) => v != null && v !== '')
            );
            const params = new URLSearchParams({
                ...cleanFilters,
                enforce_category_permission: 'true',
            } as any);
            const res = await fetch(`/PAMS/api/issues/export?${params}`);
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `issues_${dayjs().format('YYYY-MM-DD')}.xlsx`;
            a.click();
            window.URL.revokeObjectURL(url);
            message.success('导出成功');
        } catch {
            message.error('导出失败');
        }
    };

    /**
     * 下载批量导入专用的规范化 Excel 格式模版文件
     */
    const handleDownloadTemplate = () => {
        fetch('/PAMS/api/issues/template')
            .then(res => res.blob())
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'issues_template.xlsx';
                a.click();
                window.URL.revokeObjectURL(url);
            })
            .catch(() => message.error('下载模版失败'));
    };

    /**
     * 将选中的 Excel 模版文件进行二进制 FormData 异步流上传解析并入库
     * @description 阻断 Ant Design Upload 默认的 Action 动作，将其拦截在前端，通过 fetch 强制提交到后端导入接口。
     * 导入完成后，在界面展示具体的“导入成功笔数”、“失败笔数”以及针对每一行具体字段格式校验失败的错误轨迹明细报告。
     * @param {File} file 待解析导入的 Excel 表单文件对象
     */
    const handleImportUpload = async (file: File) => {
        setImporting(true);
        setImportResult(null);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch('/PAMS/api/issues/import', {
                method: 'POST',
                body: formData,
            });
            const data = await res.json();
            setImportResult(data);
            if (data.successCount > 0) {
                message.success(`成功导入 ${data.successCount} 条问题`);
                fetchIssues();
            }
            if (data.errorCount > 0) {
                message.warning(`${data.errorCount} 条数据导入失败`);
            }
        } catch (error) {
            message.error('导入失败');
        } finally {
            setImporting(false);
        }
        return false; // 阻止 Upload 组件的默认 POST 提交
    };

    /**
     * 核心业务：批量快速对齐修改问题单字段属性
     * @description 精准地将大文本框内包含的“缺陷ID”与“目标属性”按照多行文本提取并对齐。
     * 支持使用正则模糊切分空白字符或制表符，在去重合并后发送到 `/PAMS/api/issues/batch-adjust` 接口，支持批量调整包括轮次、状态、跟踪人在内的十几种高频字段，并实现一键刷新。
     */
    const handleBatchAdjust = async () => {
        if (!batchAdjustText.trim()) {
            message.warning('请输入更新内容');
            return;
        }

        const lines = batchAdjustText.split('\n').filter(line => line.trim());
        const updates: { issue_id: string, value: string }[] = [];
        const seen = new Set<string>();

        lines.forEach(line => {
            // 支持多个空格或制表符切分
            const parts = line.split(/[ \t]+/).filter(p => p.trim());
            if (parts.length >= 2) {
                const id = parts[0];
                const value = parts.slice(1).join(' '); // 后面所有部分拼接为值
                if (!seen.has(id)) {
                    updates.push({ issue_id: id, value });
                    seen.add(id);
                }
            }
        });

        if (updates.length === 0) {
            message.error('未找到有效的数据行，请检查格式');
            return;
        }

        setUpdatingBatchAdjust(true);
        try {
            const res = await fetch('/PAMS/api/issues/batch-adjust', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    field: batchAdjustField,
                    updates
                }),
            });
            const data = await res.json();
            if (data.success) {
                message.success(data.message);
                setBatchAdjustModalVisible(false);
                setBatchAdjustText('');
                fetchIssues();
            } else {
                message.error(data.error || '批量调整失败');
            }
        } catch (error) {
            message.error('请求失败，请稍后重试');
        } finally {
            setUpdatingBatchAdjust(false);
        }
    };

    /**
     * 核心业务：批量联动更新缺陷的版本编号与发版情况
     * @description 支持将多行按照“缺陷ID [空格] 版本号 [空格] 发版状态”格式输入的文本进行结构化拆分。
     * 特殊聚合规则：若在文本框中包含同一个缺陷单的多个不同发版版本，程序将自动以逗号 "," 对其进行累加合并拼接，避免数据覆盖丢失，提升运维发版记录效率。
     */
    const handleBatchUpdateRelease = async () => {
        if (!batchUpdateText.trim()) {
            message.warning('请输入更新内容');
            return;
        }

        const lines = batchUpdateText.split('\n').filter(line => line.trim());
        const batchMap = new Map<string, { issue_id: string, version_number: string, release_status: string }>();

        lines.forEach(line => {
            const parts = line.split(/[ \t]+/).filter(p => p.trim());
            if (parts.length >= 3) {
                const [id, version, status] = parts;
                if (!batchMap.has(id)) {
                    batchMap.set(id, { issue_id: id, version_number: version, release_status: status });
                } else {
                    const existing = batchMap.get(id)!;
                    // 同单多版本：以逗号拼接去重版本号
                    const versions = existing.version_number.split(',').map(v => v.trim());
                    if (!versions.includes(version)) {
                        existing.version_number += `, ${version}`;
                    }
                }
            }
        });

        const updates = Array.from(batchMap.values());
        if (updates.length === 0) {
            message.error('未找到有效的数据行，请检查格式');
            return;
        }

        setUpdatingBatch(true);
        try {
            const res = await fetch('/PAMS/api/issues/batch-update-release', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            const data = await res.json();
            if (data.success) {
                message.success(data.message);
                setBatchUpdateModalVisible(false);
                setBatchUpdateText('');
                fetchIssues();
            } else {
                message.error(data.error || '批量更新失败');
            }
        } catch (error) {
            message.error('请求失败，请稍后重试');
        } finally {
            setUpdatingBatch(false);
        }
    };

    /**
     * 单个问题单的彻底删除
     * @description 拉起二次确认模态窗，通过 DELETE 方法请求后端接口从 SQLite 中彻底抹除该问题单行及其级联数据（如操作历史、关联案例引用等）。限制仅 SUPER_ADMIN/ADMIN 角色执行。
     * @param {Issue} record 待删除的问题单实体行
     */
    const handleDeleteIssue = (record: Issue) => {
        modal.confirm({
            title: '确认删除',
            content: `确定要删除问题 ${record.issue_id} 吗？此操作不可恢复。`,
            okText: '确认删除',
            okType: 'danger',
            cancelText: '取消',
            onOk: async () => {
                try {
                    const res = await fetch(`/PAMS/api/issues/${record.issue_id}`, {
                        method: 'DELETE',
                    });
                    const data = await res.json();
                    if (data.success) {
                        message.success('问题删除成功');
                        fetchIssues();
                    } else {
                        message.error(data.error || '删除失败');
                    }
                } catch {
                    message.error('删除请求失败');
                }
            },
        });
    };

    /**
     * 用户表单新增或修改时，进行模糊联想查询系统成员
     * @param {string} value 查询姓名或账户字词
     */
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
        } catch (e) {
            console.error(e);
        }
    };

    /**
     * 高级筛选下拉框中模糊匹配干系人
     * @param {string} value 模糊姓名
     * @param {'tracker' | 'reporter' | 'handler'} type 角色类型
     */
    const handleSearchFilterUser = async (value: string, type: 'tracker' | 'reporter' | 'handler') => {
        if (!value) {
            if (type === 'tracker') setTrackerOptions([]);
            if (type === 'reporter') setReporterOptions([]);
            if (type === 'handler') setHandlerOptions([]);
            return;
        }
        try {
            const res = await fetch(`/PAMS/api/users?search=${encodeURIComponent(value)}&pageSize=10`);
            const data = await res.json();
            if (data.success) {
                const options = data.data.items.map((u: any) => ({
                    label: `${u.real_name} (${u.username})`,
                    value: u.real_name,
                    name: u.real_name,
                }));
                if (type === 'tracker') setTrackerOptions(options);
                if (type === 'reporter') setReporterOptions(options);
                if (type === 'handler') setHandlerOptions(options);
            }
        } catch (e) {
            console.error(e);
        }
    };

    /**
     * 数据网格表格行点击时的通用详情激活回调
     * @description 异步拉取最详尽的问题单全量信息（包含关联案例数组、附件列表、历史更改轨迹、分析日志轴等），写入当前选中状态，然后推起半屏抽屉 Drawer。
     * @param {Issue} record 点击的数据行缺陷实体
     */
    const handleRowClick = async (record: Issue) => {
        try {
            const res = await fetch(`/PAMS/api/issues/${record.issue_id}`);
            const data = await res.json();
            if (data.success) {
                const fullIssue = data.data;
                setCurrentIssue(fullIssue);
                setDrawerVisible(true);
                setAnalysisContent('');
            } else {
                message.error('获取问题详情失败');
            }
        } catch {
            message.error('获取问题详情失败');
        }
    };

    /**
     * 局部更新详情抽屉里的问题单属性后，静默刷新当前抽屉内容
     * @param {string} issueId 缺陷 ID
     */
    const handleIssueRefresh = async (issueId: string) => {
        try {
            const res = await fetch(`/PAMS/api/issues/${issueId}`);
            const data = await res.json();
            if (data.success) {
                setCurrentIssue(data.data);
            }
        } catch (error) {
            console.error('Failed to refresh issue:', error);
        }
    };

    /**
     * 编辑详情表单时，对问题单属性进行局部修改并提交保存
     */
    const handleUpdateIssue = async (values: any) => {
        if (!currentIssue) return;
        setSavingIssue(true);
        try {
            const payload = { ...values };
            const res = await fetch(`/PAMS/api/issues/${currentIssue.issue_id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (data.success) {
                message.success('问题更新成功');
                fetchIssues();

                const detailRes = await fetch(`/PAMS/api/issues/${currentIssue.issue_id}`);
                const detailData = await detailRes.json();
                if (detailData.success) {
                    setCurrentIssue(detailData.data);
                }
            } else {
                message.error(data.error || '更新失败');
            }
        } catch {
            message.error('更新失败');
        } finally {
            setSavingIssue(false);
        }
    };

    /**
     * 计算问题单自提出起所消耗的处理天数
     */
    const calculateDuration = (created: string, resolved: string | null) => {
        const start = dayjs(created);
        const end = resolved ? dayjs(resolved) : dayjs();
        const diffInDays = end.diff(start, 'day', true);
        return diffInDays.toFixed(0);
    };

    /**
     * 计算缺陷实际解决（或未解决当前时间）与计划解决时间的超期天数天数差
     */
    const calculateOverdue = (plan: string | null, resolved: string | null) => {
        if (!plan) return '-';
        const target = dayjs(plan);
        const now = resolved ? dayjs(resolved) : dayjs();

        const nowPlus1Day = dayjs().add(1, 'day');
        if (nowPlus1Day.valueOf() <= target.valueOf()) return '-';

        const nowMinus1Day = now.subtract(1, 'day');
        const diff = nowMinus1Day.diff(target, 'day', true);
        if (diff <= 0) return '-';
        return diff.toFixed(0);
    };

    /**
     * 向指定的问题缺陷追加一条修改分析/进展日志
     */
    const handleAddAnalysis = async (content: string, handlerInfo?: { name: string, org: string, contact: string }) => {
        if (!content.trim() || !currentIssue) return;

        setSubmittingAnalysis(true);
        try {
            const res = await fetch(`/PAMS/api/issues/${currentIssue.issue_id}/analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    handler_name: handlerInfo?.name,
                    handler_org: handlerInfo?.org,
                    handler_contact: handlerInfo?.contact
                }),
            });
            const data = await res.json();
            if (data.success) {
                message.success('分析日志已添加');

                const detailRes = await fetch(`/PAMS/api/issues/${currentIssue.issue_id}`);
                const detailData = await detailRes.json();
                if (detailData.success) {
                    setCurrentIssue(detailData.data);
                }
                fetchIssues(); // 静默重拉后台列表
            } else {
                message.error(data.error);
            }
        } catch {
            message.error('添加分析日志失败');
        } finally {
            setSubmittingAnalysis(false);
        }
    };

    /** 
     * PC 桌面端数据表格网格的表头字段渲染配置定义 
     */
    const columns: ColumnsType<Issue> = [
        {
            title: '问题编号',
            dataIndex: 'issue_id',
            key: 'issue_id',
            width: 120,
            align: 'center',
            render: (text: string, record: Issue) => {
                const isLong = text && text.length > 14;
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span
                            className={styles.issueIdText}
                            style={isLong ? { fontSize: text.length > 17 ? '9px' : '10px' } : {}}
                            title={text}
                        >
                            {text}
                        </span>
                        {record.work_order_no && (
                            <div
                                style={{
                                    fontSize: '9px',
                                    color: '#8c8c8c',
                                    marginTop: '1px',
                                    lineHeight: '1.4',
                                    maxWidth: '110px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    paddingBottom: '1px'
                                }}
                                title={record.work_order_no}
                            >
                                {record.work_order_no}
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 75,
            align: 'center',
            render: (status: string) => {
                let badgeClass = '';
                if (status === '处理中') badgeClass = styles.statusProcessing;
                else if (status === '已解决') badgeClass = styles.statusSolved;
                else if (status === '待验证') badgeClass = styles.statusVerify;
                else if (status === '重现') badgeClass = styles.statusReproduce;
                else if (status === '已查明原因') badgeClass = styles.statusFound;

                return (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <div className={`${styles.statusBadge} ${badgeClass}`}>
                            <span className={styles.statusBadgeDot}></span>
                            {status}
                        </div>
                    </div>
                );
            },
        },
        {
            title: '紧急程度',
            dataIndex: 'urgency',
            key: 'urgency',
            width: 70,
            align: 'center',
            render: (text: string) => {
                let color = 'default';
                if (text === '高') color = 'red';
                else if (text === '中') color = 'orange';
                else if (text === '低') color = 'green';
                return (
                    <Tag color={color} style={{ margin: 0 }}>
                        {text || '中'}
                    </Tag>
                );
            }
        },
        {
            title: '处理方式',
            dataIndex: 'handling_method',
            key: 'handling_method',
            width: 70,
            align: 'center',
            render: (text: string) => (
                <Tag color="processing" style={{ margin: 0 }}>
                    {text || '其它'}
                </Tag>
            )
        },
        {
            title: '问题分类',
            dataIndex: 'category',
            key: 'category',
            width: 80,
            align: 'center',
            render: (_: any, record: Issue) => {
                let tagClass = styles.tagDefault;
                const catName = record.category || '';
                if (catName.includes('金科技术') || catName === '金科') tagClass = styles.tagBlue;
                else if (catName.includes('农信技术')) tagClass = styles.tagOrange;
                else if (catName.includes('农信业务')) tagClass = styles.tagRed;

                return (
                    <span className={`${styles.categoryTag} ${tagClass}`}>
                        {record.category || '-'}
                    </span>
                );
            }
        },
        {
            title: '详细分类',
            dataIndex: 'detailed_classification',
            key: 'detailed_classification',
            width: 100,
            align: 'center',
            render: (text: string) => <span className={styles.valuePrimary} style={{ fontSize: 12 }}>{text || '-'}</span>
        },
        {
            title: <div style={{ textAlign: 'center' }}>问题概述</div>,
            dataIndex: 'summary',
            key: 'summary',
            width: 230,
            render: (text: string) => <div className="ellipsis-2" style={{ fontWeight: 500 }}>{text}</div>,
        },
        {
            title: <div style={{ textAlign: 'center' }}>所属系统</div>,
            dataIndex: 'system',
            key: 'system',
            width: 100,
            render: (_: any, record: Issue) => {
                const sysName = dicts.system.find(d => d.item_key === record.system)?.item_value || record.system || '-';
                const modName = dicts.module.find(d => d.item_key === record.module)?.item_value || record.module;
                const bgName = dicts.business_group.find(d => d.item_key === record.business_group)?.item_value || record.business_group;
                return (
                    <div>
                        <div className={styles.systemName} title={`${record.system}-${sysName}`} style={{ fontSize: 12 }}>{sysName}</div>
                        <div className={styles.valueSecondary} style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {bgName && <span className={styles.tagGray}>{bgName}</span>}
                            {modName && <span className={styles.tagGray}>{modName}</span>}
                        </div>
                    </div>
                );
            }
        },
        {
            title: <div style={{ textAlign: 'center' }}>人员信息(报障人 处理人 跟踪人)</div>,
            key: 'people',
            width: 210,
            render: (_: any, record: Issue) => {
                const renderPersonSlot = (name: string | null, org: string | null) => {
                    if (!name) return <div />;
                    const orgName = dicts.organization.find(d => d.item_key === org)?.item_value || org;
                    return (
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                            <span className={styles.personName} style={{ flexGrow: 0, flexShrink: 0, textAlign: 'left' }}>{name}</span>
                            {orgName && <span className={styles.orgTag} style={{ flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', transform: 'scale(0.85)', transformOrigin: 'left center', marginLeft: 0, minWidth: 0 }}>{orgName}</span>}
                        </div>
                    );
                };

                return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px' }}>
                        {renderPersonSlot(record.reporter_name, record.reporter_org)}
                        {renderPersonSlot(record.handler_name, record.handler_org)}
                        {renderPersonSlot(record.tracker_name, record.tracker_org)}
                    </div>
                );
            }
        },
        {
            title: '更新时间',
            key: 'last_update_time',
            width: 100,
            align: 'center',
            sorter: (a: Issue, b: Issue) => {
                const getLatestTime = (record: Issue) => {
                    const logs = record.analysis_log;
                    const latest = logs && logs.length > 0 ? logs[logs.length - 1] : null;
                    const time = (latest && latest.time) ? latest.time : record.create_time;
                    return time ? dayjs(time).valueOf() : 0;
                };
                return getLatestTime(a) - getLatestTime(b);
            },
            render: (_: any, record: Issue) => {
                const logs = record.analysis_log;
                const latest = logs && logs.length > 0 ? logs[logs.length - 1] : null;
                const timeToFormat = (latest && latest.time) ? latest.time : record.create_time;
                if (!timeToFormat) return '-';
                return (
                    <span style={{ fontSize: 11 }}>
                        {dayjs(timeToFormat).format('M-D HH:mm')}
                    </span>
                );
            }
        },
        {
            title: '处理/超期天数',
            key: 'duration',
            width: 100,
            render: (_: any, record: Issue) => {
                if (record.status === '已解决') return null;
                return (
                    <div style={{ fontSize: 11, textAlign: 'center' }}>
                        {calculateDuration(record.create_time, record.resolve_time)} / <span style={{ color: calculateOverdue(record.plan_fix_time, record.resolve_time) !== '-' ? '#ef4444' : 'inherit' }}>{calculateOverdue(record.plan_fix_time, record.resolve_time)}</span>
                    </div>
                );
            },
        },
        {
            title: '操作',
            key: 'action',
            width: 65,
            fixed: 'right',
            render: (_, record) => (
                <Space size={2}>
                    <Tooltip title="分享">
                        <Button
                            type="text"
                            size="small"
                            icon={<ShareAltOutlined />}
                            onClick={(e) => {
                                e.stopPropagation();
                                const url = window.location.origin + '/#/pams/issues/' + record.issue_id;
                                navigator.clipboard.writeText(url);
                                message.success('分享链接已复制');
                            }}
                        />
                    </Tooltip>
                    {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.username === 'admin') && (
                        <Tooltip title="删除">
                            <Button
                                type="text"
                                danger
                                size="small"
                                icon={<DeleteOutlined />}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteIssue(record);
                                }}
                            />
                        </Tooltip>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div>
            {/* 1. 高级筛选面板 */}
            <div style={{
                background: 'var(--radar-surface)',
                borderRadius: 0,
                border: '1px solid var(--radar-border)',
                marginBottom: 16,
                overflow: 'hidden',
                boxShadow: 'var(--radar-card-shadow)'
            }}>
                {/* 常驻基础模糊筛选行 */}
                <div style={{
                    padding: screens.xs ? '10px 12px' : '12px 16px',
                    background: 'var(--radar-primary-soft)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    borderBottom: moreFiltersOpen ? '1px solid var(--radar-border)' : 'none',
                }}>
                    <SearchOutlined style={{ color: 'var(--radar-primary)', fontSize: 15, flexShrink: 0 }} />
                    <Input
                        placeholder="问题/工单编号"
                        allowClear
                        style={{ width: screens.md ? 200 : 140, borderRadius: 0 }}
                        value={filters.issue_id_or_no}
                        onChange={(e) => setFilters(prev => {
                            const { ...rest } = prev;
                            return { ...rest, issue_id_or_no: e.target.value };
                        })}
                    />
                    <Input.Search
                        placeholder="搜索概述/描述/分析记录"
                        style={{ width: screens.md ? 200 : 140, borderRadius: 0 }}
                        onSearch={(value) => setFilters(prev => ({ ...prev, q: value }))}
                        allowClear
                    />

                    {/* 筛选折叠切换器按钮 */}
                    <Button
                        type="text"
                        size="small"
                        onClick={() => setMoreFiltersOpen(v => !v)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            color: moreFiltersOpen ? 'var(--radar-primary)' : 'var(--radar-text-secondary)',
                            fontWeight: 500,
                            fontSize: 13,
                            padding: '4px 10px',
                            borderRadius: 0,
                            background: moreFiltersOpen ? 'var(--radar-primary-soft)' : 'transparent',
                            border: `1px solid ${moreFiltersOpen ? 'var(--radar-primary-fade)' : 'transparent'}`,
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap',
                            marginLeft: 'auto',
                        }}
                    >
                        {(() => {
                            const extraCount = [
                                filters.round, filters.plan_fix_time, filters.status, filters.urgency,
                                filters.handling_method, filters.category, filters.detailed_classification,
                                filters.system, filters.business_group, filters.tracker_contact,
                                filters.reporter_contact, filters.handler_contact, filters.version_number,
                                filters.release_status
                            ].filter(Boolean).length;
                            return (
                                <>
                                    更多筛选{extraCount > 0 && <span style={{
                                        background: '#adb5bd', color: '#fff',
                                        borderRadius: 0, fontSize: 11,
                                        padding: '0 6px', lineHeight: '18px',
                                        marginLeft: 2
                                    }}>{extraCount}</span>}
                                    {moreFiltersOpen
                                        ? <UpOutlined style={{ fontSize: 10, marginLeft: 2 }} />
                                        : <DownOutlined style={{ fontSize: 10, marginLeft: 2 }} />}
                                </>
                            );
                        })()}
                    </Button>
                </div>

                {/* 展开折叠的细粒度组合筛选项字段行 */}
                <div style={{
                    maxHeight: moreFiltersOpen ? '400px' : '0',
                    overflow: 'hidden',
                    transition: 'max-height 0.3s ease',
                }}>
                    <div style={{
                        padding: screens.xs ? '10px 12px 14px' : '12px 16px 16px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        alignItems: 'center',
                    }}>
                        <Select
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="问题轮次"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            onChange={(value) => setFilters(prev => ({ ...prev, round: value }))}
                            value={filters.round}
                        >
                            {dicts.issue_round.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <DatePicker
                            multiple
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="计划解决时间"
                            allowClear
                            onChange={(dates) => {
                                const values = dates ? dates.map(d => d.format('YYYY-MM-DD')).join(',') : '';
                                setFilters(prev => ({ ...prev, plan_fix_time: values }));
                            }}
                        />
                        <Select
                            mode="multiple"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="状态"
                            allowClear
                            maxTagCount="responsive"
                            onChange={(values) => {
                                const newFilters = { ...filters };
                                if (values.length > 0) {
                                    newFilters.status = values.join(',');
                                } else {
                                    delete newFilters.status;
                                }
                                setFilters(newFilters);
                            }}
                            value={filters.status ? filters.status.split(',') : []}
                        >
                            {dicts.issue_status.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="紧急程度"
                            allowClear
                            onChange={(values) => setFilters(prev => ({ ...prev, urgency: values.join(',') }))}
                            value={filters.urgency ? filters.urgency.split(',') : []}
                        >
                            {dicts.issue_urgency?.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="处理方式"
                            allowClear
                            onChange={(values) => setFilters(prev => ({ ...prev, handling_method: values.join(',') }))}
                            value={filters.handling_method ? filters.handling_method.split(',') : []}
                        >
                            {dicts.issue_handling_method?.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="问题分类"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            onChange={(values) => setFilters(prev => ({ ...prev, category: values.join(',') }))}
                            value={filters.category ? filters.category.split(',') : []}
                        >
                            {dicts.issue_category.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="详细分类"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            onChange={(values) => setFilters(prev => ({ ...prev, detailed_classification: values.join(',') }))}
                            value={filters.detailed_classification ? filters.detailed_classification.split(',') : []}
                        >
                            {dicts.issue_detailed_classification?.filter(item => {
                                const allowed = permissions?.allowedDetailedCategories?.[user?.role || 'GUEST'];
                                if (allowed === null || allowed === undefined) return true;
                                return allowed.includes(item.item_key);
                            }).map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="所属系统"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            onChange={(values) => setFilters(prev => ({ ...prev, system: values.join(',') }))}
                            value={filters.system ? filters.system.split(',') : []}
                        >
                            {dicts.system.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{`${item.item_key}-${item.item_value}`}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="按实施机构"
                            allowClear
                            showSearch
                            optionFilterProp="children"
                            onChange={(values) => setFilters(prev => ({ ...prev, business_group: values.join(',') }))}
                            value={filters.business_group ? filters.business_group.split(',') : []}
                        >
                            {dicts.business_group.map(item => (
                                <Select.Option key={item.item_key} value={item.item_key}>{item.item_value}</Select.Option>
                            ))}
                        </Select>
                        <Select
                            showSearch
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="跟踪人"
                            allowClear
                            filterOption={false}
                            onSearch={(val) => handleSearchFilterUser(val, 'tracker')}
                            onChange={(value) => setFilters(prev => ({ ...prev, tracker_name: '', tracker_contact: value }))}
                            options={trackerOptions}
                            notFoundContent={null}
                        />
                        <Select
                            showSearch
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="报障人"
                            allowClear
                            filterOption={false}
                            onSearch={(val) => handleSearchFilterUser(val, 'reporter')}
                            onChange={(value) => setFilters(prev => ({ ...prev, reporter_name: '', reporter_contact: value }))}
                            options={reporterOptions}
                            notFoundContent={null}
                        />
                        <Select
                            showSearch
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="处理人"
                            allowClear
                            filterOption={false}
                            onSearch={(val) => handleSearchFilterUser(val, 'handler')}
                            onChange={(value) => setFilters(prev => ({ ...prev, handler_name: '', handler_contact: value }))}
                            options={handlerOptions}
                            notFoundContent={null}
                        />
                        <Select
                            mode="tags"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="版本编号"
                            allowClear
                            onChange={(values) => setFilters(prev => ({ ...prev, version_number: values.join(',') }))}
                            value={filters.version_number ? filters.version_number.split(',') : []}
                        >
                            <Select.Option value="未填写">未填写 (空值)</Select.Option>
                        </Select>
                        <Select
                            mode="multiple"
                            maxTagCount="responsive"
                            style={{ width: screens.md ? 150 : 140 }}
                            placeholder="发版情况"
                            allowClear
                            showSearch
                            onChange={(values) => setFilters(prev => ({ ...prev, release_status: values.join(',') }))}
                            value={filters.release_status ? filters.release_status.split(',') : []}
                        >
                            <Select.Option value="未填写">未填写 (空值)</Select.Option>
                            {releaseStatusOptions.map(opt => (
                                <Select.Option key={opt} value={opt}>{opt}</Select.Option>
                            ))}
                        </Select>
                    </div>
                </div>
            </div>

            {/* 2. 快捷动作功能栏 */}
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button icon={<ReloadOutlined />} onClick={fetchIssues}>
                    {screens.xs ? null : '刷新'}
                </Button>
                {hasFeaturePermission(user, 'issues:batch', permissions) && (
                    <Button icon={<UploadOutlined />} onClick={() => { setImportModalVisible(true); setImportResult(null); }}>
                        {screens.xs ? null : '批量导入'}
                    </Button>
                )}
                {hasFeaturePermission(user, 'issues:batch', permissions) && (
                    <Button icon={<EditOutlined />} onClick={() => setBatchAdjustModalVisible(true)}>
                        {screens.xs ? null : '批量调整'}
                    </Button>
                )}
                {hasFeaturePermission(user, 'issues:batch', permissions) && (
                    <Button icon={<PlusOutlined />} onClick={() => setBatchUpdateModalVisible(true)}>
                        {screens.xs ? null : '更新发版情况'}
                    </Button>
                )}
                {hasFeaturePermission(user, 'issues:export', permissions) && (
                    <Button icon={<ExportOutlined />} onClick={handleExport}>
                        {screens.xs ? null : '导出'}
                    </Button>
                )}
            </div>

            {/* 3. 响应式双态展示布局 */}
            {
                screens.xs || (screens.sm && !screens.md) ? (
                    /* 窄屏状态：展示精美的大瀑布流卡片列表 */
                    <List
                        grid={{ gutter: 16, column: 1 }}
                        dataSource={issues}
                        pagination={{
                            current: page,
                            pageSize,
                            total,
                            onChange: (p, ps) => { setPage(p); setPageSize(ps); }
                        }}
                        renderItem={item => {
                            const systemInfo = dicts.system.find(d => d.item_key === item.system);
                            const sysName = systemInfo?.item_value || item.system || '-';
                            const moduleDisplay = dicts.module.find(d => d.item_key === item.module)?.item_value;
                            const bgDisplay = dicts.business_group.find(d => d.item_key === item.business_group)?.item_value;

                            return (
                                <List.Item onClick={() => handleRowClick(item)} style={{ cursor: 'pointer', padding: '0' }}>
                                    <Card
                                        size="small"
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <span
                                                        className={styles.issueIdMain}
                                                        title={item.issue_id}
                                                        style={item.issue_id && item.issue_id.length > 14 ? { fontSize: item.issue_id.length > 17 ? '0.75rem' : '0.85rem' } : {}}
                                                    >
                                                        {item.issue_id}
                                                    </span>
                                                    {item.work_order_no && (
                                                        <div style={{ fontSize: '10px', color: '#8c8c8c', lineHeight: '1.4', paddingBottom: '1px' }}>
                                                            {item.work_order_no}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className={`${styles.statusBadge} ${item.status === '处理中' ? styles.statusProcessing :
                                                    item.status === '已解决' ? styles.statusSolved :
                                                        item.status === '待验证' ? styles.statusVerify :
                                                            item.status === '重现' ? styles.statusReproduce :
                                                                item.status === '已查明原因' ? styles.statusFound : ''
                                                    }`}>
                                                    <span className={styles.statusBadgeDot}></span>
                                                    {item.status}
                                                </div>
                                            </div>
                                        }
                                        extra={
                                            <Space size={4}>
                                                <Text type="secondary" style={{ fontSize: 12 }}>{toBeijingTime(item.create_time, 'MM-DD HH:mm')}</Text>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={<ShareAltOutlined />}
                                                    style={{ padding: '0 4px' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const url = window.location.origin + '/#/pams/issues/' + item.issue_id;
                                                        navigator.clipboard.writeText(url);
                                                        message.success('分享链接已复制');
                                                    }}
                                                />
                                                {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.username === 'admin') && (
                                                    <Button
                                                        type="text"
                                                        danger
                                                        size="small"
                                                        icon={<DeleteOutlined />}
                                                        style={{ padding: '0 4px' }}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteIssue(item);
                                                        }}
                                                    />
                                                )}
                                            </Space>
                                        }
                                    >
                                        <div style={{ marginBottom: 8 }}>
                                            <Text strong>{item.summary}</Text>
                                        </div>
                                        {item.details && (
                                            <div className={styles.issueDetailPreview} title={item.details.replace(/<[^>]+>/g, '')}>
                                                {item.details.replace(/<[^>]+>/g, '')}
                                            </div>
                                        )}
                                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '13px' }}>
                                            <span className={styles.systemName}>{sysName}</span>
                                            {bgDisplay && <span className={styles.tagGray}>{bgDisplay}</span>}
                                            {moduleDisplay && <span className={styles.tagGray}>{moduleDisplay}</span>}
                                        </div>
                                        <div className={styles.peopleGrid}>
                                            <div className={styles.personCard}>
                                                <span className={`${styles.personTag} ${styles.tagTracker}`}>跟踪人</span>
                                                <span className={styles.personName}>{item.tracker_name || '-'}</span>
                                            </div>

                                            <div className={styles.personCard}>
                                                <span className={`${styles.personTag} ${styles.tagReporter}`}>报障人</span>
                                                <span className={styles.personName}>{item.reporter_name || '-'}</span>
                                            </div>

                                            <div className={styles.personCard}>
                                                <span className={`${styles.personTag} ${styles.tagHandler}`}>处理人</span>
                                                <span className={styles.personName}>{item.handler_name || '-'}</span>
                                            </div>
                                        </div>
                                    </Card>
                                </List.Item>
                            );
                        }}
                    />
                ) : (
                    /* PC 宽屏状态：展示支持左右横向滚动固定的高性能 AntD Table 数据表格 */
                    <Table
                        columns={columns}
                        dataSource={issues}
                        rowKey="issue_id"
                        loading={loading}
                        size="small"
                        scroll={{ x: 1200 }}
                        pagination={{
                            current: page,
                            pageSize,
                            total,
                            showSizeChanger: true,
                            showTotal: (total) => `共 ${total} 条`,
                            onChange: (p, ps) => {
                                setPage(p);
                                setPageSize(ps);
                            },
                        }}
                        onRow={(record) => ({
                            onClick: () => handleRowClick(record),
                            style: { cursor: 'pointer' },
                        })}
                    />
                )
            }

            {/* 4. 问题编辑详情半屏滑出抽屉 */}
            <Drawer
                open={drawerVisible}
                onClose={() => setDrawerVisible(false)}
                title="问题详情"
                styles={{ body: { padding: 0 }, wrapper: { width: screens.xs ? '100%' : '800px', maxWidth: '100vw' } }}
            >
                {currentIssue && (
                    <IssueDetailView
                        issueId={currentIssue.issue_id}
                        dicts={dicts}
                        user={user}
                        onRefresh={fetchIssues}
                    />
                )}
            </Drawer>

            {/* 5. 批量导入弹窗 */}
            <Modal
                title="批量导入问题"
                open={importModalVisible}
                onCancel={() => setImportModalVisible(false)}
                footer={[
                    <Button key="cancel" onClick={() => setImportModalVisible(false)}>
                        关闭
                    </Button>,
                ]}
                width={600}
            >
                <div style={{ marginBottom: 16 }}>
                    <Text>请先下载模版，按格式填写后上传：</Text>
                    <Button
                        type="link"
                        icon={<DownloadOutlined />}
                        onClick={handleDownloadTemplate}
                        style={{ paddingLeft: 8 }}
                    >
                        下载导入模版
                    </Button>
                </div>

                <Upload.Dragger
                    accept=".xlsx,.xls"
                    showUploadList={false}
                    beforeUpload={(file) => { handleImportUpload(file); return false; }}
                    disabled={importing}
                >
                    <p className="ant-upload-drag-icon">
                        <UploadOutlined style={{ fontSize: 48, color: '#1677ff' }} />
                    </p>
                    <p className="ant-upload-text">
                        {importing ? '正在导入...' : '点击或拖拽 Excel 文件到此区域'}
                    </p>
                    <p className="ant-upload-hint">
                        支持 .xlsx 和 .xls 格式的文件进行批量增量入库
                    </p>
                </Upload.Dragger>

                {/* 导入详细反馈报告 */}
                {importResult && (
                    <div style={{ marginTop: 16 }}>
                        <Divider />
                        <Space orientation="vertical" style={{ width: '100%' }}>
                            <Text>
                                导入结果：共 {importResult.total} 条，
                                <Text type="success">成功 {importResult.successCount} 条</Text>，
                                <Text type="danger">失败 {importResult.errorCount} 条</Text>
                            </Text>
                            {importResult.errors.length > 0 && (
                                <div style={{ maxHeight: 200, overflow: 'auto', background: '#fafafa', padding: 12, borderRadius: 0 }}>
                                    {importResult.errors.map((err, idx) => (
                                        <div key={idx} style={{ color: '#ff4d4f', marginBottom: 4 }}>
                                            第 {err.row} 行：{err.message}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Space>
                    </div>
                )}
            </Modal>

            {/* 6. 批量字段文本快速对齐调整弹窗 */}
            <Modal
                title="批量调整问题"
                open={batchAdjustModalVisible}
                onCancel={() => setBatchAdjustModalVisible(false)}
                onOk={handleBatchAdjust}
                confirmLoading={updatingBatchAdjust}
                width={700}
                okText="开始调整"
                cancelText="取消"
            >
                <div style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 8 }}>选择调整栏位：</div>
                    <Select
                        style={{ width: '100%' }}
                        value={batchAdjustField}
                        onChange={setBatchAdjustField}
                        options={[
                            { label: '问题概述', value: 'summary' },
                            { label: '跟踪人', value: 'tracker_name' },
                            { label: '报障人', value: 'reporter_name' },
                            { label: '处理人', value: 'handler_name' },
                            { label: '问题分类', value: 'category' },
                            { label: '详细分类', value: 'detailed_classification' },
                            { label: '工单编号', value: 'work_order_no' },
                            { label: '轮次', value: 'round' },
                            { label: '问题状态', value: 'status' },
                            { label: '版本编号', value: 'version_number' },
                            { label: '发版情况', value: 'release_status' },
                            { label: '紧急程度', value: 'urgency' },
                            { label: '处理方式', value: 'handling_method' },
                        ]}
                    />
                </div>
                <div style={{ marginBottom: 12 }}>
                    <Text type="secondary">
                        请输入多行内容，每行格式为：<Text strong>问题编号 [空格或制表符] 栏位值</Text>
                        <br />
                        示例：<Text code>NX20260424002  已解决</Text>
                    </Text>
                </div>
                <TextArea
                    rows={12}
                    placeholder="粘贴多行数据到这里..."
                    value={batchAdjustText}
                    onChange={(e) => setBatchAdjustText(e.target.value)}
                    disabled={updatingBatchAdjust}
                />
            </Modal>

            {/* 7. 批量更新摆渡发版弹窗 */}
            <Modal
                title="批量更新发版情况"
                open={batchUpdateModalVisible}
                onCancel={() => setBatchUpdateModalVisible(false)}
                onOk={handleBatchUpdateRelease}
                confirmLoading={updatingBatch}
                width={700}
                okText="开始更新"
                cancelText="取消"
            >
                <div style={{ marginBottom: 12 }}>
                    <Text type="secondary">
                        请输入多行内容，每行格式为：<Text strong>问题编号 [空格或制表符] 版本编号 [空格或制表符] 发版状态</Text>
                        <br />
                        示例：<Text code>NX20260403044  202603-10bg406  已摆渡</Text>
                    </Text>
                </div>
                <TextArea
                    rows={12}
                    placeholder="粘贴多行数据到这里..."
                    value={batchUpdateText}
                    onChange={(e) => setBatchUpdateText(e.target.value)}
                    disabled={updatingBatch}
                />
                <div style={{ marginTop: 8 }}>
                    <ul style={{ paddingLeft: 20, fontSize: '12px', color: '#8c8c8c' }}>
                        <li>问题编号相同，版本编号不同：自动用 "," 拼接。</li>
                        <li>问题编号相同，发版状态不同：只保留第一行的状态。</li>
                        <li>忽略空行或格式不正确的行。</li>
                    </ul>
                </div>
            </Modal>
        </div >
    );
}

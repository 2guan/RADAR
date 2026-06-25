/**
 * @file IssueDetailView.tsx
 * @description PAMS 问题详情侧滑抽屉/弹窗视图组件
 * @author hengguan
 * @date 2026-05-20
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Spin, message, Modal, Input, Button, Select, Upload, Image, Empty, Popconfirm, AutoComplete, DatePicker, Segmented, Tooltip, QRCode, Table } from 'antd';
import { SearchOutlined, PlusOutlined, DeleteOutlined, CloseOutlined, FormOutlined, HistoryOutlined } from '@ant-design/icons';
import EditOutlined from '@ant-design/icons/EditOutlined';
import { useNavigate } from 'react-router-dom';
import type { UploadFile } from 'antd/es/upload/interface';
import type { Issue, DictItem, Case, User, JWTPayload } from '@/types';
import { Descriptions, Tag, Drawer, Grid } from 'antd';
import dayjs from 'dayjs';
import styles from './IssueDetailView.module.css';
import { fetchClient, pamsFetch } from '@/lib/api-client';
import { isDocumentFile, getFileTypeEmoji, validateUploadFile, UPLOAD_ACCEPT_STRING, compressImage } from '@/lib/imageUtils';

const { TextArea } = Input;
const { Option } = Select;
const fetch = pamsFetch;

/**
 * @interface LinkedCase
 * @description 被关联测试用例的简要数据结构
 */
interface LinkedCase {
    /** 案例的唯一标识编号 */
    case_id: string;
    /** 测试用例的场景名称 */
    case_name: string;
}

/**
 * @interface IssueDetailViewProps
 * @description 问题单详情弹框抽屉组件接收的属性参数
 */
interface IssueDetailViewProps {
    /** 问题单 ID 唯一标识 */
    issueId: string;
    /** 系统数据字典大对象 KV 映射 */
    dicts: Record<string, DictItem[]>;
    /** 当前登录的用户信息或 JWT Token 解析结果，未登录时为 null */
    user?: (User | JWTPayload) | null;
    /** 数据成功更新后触发父级页面刷新列表的回调 */
    onRefresh?: () => void;
}

export function IssueDetailView({ issueId, dicts, user, onRefresh }: IssueDetailViewProps) {
    const navigate = useNavigate();
    const router = { push: (path: string) => navigate(path) };
    const screens = Grid.useBreakpoint();
    const colCount = (screens.xxl || screens.xl) ? 3 : (screens.lg || screens.md) ? 2 : 1;
    /** 全局 Ant Design message 消息提醒 api 实例 */
    const [messageApi, contextHolder] = message.useMessage();
    /** 详情加载中的 loading 状态 */
    const [loading, setLoading] = useState(true);
    /** 当前拉取到的缺陷问题单实体数据 */
    const [issue, setIssue] = useState<Issue | null>(null);

    // Modals
    /** 当前处于激活状态下的字段修改模态框标识。通过区分不同的字符串值来渲染对应的字段修改 Modal */
    const [activeModal, setActiveModal] = useState<'status' | 'category' | 'people' | 'desc' | 'summary' | 'system' | 'cases' | 'editLog' | 'round' | 'root_cause' | 'solution' | 'plan_fix_time' | 'urgency' | 'handling_method' | 'version_number' | 'release_status' | 'work_order_no' | null>(null);
    /** 全局 Ctrl+V 截图剪贴板粘贴上传监听开关 */
    const [pasteEnabled, setPasteEnabled] = useState(false);
    /** 弹窗或 Drawer 预览中的测试案例实体数据 */
    const [viewingCase, setViewingCase] = useState<Case | null>(null);
    /** 案例详情 Drawer 抽屉的开启状态 */
    const [caseDrawerVisible, setCaseDrawerVisible] = useState(false);
    /** 计划解决时间修改弹框的可见性状态 */
    const [planFixTimeModalVisible, setPlanFixTimeModalVisible] = useState(false);
    /** 临时中转暂存的计划解决时间 */
    const [tempPlanFixTime, setTempPlanFixTime] = useState<dayjs.Dayjs | null>(null);

    // History State
    /** 缺陷历史操作修改记录/审计日志弹框的可见性状态 */
    const [historyModalVisible, setHistoryModalVisible] = useState(false);
    /** 已加载出的审计修改历史列表数组 */
    const [historyData, setHistoryData] = useState<any[]>([]);
    /** 审计历史加载中的 loading 状态 */
    const [historyLoading, setHistoryLoading] = useState(false);

    // Edit State for People
    /** 当前正在编辑的人员角色类别：'tracker' 跟踪人 | 'reporter' 报障人 | 'handler' 当前处理人 | 'guest' 游客提报人 */
    const [peopleType, setPeopleType] = useState<'tracker' | 'reporter' | 'handler' | 'guest'>('guest');
    /** 编辑中的人员的临时数据暂存区（包括姓名、机构代码、手机号） */
    const [tempPeople, setTempPeople] = useState({ name: '', org: '', contact: '' });
    /** 指派人员联想搜索得到的符合输入条件的系统内部用户下拉选项 */
    const [userSearchResults, setUserSearchResults] = useState<any[]>([]);

    // Edit State for Text
    /** 通用文本编辑弹框（如修改概述、详细描述、备注）中正在编辑的临时字符串暂存区 */
    const [tempText, setTempText] = useState('');

    // Edit State for Analysis
    /** 新增分析/进展日志时的手输文本框实时内容 */
    const [newAnalysis, setNewAnalysis] = useState('');
    /** 正在提交分析记录中的异步状态 loading 开关 */
    const [submittingAnalysis, setSubmittingAnalysis] = useState(false);
    /** 正在被编辑修改的分析记录在 logs 数组中的物理索引 */
    const [editingLogIndex, setEditingLogIndex] = useState<number | null>(null);

    // Guest info for Analysis
    /** 游客提报分析进展时，个人填写的身份记忆缓存（包含姓名、所属机构、手机号） */
    const [guestInfo, setGuestInfo] = useState({ name: '', org: '', contact: '' });
    /** 后台偏好配置中是否开启详情页二维码展示的特性标记 */
    const [qrcodeEnabled, setQrcodeEnabled] = useState(false);

    // File List
    /** 已上传/展示中的文件与截图列表，格式映射为 Antd Upload 文件对象 */
    const [fileList, setFileList] = useState<UploadFile[]>([]);

    // Case Search State
    /** 管理关联案例时，搜索输入框里的联想查询词 */
    const [caseSearchKeyword, setCaseSearchKeyword] = useState('');
    /** 搜索用例库得到的可选案例列表 */
    const [caseSearchResults, setCaseSearchResults] = useState<Case[]>([]);
    /** 用例检索中的网络状态 loading */
    const [searchingCases, setSearchingCases] = useState(false);

    /**
     * 从后端 API 异步加载系统全局偏好配置
     * @description 读取系统设置中是否开启详情页移动端二维码展示这一项参数，存入 qrcodeEnabled 状态变量中
     */
    const fetchSystemSettings = async () => {
        try {
            const res = await fetch('/PAMS/api/ai-settings');
            const data = await res.json();
            if (data.success) {
                const setting = data.data.find((s: any) => s.setting_key === 'issue_detail_qrcode_enabled');
                if (setting) {
                    setQrcodeEnabled(setting.setting_value === 'true');
                }
            }
        } catch (error) {
            console.error('Failed to fetch system settings:', error);
        }
    };

    useEffect(() => { fetchSystemSettings(); }, [issueId]);
    /**
     * 全局粘贴事件监听处理器
     * @description 开启粘贴模式后，用户可以直接在页面中通过 Ctrl+V 粘贴截图进行快捷上传。
     * 具备大图自动二维压缩优化，压缩后自动调用上传逻辑，并在 UI 触发局部进度提示。
     */
    useEffect(() => {
        const handleGlobalPaste = async (e: ClipboardEvent) => {
            if (!pasteEnabled) return;
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    e.preventDefault();
                    const blob = items[i].getAsFile();
                    if (blob) {
                        try {
                            const file = new File([blob], `paste_${Date.now()}.png`, { type: blob.type });
                            const error = validateUploadFile(file);
                            if (error) {
                                messageApi.error(error);
                                continue;
                            }

                            let fileToUpload = file;
                            if (!isDocumentFile(file)) {
                                messageApi.loading({ content: '正在压缩...', key: 'pasteUpload' });
                                fileToUpload = await compressImage(file, {
                                    maxWidth: 2560,
                                    maxHeight: 2560,
                                    quality: 0.9,
                                    maxSizeMB: 2
                                });
                            }

                            messageApi.loading({ content: '正在上传...', key: 'pasteUpload' });
                            await uploadRawFile(fileToUpload);
                            messageApi.success({ content: '上传成功', key: 'pasteUpload' });
                        } catch (err) {
                            messageApi.error({ content: '处理或上传失败', key: 'pasteUpload' });
                        }
                    }
                }
            }
        };
        window.addEventListener('paste', handleGlobalPaste);
        return () => window.removeEventListener('paste', handleGlobalPaste);
    }, [pasteEnabled]);

    useEffect(() => {
        if (issueId) {
            fetchDetail(issueId);
        }
        loadGuestInfo();
    }, [issueId, user]);

    /**
     * 加载当前提报人（或游客）的身份记忆信息
     * @description 若用户已登录，则自动读取全局 AuthContext 中的用户信息；若未登录，则从浏览器本地 localStorage 中读取之前提报过的历史记录，以提升免登录用户二次录入分析的体验。
     */
    const loadGuestInfo = () => {
        if (user) {
            setGuestInfo({
                name: user.real_name,
                org: user.organization,
                contact: user.contact
            });
            return;
        }

        const storedName = localStorage.getItem('guest_submitter_name');
        const storedOrg = localStorage.getItem('guest_submitter_org');
        const storedContact = localStorage.getItem('guest_submitter_contact');
        if (storedName) {
            setGuestInfo({
                name: storedName,
                org: storedOrg || '',
                contact: storedContact || ''
            });
        }
    };

    /**
     * 获取缺陷问题单的详细数据
     * @description 异步向后端 API 请求指定 ID 的问题单，解析返回的问题附件列表（将其映射为 Antd Upload 组件所需的 UploadFile[] 结构），然后更新 issue 状态。
     * @param {string} id 问题单 ID
     * @param {boolean} [showLoading=true] 是否展示全局加载动画，二次局部静默刷新时传 false
     */
    const fetchDetail = async (id: string, showLoading = true) => {
        if (showLoading) setLoading(true);
        try {
            const res = await fetchClient(`/PAMS/api/issues/${id}`);
            const json = await res.json();
            if (json.success) {
                const data = json.data;
                const files = (data.attachments || []).map((url: string, index: number) => ({
                    uid: `-${index}`,
                    name: url.split('/').pop() || `file-${index}`,
                    status: 'done',
                    url: url.startsWith('http') ? url : `/PAMS${url.startsWith('/') ? '' : '/'}${url}`
                }));
                setFileList(files);
                setIssue(json.data);
            } else {
                messageApi.error(json.error || '获取详情失败');
            }
        } catch (e) {
            messageApi.error('加载失败');
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    /**
     * 获取指定测试案例的详细信息并拉起 Drawer 抽屉展示
     * @description 点击关联的案例单号时触发，异步从后端接口拉取该案例的详细业务场景、前置条件与操作步骤，写入 viewingCase 并激活 Drawer 展示。
     * @param {string} caseId 案例 ID
     */
    const fetchCaseDetail = async (caseId: string) => {
        try {
            const res = await fetchClient(`/PAMS/api/cases/${caseId}`);
            const json = await res.json();
            if (json.success) {
                setViewingCase(json.data);
                setCaseDrawerVisible(true);
            } else {
                messageApi.error('获取案例详情失败');
            }
        } catch (e) {
            messageApi.error('详情请求失败');
        }
    };

    /**
     * 获取该问题单的审计修改历史记录
     * @description 异步请求问题单的变更轨迹，包括操作时间、操作人、以及修改的字段和具体内容（前后值对比），成功后打开历史模态框进行审计查阅。
     */
    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const resp = await fetchClient(`/PAMS/api/issues/${issueId}/history`);
            const json = await resp.json();
            if (json.success) {
                setHistoryData(json.data || []);
                setHistoryModalVisible(true);
            } else {
                messageApi.error(json.error || '获取历史记录失败');
            }
        } catch (error) {
            messageApi.error('获取历史记录失败');
        } finally {
            setHistoryLoading(false);
        }
    };

    /**
     * 统一更新缺陷属性的后端调用方法
     * @description 用于各种字段（如状态、分类、所属系统、备注、发版情况等）的单项或组合更新。更新成功后静默拉取最新详情并刷新父级列表。
     * @param {Partial<Issue>} payload 待更新的问题属性字段荷载
     */
    const updateIssue = async (payload: Partial<Issue>) => {
        if (!issue) return;
        try {
            const res = await fetchClient(`/PAMS/api/issues/${issue.issue_id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            const json = await res.json();
            if (json.success) {
                messageApi.success('更新成功');
                fetchDetail(issue.issue_id, false);
                onRefresh?.();
            } else {
                messageApi.error(json.error || '更新失败');
            }
        } catch (e) {
            messageApi.error('更新请求失败');
        }
    };

    /**
     * 计算问题单自提出起所消耗的处理天数
     * @description 如果已解决，则计算提出到解决的绝对天数差；如果尚未解决，则计算提出到当前时间的相对处理天数（向上取整）。
     * @param {string} created 问题创建提出时间
     * @param {string | null} resolved 问题解决时间
     * @returns {string} 耗时天数字符串
     */
    const calculateDuration = (created: string, resolved: string | null) => {
        const start = dayjs(created);
        const end = resolved ? dayjs(resolved) : dayjs();
        const diffInDays = end.diff(start, 'day', true);
        return diffInDays.toFixed(0);
    };

    /**
     * 计算问题单实际解决或当前未解决状态下的超期天数
     * @description 判定当前时间（或解决时间）是否已超过计划解决时间，如超期则返回具体的超期天数，未超期则返回 '-'。
     * @param {string | null} plan 计划解决时间
     * @param {string | null} resolved 实际解决时间
     * @returns {string} 超期天数表示（如 "3 天" 或 "-"）
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
        return diff.toFixed(0) + ' 天';
    };

    /**
     * 数据字典 Key 到中文 Value 的快速解析器
     * @description 传入字典代码与具体键值，在已拉取的全局字典缓存（dicts）中匹配出对应的中文展示名称。
     * @param {string} code 字典大类编码（如 'issue_status', 'system'）
     * @param {string | null} key 具体的字典键 (item_key)
     * @returns {string} 匹配到的中文展示名字，若无匹配则返回原 key 或 '-'
     */
    const resolveDict = (code: string, key: string | null) => {
        if (!key) return '-';
        const found = dicts[code]?.find(d => d.item_key === key);
        return found ? found.item_value : key;
    };

    /**
     * 根据问题流转状态获取对应的 CSS Class 样式名 (author: hengguan)
     * @param {string | null} status 问题状态
     * @returns {string} CSS module 类名
     */
    const getStatusClass = (status: string | null) => {
        if (!status) return '';
        if (status === '处理中') return styles.statusProcessing;
        if (status === '已解决') return styles.statusSolved;
        if (status === '待验证') return styles.statusVerify;
        if (status === '重现') return styles.statusReproduce;
        if (status === '已查明原因') return styles.statusFound;
        return '';
    };

    /**
     * 根据分类中文名获取对应的 Tag 卡片 CSS Class 样式名 (author: hengguan)
     * @param {string} categoryName 分类名称
     * @returns {string} CSS module 类名
     */
    const getCategoryTagClass = (categoryName: string) => {
        if (categoryName.includes('金科技术') || categoryName === '金科') return styles.tagBlue;
        if (categoryName.includes('农信技术')) return styles.tagOrange;
        if (categoryName.includes('农信业务')) return styles.tagRed;
        return styles.tagDefault;
    };

    /**
     * 当状态选择发生变更时触发 (author: hengguan)
     * @param {string} val 变更后的状态 key
     */
    const handleStatusChange = (val: string) => {
        updateIssue({ status: val as any });
        setActiveModal(null);
    };

    /**
     * 当问题流转轮次发生变更时触发 (author: hengguan)
     * @param {string} val 变更后的轮次值
     */
    const handleRoundChange = (val: string) => {
        updateIssue({ round: val });
        setActiveModal(null);
    };

    /**
     * 分类与详细分类级联修改的核心回调方法 (author: hengguan)
     * @param {'category' | 'detailed_classification'} key 待修改的分类键名
     * @param {string} val 选择的分类字典 key
     */
    const handleCategoryChange = (key: 'category' | 'detailed_classification', val: string) => {
        if (!issue) return;
        const payload: any = {};
        if (key === 'category') {
            payload.category = val;
        } else {
            payload.detailed_classification = val;
        }
        updateIssue(payload);
    };

    /**
     * 拉起修改特定角色人员信息的对话框 (author: hengguan)
     * @param {'tracker' | 'reporter' | 'handler' | 'guest'} type 待编辑的人员角色类型
     */
    const openPeopleModal = (type: 'tracker' | 'reporter' | 'handler' | 'guest') => {
        setPeopleType(type);
        if (type === 'guest') {
            setTempPeople({ ...guestInfo });
        } else if (issue) {
            setTempPeople({
                name: (issue as any)[`${type}_name`] || '',
                org: (issue as any)[`${type}_org`] || '',
                contact: (issue as any)[`${type}_contact`] || ''
            });
        }
        setActiveModal('people');
        setUserSearchResults([]);
    };

    /**
     * 保存人员干系人信息的单项变更 (author: hengguan)
     * @description 若编辑的是游客身份，则缓存写入 localStorage 中；若是跟踪人、报障人或处理人，则调用 updateIssue 接口保存落库。
     */
    const savePeople = () => {
        if (peopleType === 'guest') {
            setGuestInfo(tempPeople);
            localStorage.setItem('guest_submitter_name', tempPeople.name);
            localStorage.setItem('guest_submitter_org', tempPeople.org);
            localStorage.setItem('guest_submitter_contact', tempPeople.contact);
            setActiveModal(null);
            return;
        }

        updateIssue({
            [`${peopleType}_name`]: tempPeople.name,
            [`${peopleType}_org`]: tempPeople.org,
            [`${peopleType}_contact`]: tempPeople.contact
        });
        setActiveModal(null);
    };

    /**
     * 联想搜索系统内部干系人用户 (author: hengguan)
     * @param {string} val 检索的模糊匹配词
     */
    const searchUser = async (val: string) => {
        if (!val) { setUserSearchResults([]); return; }
        const res = await fetchClient(`/PAMS/api/users?search=${encodeURIComponent(val)}&pageSize=10`);
        const json = await res.json();
        if (json.success) {
            setUserSearchResults(json.data.items || []);
        }
    };

    /**
     * 为当前问题追加一条分析/修改历史进展记录
     * @description 支持登录用户直接追加，也支持免登录用户根据 guestInfo 临时填写的名字、机构及联系电话以游客身份追加。追加完成后刷新分析历史时间轴。
     */
    const addAnalysis = async () => {
        if (!newAnalysis.trim() || !issue) return;
        setSubmittingAnalysis(true);
        try {
            const res = await fetchClient(`/PAMS/api/issues/${issue.issue_id}/analysis`, {
                method: 'POST',
                body: JSON.stringify({
                    content: newAnalysis,
                    handler_name: guestInfo.name,
                    handler_org: guestInfo.org,
                    handler_contact: guestInfo.contact
                })
            });
            const json = await res.json();
            if (json.success) {
                messageApi.success('分析记录添加成功');
                setNewAnalysis('');
                fetchDetail(issue.issue_id, false);
                onRefresh?.();
            } else {
                messageApi.error(json.error || '添加失败');
            }
        } catch (e) {
            messageApi.error('提交请求失败');
        } finally {
            setSubmittingAnalysis(false);
        }
    };

    /**
     * 删除指定索引位置的缺陷进展/分析记录 (author: hengguan)
     * @param {number} idx 日志在 analysis_log 列表中的索引
     */
    const handleDeleteLog = async (idx: number) => {
        if (!issue) return;
        const newLogs = [...(issue.analysis_log || [])];
        newLogs.splice(idx, 1);
        await updateIssue({ analysis_log: newLogs });
    };

    /**
     * 打开特定索引位置日志的修改文本对话框 (author: hengguan)
     * @param {number} idx 日志在数组中的索引位置
     * @param {string} logContent 待改写的日志原文字符串
     */
    const openEditLog = (idx: number, logContent: string) => {
        setEditingLogIndex(idx);
        setTempText(logContent);
        setActiveModal('editLog');
    };

    /**
     * 保存修改缺陷进展分析日志的最终回调 (author: hengguan)
     * @description 获取修改后的新文本，覆盖在 logs 数组对应索引位置并调用 updateIssue 落库保存。
     */
    const handleUpdateLog = async () => {
        if (!issue || editingLogIndex === null) return;
        const newLogs = [...(issue.analysis_log || [])];
        if (newLogs[editingLogIndex]) {
            newLogs[editingLogIndex] = { ...newLogs[editingLogIndex], content: tempText };
        }
        await updateIssue({ analysis_log: newLogs });
        setActiveModal(null);
        setEditingLogIndex(null);
    };

    /**
     * 删除已上传的问题截图附件 (author: hengguan)
     * @description 从 attachments 数组中过滤掉被删除的附件物理绝对/相对 URL，并调用 updateIssue 落库。
     * @param {string} fileUrl 被删除的附件完整相对 URL 路径
     */
    const handleRemoveFile = async (fileUrl: string) => {
        if (!issue) return;
        const newAtts = (issue.attachments || []).filter(u => u !== fileUrl);
        await updateIssue({ attachments: newAtts });
    };

    /**
     * 核心附件文件二进制上传方法
     * @description 将文件包装成 FormData 通过 POST 提交到 `/PAMS/api/upload` 接口，接口返回文件在磁盘的 URL 后，同步将其追加到当前问题单的 attachments 数组中并调用 updateIssue 进行落库保存。
     * @param {File} file 待上传的文件对象（可能是经过压缩的图片或原始文档）
     * @returns {Promise<string>} 返回文件存储的 URL 路径
     */
    const uploadRawFile = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('/PAMS/api/upload', {
                method: 'POST',
                body: formData
            });
            const json = await res.json();
            if (json.success) {
                const url = json.data.url;
                const newAtts = [...(issue?.attachments || []), url];
                await updateIssue({ attachments: newAtts });
                return url;
            } else {
                throw new Error(json.error || 'Upload failed');
            }
        } catch (e) {
            throw e;
        }
    };

    /**
     * 自定义上传组件的底层 Request 适配器
     * @description 对接 Ant Design Upload 组件的 customRequest，将用户拖拽或选择的文件对象通过 uploadRawFile 进行异步上传，并处理成功与失败的回调。
     * @param {any} options Antd 传入的上传上下文对象，包含 file, onSuccess, onError
     */
    const handleUpload = async (options: any) => {
        const { file, onSuccess, onError } = options;
        try {
            const url = await uploadRawFile(file);
            onSuccess(url);
        } catch (e: any) {
            onError(e);
        }
    };

    /**
     * 模糊搜索测试用例/案例库
     * @description 用户输入案例编号或场景关键汉字时，触发模糊搜索，列出最多 10 条匹配的用例结果供用户选择关联。
     */
    const searchCases = async () => {
        if (!caseSearchKeyword.trim()) return;
        setSearchingCases(true);
        try {
            const res = await fetchClient(`/PAMS/api/cases?keyword=${encodeURIComponent(caseSearchKeyword)}&pageSize=10`);
            const json = await res.json();
            if (json.success) {
                setCaseSearchResults(json.data.items || []);
            } else {
                messageApi.error(json.error || '搜索失败');
            }
        } catch (e) {
            messageApi.error('搜索请求失败');
        } finally {
            setSearchingCases(false);
        }
    };

    /**
     * 为缺陷问题单绑定关联测试案例
     * @description 避免重复绑定校验，将选中的案例 ID 及名称追加至 linked_cases 字段，并同步调用 updateIssue 写入数据库。
     * @param {Case} c 选择的案例对象
     */
    const addLinkedCase = async (c: Case) => {
        if (!issue) return;
        const currentLinks = issue.linked_cases || [];
        if (currentLinks.find(l => l.case_id === c.case_id)) {
            messageApi.warning('已关联该案例');
            return;
        }
        const newLinks = [...currentLinks, { case_id: c.case_id, case_name: c.scenario || c.case_id }];
        await updateIssue({ linked_cases: newLinks as any });
        messageApi.success('关联案例添加成功');
    };

    /**
     * 解绑/移除关联的测试用例
     * @description 从 linked_cases 数组中过滤掉被取消关联的 case_id，并通过 updateIssue 调用后台 API 写入数据库。
     * @param {string} caseId 待移除关联的案例 ID
     */
    const removeLinkedCase = async (caseId: string) => {
        if (!issue) return;
        const newLinks = (issue.linked_cases || []).filter(l => l.case_id !== caseId);
        await updateIssue({ linked_cases: newLinks as any });
    };

    if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 50 }}><Spin /></div>;
    if (!issue) return <div style={{ padding: 20, textAlign: 'center' }}>问题不存在</div>;

    const sysDisplay = resolveDict('system', issue.system);
    const modDisplay = resolveDict('module', issue.module);
    const bgDisplay = resolveDict('business_group', issue.business_group);
    const categoryName = resolveDict('issue_category', issue.category || '');
    const issueDetailUrl = `${window.location.origin}/#/pams/issues/${issue.issue_id}`;
    const businessTicketBoxStyle: React.CSSProperties = {
        background: 'var(--radar-bg)',
        padding: '5px 8px',
        borderRadius: 0,
        border: '1px solid var(--radar-border)',
    };
    const businessTicketRowStyle: React.CSSProperties = {
        ...businessTicketBoxStyle,
        display: 'flex',
        alignItems: 'flex-start',
    };
    const businessTicketLabelStyle: React.CSSProperties = {
        fontSize: 11,
        color: 'var(--radar-text-secondary)',
        width: 70,
        flexShrink: 0,
        fontWeight: 'bold',
    };
    const businessTicketValueStyle: React.CSSProperties = {
        fontSize: 11,
        fontWeight: 'bold',
        color: 'var(--radar-ink)',
        wordBreak: 'break-all',
        whiteSpace: 'pre-wrap',
    };

    return (
        <div className={`pams-detail-view ${styles.container}`}>
            {contextHolder}
            <main className={styles.main}>
                <div className={styles.headerCard}>
                    <div className={styles.headerContent}>
                        <div className={styles.idAndButtonsWrapper}>
                            <div
                                className={styles.issueId}
                                style={issue.issue_id && issue.issue_id.length > 14 ? { fontSize: issue.issue_id.length > 17 ? '0.9rem' : '1.0rem' } : {}}
                                onClick={() => {
                                    navigator.clipboard.writeText(issueDetailUrl);
                                    messageApi.success('问题链接已复制');
                                }}
                                title="点击复制链接"
                            >
                                {issue.issue_id}
                            </div>
                            <div className={styles.headerActionButtons}>
                                {!!(issue as any).has_itsm && (
                                    <Tooltip title="查看对应工单内容">
                                        <Button
                                            type="primary"
                                            size="small"
                                            icon={<FormOutlined />}
                                            onClick={() => router.push(`/pams/itsmdetail/${issue.issue_id}`)}
                                        >
                                            工单
                                        </Button>
                                    </Tooltip>
                                )}
                                {!!(issue as any).has_kongming && (
                                    <Tooltip title="查看对应孔明工单内容">
                                        <Button
                                            type="default"
                                            size="small"
                                            icon={<FormOutlined />}
                                            onClick={() => router.push(`/pams/kongmingdetail/${issue.issue_id}`)}
                                        >
                                            孔明工单
                                        </Button>
                                    </Tooltip>
                                )}
                                {!!issue.business_ticket_id && (
                                    <Tooltip title="查看对应业务工单内容">
                                        <Button
                                            type="default"
                                            size="small"
                                            icon={<FormOutlined />}
                                            onClick={() => router.push(`/pams/business-ticketdetail/${issue.business_ticket_id}`)}
                                            style={{ borderColor: '#22c55e', color: '#22c55e' }}
                                        >
                                            业务工单
                                        </Button>
                                    </Tooltip>
                                )}
                            </div>
                        </div>
                        <div className={styles.headerRight}>
                            <div className={styles.roundBadge} onClick={() => setActiveModal('round')}>
                                <span>{resolveDict('issue_round', issue.round) || '-'}</span>
                            </div>
                            <div className={`${styles.statusBadge} ${getStatusClass(issue.status)}`} onClick={() => setActiveModal('status')}>
                                <span className={styles.statusBadgeDot}></span>
                                {issue.status}
                            </div>
                            <Tooltip title="查看操作历史">
                                <Button 
                                    type="text" 
                                    size="small" 
                                    icon={<HistoryOutlined />} 
                                    className={styles.historyIconBtn}
                                    onClick={fetchHistory}
                                    loading={historyLoading}
                                />
                            </Tooltip>
                        </div>
                    </div>
                </div>

                <section className={styles.peopleGrid}>
                    <div className={styles.personCard} onClick={() => openPeopleModal('tracker')}>
                        <div className={styles.personMeta} style={{ marginBottom: 4 }}>
                            <span className={`${styles.personTag} ${styles.tagTracker}`}>跟踪人</span>
                            <span className={styles.personName}>{issue.tracker_name || '-'}</span>
                        </div>
                        <div className={styles.personMeta}>
                            <span className={styles.orgTag}>{resolveDict('organization', issue.tracker_org)}</span>
                            <span className={styles.contactText}>{issue.tracker_contact || '-'}</span>
                        </div>
                    </div>

                    <div className={styles.personCard} onClick={() => openPeopleModal('reporter')}>
                        <div className={styles.personMeta} style={{ marginBottom: 4 }}>
                            <span className={`${styles.personTag} ${styles.tagReporter}`}>报障人</span>
                            <span className={styles.personName}>{issue.reporter_name || '-'}</span>
                        </div>
                        <div className={styles.personMeta}>
                            <span className={styles.orgTag}>{resolveDict('organization', issue.reporter_org)}</span>
                            <span className={styles.contactText}>{issue.reporter_contact || '-'}</span>
                        </div>
                    </div>

                    <div className={styles.personCard} onClick={() => openPeopleModal('handler')}>
                        <div className={styles.personMeta} style={{ marginBottom: 4 }}>
                            <span className={`${styles.personTag} ${styles.tagHandler}`}>处理人</span>
                            <span className={styles.personName}>{issue.handler_name || '-'}</span>
                        </div>
                        <div className={styles.personMeta}>
                            <span className={styles.orgTag}>{resolveDict('organization', issue.handler_org)}</span>
                            <span className={styles.contactText}>{issue.handler_contact || '-'}</span>
                        </div>
                    </div>
                </section>

                <section className={styles.infoGrid}>
                    <div className={styles.infoCard} onClick={() => setActiveModal('category')}>
                        <EditOutlined className={styles.editIcon} />
                        <span className={styles.label}>问题分类</span>
                        <div className={styles.categoryContent}>
                            <div className={`${styles.categoryTag} ${getCategoryTagClass(categoryName)}`}>{categoryName}</div>
                            <div className={styles.valuePrimary}>{resolveDict('issue_detailed_classification', issue.detailed_classification || '')}</div>
                        </div>
                    </div>

                    <div className={styles.infoCard} onClick={() => setActiveModal('system')}>
                        <EditOutlined className={styles.editIcon} />
                        <span className={styles.label}>所属系统</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <span className={styles.valuePrimary} style={{ fontWeight: 'bold' }} title={issue.system ? `${issue.system}-${sysDisplay}` : ''}>
                                {issue.system ? sysDisplay : '-'}
                            </span>
                            {bgDisplay && <span className={styles.tagGray}>{bgDisplay}</span>}
                            {modDisplay && <span className={styles.tagGray}>{modDisplay}</span>}
                        </div>
                    </div>

                    <div className={`${styles.infoCard} ${styles.span2Mobile}`} onClick={() => { setTempText(issue.work_order_no || ''); setActiveModal('work_order_no'); }}>
                        <EditOutlined className={styles.editIcon} />
                        <span className={styles.label}>工单编号</span>
                        <div className={`${styles.valuePrimary} ${styles.textTruncate}`} style={{ textAlign: 'center', fontWeight: 600 }}>
                            {issue.work_order_no || '-'}
                        </div>
                    </div>
                </section>

                <section className={styles.timeFieldsGrid}>
                    <div className={styles.infoCard}>
                        <span className={styles.label}>提出时间</span>
                        <div className={styles.valuePrimary} style={{ textAlign: 'center', fontSize: '0.6875rem' }}>
                            {dayjs(issue.create_time).format('YYYY.M.D HH:mm')}
                        </div>
                    </div>

                    <div className={styles.infoCard} onClick={() => {
                        setTempPlanFixTime(issue.plan_fix_time ? dayjs(issue.plan_fix_time) : null);
                        setPlanFixTimeModalVisible(true);
                    }}>
                        <EditOutlined className={styles.editIcon} />
                        <span className={styles.label}>计划解决时间</span>
                        <div className={styles.valuePrimary} style={{ textAlign: 'center', fontSize: '0.6875rem' }}>
                            {issue.plan_fix_time ? dayjs(issue.plan_fix_time).format('YYYY.M.D') : '-'}
                        </div>
                    </div>

                    <div className={styles.infoCard}>
                        <span className={styles.label}>处理/超期天数</span>
                        <div className={styles.valuePrimary} style={{ textAlign: 'center', fontSize: '0.6875rem' }}>
                            {calculateDuration(issue.create_time, issue.resolve_time)} 天 / <span style={{ color: calculateOverdue(issue.plan_fix_time, issue.resolve_time) !== '-' ? '#ef4444' : 'inherit' }}>{calculateOverdue(issue.plan_fix_time, issue.resolve_time)}</span>
                        </div>
                    </div>
                    <div className={styles.infoCard} onClick={(e) => { e.stopPropagation(); setActiveModal('cases'); }}>
                        <PlusOutlined className={styles.editIcon} />
                        <span className={styles.label}>关联案例</span>
                        <div className={styles.valuePrimary} style={{ textAlign: 'center', fontSize: '0.6875rem' }}>
                            {issue.linked_cases && issue.linked_cases.length > 0 ? `${issue.linked_cases.length} 条` : '-'}
                        </div>
                    </div>
                </section>

                <section className={styles.timeFieldsGrid} style={{ marginTop: '0.5rem' }}>
                    <div className={styles.infoCard} onClick={() => setActiveModal('urgency')}>
                        <EditOutlined className={styles.editIcon} />
                        <span className={styles.label}>紧急程度</span>
                        <div className={styles.valuePrimary} style={{ textAlign: 'center' }}>
                            <Tag color={issue.urgency === '高' ? 'red' : issue.urgency === '中' ? 'orange' : 'green'} style={{ margin: 0 }}>
                                {issue.urgency || '中'}
                            </Tag>
                        </div>
                    </div>

                    <div className={styles.infoCard} onClick={() => setActiveModal('handling_method')}>
                        <EditOutlined className={styles.editIcon} />
                        <span className={styles.label}>处理方式</span>
                        <div className={styles.valuePrimary} style={{ textAlign: 'center' }}>
                            <Tag color="processing" style={{ margin: 0 }}>
                                {issue.handling_method || '其它'}
                            </Tag>
                        </div>
                    </div>

                    <div className={styles.infoCard} onClick={() => { setTempText(issue.version_number || ''); setActiveModal('version_number'); }}>
                        <EditOutlined className={styles.editIcon} />
                        <span className={styles.label}>版本编号</span>
                        <div className={`${styles.valuePrimary} ${styles.textTruncate}`} style={{ textAlign: 'center', fontSize: '0.75rem', padding: '0 4px' }} title={issue.version_number || undefined}>
                            {issue.version_number || '-'}
                        </div>
                    </div>

                    <div className={styles.infoCard} onClick={() => { setTempText(issue.release_status || ''); setActiveModal('release_status'); }}>
                        <EditOutlined className={styles.editIcon} />
                        <span className={styles.label}>发版情况</span>
                        <div className={`${styles.valuePrimary} ${styles.textTruncate}`} style={{ textAlign: 'center', fontSize: '0.75rem', padding: '0 4px' }} title={issue.release_status || undefined}>
                            {issue.release_status || '-'}
                        </div>
                    </div>
                </section>

                <div className={styles.contentGrid}>
                    <div className={styles.leftCol}>
                        <section className={styles.contentSection}>
                            <div className={styles.descBox}>
                                <div className={styles.descTitleRow}>
                                    <span className={styles.descLabel}>问题概述</span>
                                    <EditOutlined style={{ color: '#cbd5e1', fontSize: 12, cursor: 'pointer' }} onClick={() => { setTempText(issue.summary); setActiveModal('summary'); }} />
                                </div>
                                <div className={styles.descContent}>{issue.summary}</div>
                            </div>

                            <div style={{ paddingLeft: 8, paddingRight: 8 }}>
                                <div className={styles.descTitleRow}>
                                    <span className={styles.descLabel}>问题详细描述</span>
                                    <EditOutlined style={{ color: '#cbd5e1', fontSize: 12, cursor: 'pointer' }} onClick={() => { setTempText(issue.details); setActiveModal('desc'); }} />
                                </div>
                                <div className={styles.detailContent} dangerouslySetInnerHTML={{ __html: (issue.details || '').replace(/\n/g, '<br/>') }}></div>
                            </div>
                        </section>

                        <section className={styles.contentSection}>
                            <div className={styles.sectionHeader} style={{ marginBottom: 12 }}>
                                <div className={styles.sectionTitle} style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>
                                    问题截图及日志报告
                                </div>
                            </div>
                            <div className={styles.screenshotGrid}>
                                <Image.PreviewGroup>
                                    {fileList.map((file, index) => {
                                        const fileName = file.name || file.url || '';
                                        const isDoc = isDocumentFile(fileName);
                                        return (
                                            <div key={file.uid} className={styles.screenshotItem}>
                                                {isDoc ? (
                                                    <div
                                                        style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: '#fafafa' }}
                                                        onClick={() => {
                                                            if (file.url) {
                                                                const link = document.createElement('a');
                                                                link.href = file.url;
                                                                link.download = file.name || 'document';
                                                                link.target = '_blank';
                                                                document.body.appendChild(link);
                                                                link.click();
                                                                document.body.removeChild(link);
                                                            }
                                                        }}
                                                        title={`点击下载 ${file.name || ''}`}
                                                    >
                                                        <span style={{ fontSize: 28 }}>{getFileTypeEmoji(fileName)}</span>
                                                        <span style={{ fontSize: 9, color: '#666', marginTop: 2, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{file.name || 'document'}</span>
                                                    </div>
                                                ) : (
                                                    <Image
                                                        src={file.url}
                                                        className={styles.screenshotImg}
                                                        width="100%"
                                                        height="100%"
                                                        style={{ objectFit: 'cover' }}
                                                    />
                                                )}
                                                <div
                                                    className={styles.deleteFileBtn}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveFile(issue?.attachments?.[index] || '');
                                                    }}
                                                >
                                                    <CloseOutlined />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </Image.PreviewGroup>
                                <Upload
                                    customRequest={handleUpload}
                                    showUploadList={false}
                                    accept={UPLOAD_ACCEPT_STRING}
                                    beforeUpload={async (file) => {
                                        const error = validateUploadFile(file);
                                        if (error) {
                                            messageApi.error(error);
                                            return Upload.LIST_IGNORE;
                                        }
                                        if (isDocumentFile(file)) {
                                            return file;
                                        }
                                        try {
                                            messageApi.loading({ content: '正在压缩...', key: 'upload' });
                                            const compressedFile = await compressImage(file, {
                                                maxWidth: 2560,
                                                maxHeight: 2560,
                                                quality: 0.9,
                                                maxSizeMB: 2
                                            });
                                            messageApi.success({ content: '压缩完成', key: 'upload', duration: 1 });
                                            return compressedFile;
                                        } catch (e) {
                                            messageApi.error({ content: '压缩失败', key: 'upload' });
                                            return Upload.LIST_IGNORE;
                                        }
                                    }}
                                >
                                    <div className={styles.uploadBox}>
                                        <span style={{ fontSize: 18, color: '#cbd5e1' }}>+</span>
                                        <span style={{ fontSize: 10, color: '#cbd5e1' }}>上传</span>
                                    </div>
                                </Upload>
                                <div
                                    className={`${styles.uploadBox} ${styles.hideOnMobile}`}
                                    style={pasteEnabled ? { borderColor: '#3b82f6', background: '#eff6ff' } : {}}
                                    onClick={() => {
                                        setPasteEnabled(!pasteEnabled);
                                        if (!pasteEnabled) {
                                            message.info('粘贴模式已开启,请直接Ctrl+V粘贴图片');
                                        }
                                    }}
                                >
                                    <span style={{ fontSize: 10, color: pasteEnabled ? '#3b82f6' : '#cbd5e1' }}>Ctrl+V</span>
                                    <span style={{ fontSize: 10, color: pasteEnabled ? '#3b82f6' : '#cbd5e1' }}>粘贴模式</span>
                                </div>
                                {qrcodeEnabled && (
                                    <div className={`${styles.qrCodeBox} ${styles.hideOnMobile}`}>
                                        <QRCode
                                            value={issueDetailUrl}
                                            size={48}
                                            bordered={false}
                                            style={{ opacity: 0.7 }}
                                        />
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className={styles.hFull}>
                        <section className={`${styles.contentSection} ${styles.hFull}`}>
                            <div className={styles.sectionHeader}>
                                <div className={styles.sectionTitle} style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase' }}>
                                    分析修改记录
                                </div>
                            </div>

                            <div className={styles.logContainer}>
                                <div className={styles.timelineLine}></div>
                                {issue.analysis_log?.map((log, index) => ({ log, index }))
                                    .reverse()
                                    .map(({ log, index }) => (
                                        <div key={index} className={styles.logItem}>
                                            <div className={styles.logDot}></div>
                                            <div className={styles.logContentBox}>
                                                <div className={styles.logHeader}>
                                                    <span className={styles.logName}>{log.handler_name}</span>
                                                    <span className={styles.logRole}>{resolveDict('organization', log.handler_org || null)}</span>
                                                    <span className={styles.logContact}>{log.handler_contact}</span>

                                                    <div className={styles.logActions}>
                                                        <span className={styles.logTime}>{dayjs(log.time).format('MM-DD HH:mm')}</span>
                                                        <EditOutlined className={styles.actionBtn} onClick={() => openEditLog(index, log.content)} />
                                                        <Popconfirm title="确定删除?" onConfirm={() => handleDeleteLog(index)} okText="是" cancelText="否">
                                                            <DeleteOutlined className={`${styles.actionBtn} ${styles.deleteBtn}`} />
                                                        </Popconfirm>
                                                    </div>
                                                </div>
                                                <div className={styles.logText}>{log.content}</div>
                                            </div>
                                        </div>
                                    ))}
                                {(!issue.analysis_log?.length) && <div style={{ color: '#999', fontSize: 12, paddingLeft: 20 }}>暂无记录</div>}
                            </div>

                            <div className={styles.inputArea}>
                                <div className={styles.logHeader} onClick={() => openPeopleModal('guest')} style={{ cursor: 'pointer', marginBottom: 8 }}>
                                    <span style={{ color: '#64748b', fontSize: 12 }}>添加人:</span>
                                    <span className={styles.logName}>{guestInfo.name || '点击完善'}</span>
                                    <span className={styles.logRole}>{resolveDict('organization', guestInfo.org) || '-'}</span>
                                    <span className={styles.logContact}>{guestInfo.contact || '-'}</span>
                                </div>
                                <textarea
                                    className={styles.textarea}
                                    placeholder="在此输入分析或处理情况..."
                                    value={newAnalysis}
                                    onChange={(e) => setNewAnalysis(e.target.value)}
                                ></textarea>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                    <button className={styles.submitBtn} onClick={addAnalysis} disabled={submittingAnalysis}>
                                        提交
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>
                </div>

                <section className={styles.contentSection} style={{ marginTop: '0.5rem' }}>
                    <div style={{ paddingLeft: 8, paddingRight: 8, marginBottom: 12 }}>
                        <div className={styles.descTitleRow}>
                            <span className={styles.descLabel}>问题原因</span>
                            <EditOutlined style={{ color: '#cbd5e1', fontSize: 12, cursor: 'pointer' }} onClick={() => { setTempText((issue as any).root_cause || ''); setActiveModal('root_cause'); }} />
                        </div>
                        <div className={styles.detailContent} dangerouslySetInnerHTML={{ __html: ((issue as any).root_cause || '暂无').replace(/\n/g, '<br/>') }}></div>
                    </div>

                    <div style={{ paddingLeft: 8, paddingRight: 8 }}>
                        <div className={styles.descTitleRow}>
                            <span className={styles.descLabel}>问题解决方案</span>
                            <EditOutlined style={{ color: '#cbd5e1', fontSize: 12, cursor: 'pointer' }} onClick={() => { setTempText((issue as any).solution || ''); setActiveModal('solution'); }} />
                        </div>
                        <div className={styles.detailContent} dangerouslySetInnerHTML={{ __html: ((issue as any).solution || '暂无').replace(/\n/g, '<br/>') }}></div>
                    </div>
                </section>

                <section className={styles.contentSection} style={{ marginTop: '0.5rem' }}>
                    <div style={{ padding: '12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className={styles.descLabel}>是否重大问题</span>
                        <Segmented
                            options={[
                                { label: '是', value: 1 },
                                { label: '否', value: 0 }
                            ]}
                            value={issue.is_major ? 1 : 0}
                            onChange={(val: any) => updateIssue({ is_major: val === 1 })}
                        />
                    </div>
                </section>

                {!!issue.business_ticket_id && (
                    <section className={styles.contentSection} style={{ marginTop: '0.5rem', padding: '10px 12px' }}>
                        <div className={styles.sectionHeader} style={{ marginBottom: 6 }}>
                            <div className={styles.sectionTitle} style={{ fontSize: 11, color: '#22c55e', textTransform: 'uppercase', fontWeight: 'bold' }}>
                                关联业务工单信息
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', marginBottom: '6px' }}>
                            <div style={businessTicketBoxStyle}>
                                <div style={{ fontSize: '10px', color: 'var(--radar-text-secondary)', marginBottom: '1px' }}>问题是否解决</div>
                                <div style={businessTicketValueStyle}>{issue.bt_is_problem_resolved || '-'}</div>
                            </div>
                            <div style={businessTicketBoxStyle}>
                                <div style={{ fontSize: '10px', color: 'var(--radar-text-secondary)', marginBottom: '1px' }}>是否争议</div>
                                <div style={businessTicketValueStyle}>{issue.bt_is_disputed || '-'}</div>
                            </div>
                            <div style={businessTicketBoxStyle}>
                                <div style={{ fontSize: '10px', color: 'var(--radar-text-secondary)', marginBottom: '1px' }}>需求是否关闭</div>
                                <div style={businessTicketValueStyle}>{issue.bt_is_demand_closed || '-'}</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={businessTicketRowStyle}>
                                <div style={businessTicketLabelStyle}>金科意见</div>
                                <div style={businessTicketValueStyle}>{issue.bt_jinke_initial_feedback || '-'}</div>
                            </div>
                            <div style={businessTicketRowStyle}>
                                <div style={businessTicketLabelStyle}>下一步处理</div>
                                <div style={businessTicketValueStyle}>{issue.bt_next_step_processing || '-'}</div>
                            </div>
                            <div style={businessTicketRowStyle}>
                                <div style={businessTicketLabelStyle}>备注</div>
                                <div style={businessTicketValueStyle}>{issue.bt_remarks || '-'}</div>
                            </div>
                        </div>
                    </section>
                )}
            </main>

            {/* Modals */}
            <Modal title="修改状态" open={activeModal === 'status'} onCancel={() => setActiveModal(null)} footer={null}>
                <Select style={{ width: '100%' }} onChange={handleStatusChange} value={issue.status}>
                    {dicts.issue_status?.map(d => (
                        <Option key={d.item_key} value={d.item_key}>{d.item_value}</Option>
                    ))}
                </Select>
            </Modal>

            <Modal title="修改轮次" open={activeModal === 'round'} onCancel={() => setActiveModal(null)} footer={null}>
                <Select style={{ width: '100%' }} onChange={handleRoundChange} value={issue.round}>
                    {dicts.issue_round?.map(d => (
                        <Option key={d.item_key} value={d.item_key}>{d.item_value}</Option>
                    ))}
                </Select>
            </Modal>

            <Modal title="修改所属系统" open={activeModal === 'system'} onCancel={() => setActiveModal(null)} footer={null}>
                <Select
                    showSearch
                    style={{ width: '100%' }}
                    placeholder="搜索系统"
                    optionFilterProp="children"
                    value={issue.system}
                    onChange={(val) => {
                        updateIssue({ system: val });
                        setActiveModal(null);
                    }}
                >
                    {dicts.system?.map(d => <Option key={d.item_key} value={d.item_key}>{d.item_value} ({d.item_key})</Option>)}
                </Select>
            </Modal>

            <Modal title="修改分类" open={activeModal === 'category'} onCancel={() => setActiveModal(null)} footer={[<Button key="ok" type="primary" onClick={() => setActiveModal(null)}>完成</Button>]}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <div style={{ marginBottom: 4, fontWeight: 'bold' }}>问题分类</div>
                        <Select style={{ width: '100%' }} onChange={(val) => handleCategoryChange('category', val)} value={issue.category}>
                            {dicts.issue_category?.map(d => <Option key={d.item_key} value={d.item_key}>{d.item_value}</Option>)}
                        </Select>
                    </div>
                    <div>
                        <div style={{ marginBottom: 4, fontWeight: 'bold' }}>详细分类</div>
                        <Select style={{ width: '100%' }} onChange={(val: string) => handleCategoryChange('detailed_classification', val)} value={issue.detailed_classification}>
                            {dicts.issue_detailed_classification?.map(d => <Option key={d.item_key} value={d.item_key}>{d.item_value}</Option>)}
                        </Select>
                    </div>
                </div>
            </Modal>

            <Modal title="修改人员信息" open={activeModal === 'people'} onCancel={() => setActiveModal(null)} onOk={savePeople}>
                <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 4 }}>姓名</div>
                    <AutoComplete
                        style={{ width: '100%' }}
                        value={tempPeople.name}
                        onSearch={searchUser}
                        onSelect={(val, opt: any) => {
                            if (opt?.data) {
                                setTempPeople({
                                    name: opt.data.real_name,
                                    org: opt.data.organization,
                                    contact: opt.data.contact
                                });
                            }
                        }}
                        onChange={(val) => setTempPeople(prev => ({ ...prev, name: val }))}
                        options={userSearchResults.map(u => ({
                            label: `${u.real_name} - ${resolveDict('organization', u.organization)} - ${u.contact}`,
                            value: u.username,
                            data: u
                        }))}
                        placeholder="输入姓名"
                    />
                </div>
                <div style={{ marginBottom: 12 }}>
                    <div style={{ marginBottom: 4 }}>机构</div>
                    <AutoComplete
                        style={{ width: '100%' }}
                        value={tempPeople.org}
                        onChange={(val) => setTempPeople({ ...tempPeople, org: val })}
                        options={dicts.organization?.map(d => ({ label: d.item_value, value: d.item_key }))}
                        filterOption={(inputValue, option) =>
                            String(option?.label || '').toUpperCase().indexOf(inputValue.toUpperCase()) !== -1 ||
                            String(option?.value || '').toUpperCase().indexOf(inputValue.toUpperCase()) !== -1
                        }
                        placeholder="搜索或输入机构"
                    />
                </div>
                <div>
                    <div style={{ marginBottom: 4 }}>电话</div>
                    <Input value={tempPeople.contact} onChange={e => setTempPeople({ ...tempPeople, contact: e.target.value })} />
                </div>
            </Modal>

            <Modal title="修改概述" open={activeModal === 'summary'} onCancel={() => setActiveModal(null)} onOk={() => { updateIssue({ summary: tempText }); setActiveModal(null); }}>
                <TextArea rows={4} value={tempText} onChange={e => setTempText(e.target.value)} />
            </Modal>

            <Modal title="修改详细描述" open={activeModal === 'desc'} onCancel={() => setActiveModal(null)} onOk={() => { updateIssue({ details: tempText }); setActiveModal(null); }}>
                <TextArea rows={8} value={tempText} onChange={e => setTempText(e.target.value)} />
            </Modal>

            <Modal title="修改分析记录" open={activeModal === 'editLog'} onCancel={() => setActiveModal(null)} onOk={handleUpdateLog}>
                <TextArea rows={4} value={tempText} onChange={e => setTempText(e.target.value)} />
            </Modal>

            <Modal title="修改问题原因" open={activeModal === 'root_cause'} onCancel={() => setActiveModal(null)} onOk={() => { updateIssue({ root_cause: tempText } as any); setActiveModal(null); }}>
                <TextArea rows={6} value={tempText} onChange={e => setTempText(e.target.value)} />
            </Modal>

            <Modal title="修改问题解决方案" open={activeModal === 'solution'} onCancel={() => setActiveModal(null)} onOk={() => { updateIssue({ solution: tempText } as any); setActiveModal(null); }}>
                <TextArea rows={6} value={tempText} onChange={e => setTempText(e.target.value)} />
            </Modal>

            <Modal
                title="修改计划解决时间"
                open={planFixTimeModalVisible}
                onOk={() => {
                    updateIssue({ plan_fix_time: tempPlanFixTime ? tempPlanFixTime.format('YYYY-MM-DD HH:mm:ss') : null });
                    setPlanFixTimeModalVisible(false);
                }}
                onCancel={() => setPlanFixTimeModalVisible(false)}
            >
                <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                    <DatePicker
                        value={tempPlanFixTime}
                        onChange={(val) => setTempPlanFixTime(val)}
                        style={{ width: '100%' }}
                        format="YYYY.M.D"
                    />
                </div>
            </Modal>

            <Modal title="修改紧急程度" open={activeModal === 'urgency'} onCancel={() => setActiveModal(null)} footer={null}>
                <Select
                    style={{ width: '100%' }}
                    value={issue.urgency || '中'}
                    onChange={(val) => {
                        updateIssue({ urgency: val });
                        setActiveModal(null);
                    }}
                >
                    {dicts.issue_urgency?.map(d => (
                        <Option key={d.item_key} value={d.item_key}>{d.item_value}</Option>
                    ))}
                </Select>
            </Modal>

            <Modal
                title="修改版本编号"
                open={activeModal === 'version_number'}
                onOk={() => {
                    updateIssue({ version_number: tempText });
                    setActiveModal(null);
                }}
                onCancel={() => setActiveModal(null)}
            >
                <Input
                    placeholder="请输入版本编号"
                    value={tempText}
                    onChange={e => setTempText(e.target.value)}
                    onPressEnter={() => {
                        updateIssue({ version_number: tempText });
                        setActiveModal(null);
                    }}
                />
            </Modal>

            <Modal title="修改处理方式" open={activeModal === 'handling_method'} onCancel={() => setActiveModal(null)} footer={null}>
                <Select
                    style={{ width: '100%' }}
                    value={issue.handling_method || '其它'}
                    onChange={(val) => {
                        updateIssue({ handling_method: val });
                        setActiveModal(null);
                    }}
                >
                    {dicts.issue_handling_method?.map(d => (
                        <Option key={d.item_key} value={d.item_key}>{d.item_value}</Option>
                    ))}
                </Select>
            </Modal>

            <Modal
                title="修改发版情况"
                open={activeModal === 'release_status'}
                onOk={() => {
                    if (tempText.length > 10) {
                        messageApi.error('当前已输入' + tempText.length + '个字，发版情况不能超过10个汉字');
                        return;
                    }
                    updateIssue({ release_status: tempText });
                    setActiveModal(null);
                }}
                onCancel={() => setActiveModal(null)}
            >
                <div style={{ marginBottom: 8, color: '#94a3b8', fontSize: '12px' }}>发版情况 (最长10个字，如：摆渡中、已摆渡)</div>
                <Input
                    placeholder="请输入发版情况"
                    value={tempText}
                    onChange={e => setTempText(e.target.value)}
                    maxLength={10}
                    onPressEnter={() => {
                        if (tempText.length <= 10) {
                            updateIssue({ release_status: tempText });
                            setActiveModal(null);
                        }
                    }}
                />
            </Modal>
            
            <Modal
                title="修改工单编号"
                open={activeModal === 'work_order_no'}
                onOk={() => {
                    updateIssue({ work_order_no: tempText });
                    setActiveModal(null);
                }}
                onCancel={() => setActiveModal(null)}
            >
                <Input
                    placeholder="请输入工单编号"
                    value={tempText}
                    onChange={e => setTempText(e.target.value)}
                    maxLength={30}
                    onPressEnter={() => {
                        updateIssue({ work_order_no: tempText });
                        setActiveModal(null);
                    }}
                />
            </Modal>

            <Modal title="管理关联案例" open={activeModal === 'cases'} onCancel={() => setActiveModal(null)} footer={null} width={600}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <Input
                        placeholder="输入案例名称或ID搜索"
                        value={caseSearchKeyword}
                        onChange={e => setCaseSearchKeyword(e.target.value)}
                        onPressEnter={() => searchCases()}
                    />
                    <Button type="primary" icon={<SearchOutlined />} onClick={() => searchCases()} loading={searchingCases}>搜索</Button>
                </div>

                {caseSearchResults.length > 0 && (
                    <div style={{ marginBottom: 16, border: '1px solid #e2e8f0', borderRadius: 4, padding: 8 }}>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>搜索结果:</div>
                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                            {caseSearchResults.map((item) => (
                                <div key={item.case_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                                    <div>
                                        <div style={{ fontSize: 12 }}>{item.scenario} ({item.case_id})</div>
                                        <div style={{ fontSize: 10, color: '#94a3b8' }}>{item.system}</div>
                                    </div>
                                    <Button type="link" size="small" onClick={() => addLinkedCase(item)}>添加</Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 8 }}>已关联案例 ({issue.linked_cases?.length || 0})</div>
                    <div style={{ border: '1px solid #f0f0f0', borderRadius: 4, maxHeight: 300, overflowY: 'auto' }}>
                        {(issue.linked_cases || []).length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无关联案例" style={{ padding: '16px 0' }} />
                        ) : (
                            (issue.linked_cases || []).map((lc: any) => (
                                <div key={lc.case_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: '1px solid #f0f0f0' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 12 }}>{lc.case_name}</span>
                                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{lc.case_id}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: 4 }}>
                                        <Button type="link" size="small" onClick={() => fetchCaseDetail(lc.case_id)}>查看</Button>
                                        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeLinkedCase(lc.case_id)} />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </Modal>

            <Drawer
                title="案例详情"
                placement="right"
                size="large"
                onClose={() => setCaseDrawerVisible(false)}
                open={caseDrawerVisible}
            >
                {viewingCase && (
                    <Descriptions bordered column={1} size="small">
                        <Descriptions.Item label="案例编号">{viewingCase.case_id}</Descriptions.Item>
                        <Descriptions.Item label="场景名称"><strong>{viewingCase.scenario}</strong></Descriptions.Item>
                        <Descriptions.Item label="所属系统">{viewingCase.system}</Descriptions.Item>
                        <Descriptions.Item label="所属板块">{viewingCase.module}</Descriptions.Item>
                        <Descriptions.Item label="操作步骤">
                            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, fontSize: 12 }}>{viewingCase.steps}</pre>
                        </Descriptions.Item>
                        <Descriptions.Item label="数据准备">{viewingCase.data_setup}</Descriptions.Item>
                        <Descriptions.Item label="案例状态">
                            <Tag>{viewingCase.case_status || '未知'}</Tag>
                        </Descriptions.Item>
                        <Descriptions.Item label="维护人">{viewingCase.author}</Descriptions.Item>
                    </Descriptions>
                )}
            </Drawer>

            <Modal
                title={<div style={{ fontSize: 14, fontWeight: 'bold', fontFamily: '"Microsoft YaHei", "微软雅黑", sans-serif' }}>问题操作历史</div>}
                open={historyModalVisible}
                onCancel={() => setHistoryModalVisible(false)}
                footer={null}
                width={750}
                centered
                destroyOnHidden={true}
            >
                <div className={styles.historyTableContainer}>
                    <div className={styles.hideOnMobile}>
                        <Table
                            dataSource={historyData}
                            rowKey="id"
                            size="small"
                            pagination={{ pageSize: 10, size: 'small', hideOnSinglePage: true }}
                            columns={[
                                {
                                    title: '时间',
                                    dataIndex: 'operation_time',
                                    key: 'operation_time',
                                    width: 110,
                                    align: 'center',
                                    render: (text) => <span className={styles.historyTime}>{dayjs(text).format('YYYY.M.D HH:mm')}</span>
                                },
                                {
                                    title: '用户',
                                    dataIndex: 'operator_name',
                                    key: 'operator_name',
                                    width: 160,
                                    align: 'center',
                                    render: (text) => <span className={styles.historyUser}>{text}</span>
                                },
                                {
                                    title: '操作记录',
                                    dataIndex: 'content',
                                    key: 'content',
                                    render: (text) => <span className={styles.historyContent}>{text}</span>
                                }
                            ]}
                        />
                    </div>
                    <div className={styles.showOnMobile}>
                        <Table
                            dataSource={historyData}
                            rowKey={(item: any) => item.operation_time + item.operator_name}
                            showHeader={false}
                            size="small"
                            pagination={{ pageSize: 10, size: 'small', hideOnSinglePage: true, simple: true }}
                            columns={[{
                                key: 'content',
                                render: (_, item: any) => (
                                    <div className={styles.historyMobileCard}>
                                        <div className={styles.historyCardHeader}>
                                            <span className={styles.historyUser}>{item.operator_name}</span>
                                            <span className={styles.historyTime}>{dayjs(item.operation_time).format('YYYY.M.D HH:mm')}</span>
                                        </div>
                                        <div className={styles.historyCardContent}>{item.content}</div>
                                    </div>
                                )
                            }]}
                        />
                    </div>
                </div>
            </Modal>
        </div>
    );
}

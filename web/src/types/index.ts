/**
 * @file index.ts
 * @description PAMS 系统通用 TypeScript 类型与数据结构声明文件
 * @author hengguan
 * @date 2026-05-20
 */

// ==========================================================
// 1. 基础类型定义与枚举定义
// ==========================================================

/**
 * 用户角色类型 (变为泛化字符串以支持从字典动态加载，但保留系统内置角色组合)
 * 常见角色包括: SUPER_ADMIN (超级管理员), ADMIN (管理员), ISSUE_MANAGER (问题管理人员), 
 * JK_BIZ (金科业务人员), NX_BIZ (农信业务人员), JK_TECH (金科技术人员), NX_TECH (农信技术人员)
 */
export type UserRole = string;

/**
 * 用户账号状态枚举
 * - 'ENABLE': 启用状态，允许登录和操作系统
 * - 'DISABLE': 禁用状态，禁止登录系统
 */
export type UserStatus = 'ENABLE' | 'DISABLE';

/**
 * 问题状态枚举
 * 标识一个问题在其生命周期中所处的状态：
 * - '提出': 刚上报的问题
 * - '已查明原因': 技术或业务人员已经定位到了根本原因
 * - '处理中': 修复方案实施中或代码编写中
 * - '待验证': 修复完成，等待测试或提出人进行验证
 * - '重现': 验证不通过，问题再次触发
 * - '已解决': 验证通过，问题关闭归档
 */
export type IssueStatus = '提出' | '已查明原因' | '处理中' | '待验证' | '重现' | '已解决';

/**
 * 问题一级分类 (从数据字典动态获取)
 * 例如：金科技术、农信技术、农信业务、无效案例等
 */
export type IssueCategory = string;

// ==========================================================
// 2. 核心业务实体接口 (Entities)
// ==========================================================

/**
 * 用户实体接口
 * 对应数据库 `sys_user` 表
 */
export interface User {
    user_id: string;        // 用户唯一ID (如 U2026001)
    username: string;       // 登录用户名 (唯一)
    password?: string;      // 登录密码 (仅后端查询/修改时使用，前端传输时通常排除)
    real_name: string;      // 真实姓名
    role: UserRole;         // 用户角色代码
    organization: string;   // 所属机构/部门
    contact: string;        // 联系电话/方式
    status: UserStatus;     // 账户状态 (启用/禁用)
    created_at: string;     // 创建时间 (ISO 字符串/数据库时间字符串)
}

/**
 * 问题分析日志条目接口
 * 用于记录问题流转过程中的技术分析、处理进展记录
 */
export interface AnalysisLogEntry {
    handler_name: string;    // 分析/处理人姓名
    handler_org?: string;    // 分析/处理人所属机构
    handler_contact: string; // 分析/处理人联系方式
    time: string;            // 记录时间 (北京时间字符串)
    content: string;         // 分析内容/日志描述
}

/**
 * 问题(故障)实体接口
 * 对应数据库 `biz_issue` 表，记录投产期或演练期发生的问题
 */
export interface Issue {
    issue_id: string;                  // 问题唯一编号 (如 NX20260520001)
    create_time: string;               // 问题创建/上报时间
    status: IssueStatus;               // 当前状态
    category: IssueCategory | null;    // 一级分类 (如 金科技术)
    detailed_classification: string | null; // 详细二级分类 (如 金科-程序代码)
    round: string | null;              // 问题发现轮次 (如 第一轮/第二轮)
    summary: string;                   // 问题概述/简短总结
    details: string;                   // 详细描述/异常堆栈
    attachments: string[];             // 用户上传的图片附件 URL 数组 (数据库存 JSON 字符串)
    analysis_log: AnalysisLogEntry[];   // 处理/分析轨迹日志数组 (数据库存 JSON 字符串)

    // 跟踪人信息 (原提出人/录入人)
    tracker_name: string;              // 跟踪人姓名
    tracker_org: string;               // 跟踪人所属机构
    tracker_contact: string;           // 跟踪人联系电话

    // 报障人信息 (真实在现场/系统发现故障的人，支持游客录入)
    reporter_name: string | null;      // 报障人姓名
    reporter_org: string | null;       // 报障人所属机构
    reporter_contact: string | null;   // 报障人联系电话

    // 处理人信息 (当前指派去排查/修复问题的技术人员)
    handler_name: string | null;       // 处理人姓名
    handler_org: string | null;        // 处理人所属机构
    handler_contact: string | null;    // 处理人联系方式

    // 关联的测试案例列表
    linked_cases: { case_id: string; case_name: string }[]; // 关联的 Case ID 与 Case 场景名称列表

    module: string | null;             // 关联的功能模块
    system: string | null;             // 关联的物理子系统 (如 CBS)
    business_group: string | null;     // 关联的实施区域/事业群 (如 北京, 上海)

    // 分析结论与修复结论
    is_major: boolean;                 // 是否为重大问题 (0: 否, 1: 是)
    is_common: boolean;                // 是否为共性/典型问题 (0: 否, 1: 是)
    root_cause: string | null;         // 根本原因分析
    solution: string | null;           // 解决方案/应急处置步骤
    plan_fix_time: string | null;      // 计划修复时间
    resolve_time: string | null;       // 实际解决/验证通过时间

    tags: string[];                    // 问题标签数组 (如 柜员共性问题, 项目组共性问题)
    urgency?: string | null;           // 紧急程度 (高、中、低)
    handling_method?: string | null;   // 处理方式 (换版、修数、调参、解释、其它)
    version_number?: string | null;    // 问题修复将要在哪个版本发布 (版本号)
    release_status?: string | null;    // 版本的发版状态/部署情况 (如 已换版、未换版等)
    work_order_no?: string | null;     // 关联的外部 ITSM 工单号/任务单号
    business_ticket_id?: string | null; // 关联的外部业务工单 ID
    bt_jinke_initial_feedback?: string | null; // 金科初步反馈意见
    bt_next_step_processing?: string | null;  // 下一步处理
    bt_is_problem_resolved?: string | null;   // 问题是否解决
    bt_remarks?: string | null;               // 备注（问题解决反馈备注）
    bt_is_disputed?: string | null;           // 是否争议
    bt_is_demand_closed?: string | null;      // 需求是否关闭
}

/**
 * 测试案例(Case)实体接口
 * 对应数据库 `biz_case` 表，支持多次执行以及导入导出
 */
export interface Case {
    id: number;                         // 数据库自增主键 (允许 case_id 重复以跟踪多轮测试)
    case_id: string;                    // 测试案例编号 (非唯一，支持非数字/重复ID管理)
    case_type: string | null;           // 案例类型
    stage: string | null;               // 阶段
    department: string | null;          // 责任部门
    module: string | null;              // 功能板块
    team: string | null;                // 团队
    channel: string | null;             // 交易渠道
    business_group: string | null;      // 所属事业群/分行
    system: string | null;              // 涉及系统
    is_external: number | null;         // 是否外联系统交易 (0: 否, 1: 是)
    ext_channel: string | null;         // 外联渠道
    user_role: string | null;           // 测试角色
    scenario: string | null;            // 场景名称
    scenario_type: string | null;       // 场景分类
    peripherals: string | null;         // 外设要求
    media: string | null;               // 测试介质
    vouchers: string | null;            // 凭证要求
    is_financial: boolean;              // 是否为涉账交易 (0: 否, 1: 是)
    steps: string | null;               // 案例操作步骤说明
    data_setup: string | null;          // 数据准备说明
    author: string | null;              // 案例编写作者
    author_contact: string | null;      // 编写作者联系电话
    executor_org: string | null;        // 预定执行机构
    executor_name: string | null;       // 预定执行人
    executor_contact: string | null;    // 预定执行人联系电话
    project_executor_name: string | null; // 投产项目实际执行人
    project_executor_contact: string | null; // 投产项目实际执行人电话
    case_status: string | null;         // 案例级别执行状态 (如 成功, 失败, 阻碍, 未执行)
    case_status_remark: string | null;  // 案例执行状态备注
    project_status: string | null;      // 项目/投产级别执行状态
    project_status_remark: string | null; // 项目执行状态备注
    remarks: string | null;             // 备注信息
    related_issues?: string[];          // 动态关联的问题编号列表 (由关联查询得出)
    created_at: string;                 // 创建/导入时间
}

// ==========================================================
// 3. 认证、API交互与辅助工具类型
// ==========================================================

/**
 * JWT 解密后及保存在 Cookie 中的 Payload 载荷接口
 */
export interface JWTPayload {
    user_id: string;        // 用户ID
    username: string;       // 用户名
    real_name: string;      // 真实姓名
    role: UserRole;         // 角色
    role_name?: string;     // 动态解析出的角色中文名 (供 UI 显示)
    organization: string;   // 所属机构
    contact: string;        // 联系电话
    home?: string;          // 角色默认主页路径
}

/**
 * 统一的 API JSON 响应体结构
 */
export interface ApiResponse<T = unknown> {
    success: boolean;       // 请求是否成功 (true/false)
    data?: T;               // 成功时返回的数据载荷
    error?: string;         // 失败时返回的错误信息/码
    message?: string;       // 提示信息
}

/**
 * API 查询分页参数
 */
export interface PaginationParams {
    page: number;           // 当前页码 (从 1 开始)
    pageSize: number;       // 每页条数
}

/**
 * 统一的分页响应包装体
 */
export interface PaginatedResponse<T> {
    items: T[];             // 当前页的数据记录列表
    total: number;          // 满足查询条件的总条数
    page: number;           // 当前页码
    pageSize: number;       // 每页大小
    totalPages: number;     // 总页数
}

/**
 * 统计看板数据项通用结构
 */
export interface StatItem {
    name: string;           // 维度名称 (如 "提出", "处理中")
    value: number;          // 数量/统计数值
}

// ==========================================================
// 4. 系统兜底常量与字典声明 (部分硬编码配置作为保底)
// ==========================================================

/**
 * 系统内置角色名称映射表 (仅作为前端显示时的保底方案，系统推荐通过数据字典加载角色)
 */
export const RoleNameMap: Record<string, string> = {
    'SUPER_ADMIN': '超级管理员',
    'ADMIN': '管理员',
    'ISSUE_MANAGER': '问题管理人员',
    'PENDING': '待审核',
    'JK_BIZ': '金科业务人员',
    'NX_BIZ': '农信业务人员',
    'JK_TECH': '金科技术人员',
    'NX_TECH': '农信技术人员',
};

/**
 * 系统内置角色的标签颜色配置表 (Ant Design Tag 颜色，系统推荐根据字典自动生成 Hash 颜色)
 */
export const RoleColorMap: Record<string, string> = {
    'SUPER_ADMIN': 'volcano',
    'ADMIN': 'red',
    'ISSUE_MANAGER': 'geekblue',
    'PENDING': 'orange',
    'JK_BIZ': 'blue',
    'NX_BIZ': 'cyan',
    'JK_TECH': 'green',
    'NX_TECH': 'purple',
};

/**
 * 系统内置角色的登录后默认跳转主页 (保底方案)
 */
export const DefaultPathMap: Record<string, string> = {
    'SUPER_ADMIN': '/dashboard',
    'ADMIN': '/dashboard',
    'ISSUE_MANAGER': '/dashboard',
    'NX_BIZ': '/report',
    'NX_TECH': '/my-issues',
    'JK_TECH': '/my-issues',
    'JK_BIZ': '/cases',
    'PENDING': '/pending',
};

/**
 * 问题状态名称映射表 (保底)
 */
export const StatusNameMap: Record<IssueStatus, string> = {
    '提出': '提出',
    '已查明原因': '已查明原因',
    '处理中': '处理中',
    '待验证': '待验证',
    '重现': '重现',
    '已解决': '已解决',
};

// ==========================================================
// 5. 数据字典核心接口
// ==========================================================

/**
 * 字典明细数据项模型
 * 对应数据库 `sys_dict` 表，用于系统下拉选项的动态化管理
 */
export interface DictItem {
    dict_id: number;           // 字典条目唯一主键
    dict_code: string;         // 字典分类编码 (如 issue_status)
    item_key: string;          // 字典项键 (存入数据库业务表的真实值，如 "提出")
    item_value: string;        // 字典项值 (在 UI 界面显示的中文文本，如 "已提出")
    parent_key?: string;       // 级联字典父节点键 (扩展字段，备用)
    sort_order: number;        // 下拉列表中的排序权重 (从小到大)
    description?: string;      // 描述或额外属性 (如 user_role 字典的 JSON 字符串配置 `{"home": "/dashboard"}`)
    is_system: number;         // 是否系统预设 (1: 是，禁止前台删除；0: 否)
    is_default_val?: number;   // 是否为该分类下的默认选中值 (1: 是, 0: 否)
}

/**
 * 系统支持的字典大类分类编码
 */
export type DictCode =
    | 'issue_status'                  // 问题状态 (提出, 处理中, 已解决 等)
    | 'issue_category'                // 问题一级大类 (金科技术, 农信业务 等)
    | 'issue_detailed_classification' // 问题二级细分类型 (金科-程序代码, 农信-操作理解 等)
    | 'issue_round'                   // 问题演练轮次 (第一轮, 第二轮 等)
    | 'issue_tag'                     // 问题标签 (项目组共性问题 等)
    | 'business_group'                // 实施物理区域/分行事业群 (北京, 上海 等)
    | 'module'                        // 业务功能板块 (核心系统, 信贷系统 等)
    | 'system'                        // 具体关联的子系统 (CBS, MBS 等)
    | 'organization'                  // 机构/部门
    | 'user_role'                     // 用户角色定义 (超级管理员, 金科技术等)
    | 'issue_urgency'                 // 问题紧急程度 (高, 中, 低)
    | 'issue_handling_method';        // 问题修复处置方式 (换版, 修数, 调参, 解释 等)

/**
 * 业务工单实体接口
 * 对应数据库 `biz_business_ticket` 表
 */
export interface BusinessTicket {
    id: string; // 唯一ID
    seq_no: string | null; // 序号
    problem_register_date: string | null; // 问题登记日期
    problem_source: string | null; // 问题来源
    ticket_no: string | null; // 问题编号（工单编号）
    delivery_section: string | null; // 交付件所属板块
    subsystem: string | null; // 物理子系统/组件
    province_assoc_dept: string | null; // 省联社主责部门
    jinke_group: string | null; // 金科事业群/农信科中心
    problem_description: string | null; // 问题描述
    attachments: string | null; // 附件/图片
    jinke_initial_feedback: string | null; // 金科初步反馈意见
    register_time: string | null; // 登记时间
    issue_control_no: string | null; // 问题管控工具编号（金科用,如需）
    issue_control_status: string | null; // 问题管控工具状态（金科用,如需）
    issue_control_close_time: string | null; // 问题管控关闭时间（金科用,如需）
    reporter_dept_contact: string | null; // 问题提出部门/板块联系人
    reporter_contact_info: string | null; // 提出人联系方式
    jinke_contact_phone: string | null; // 金科联系人及电话
    operation_instruction_reason: string | null; // 操作说明原因（如需）
    next_step_processing: string | null; // 下一步处理
    estimated_or_completed_time: string | null; // 预计完成/完成时间
    is_problem_resolved: string | null; // 问题是否解决
    remarks: string | null; // 备注（问题解决反馈备注）
    is_disputed: string | null; // 是否争议
    both_parties_schedule: string | null; // 双方排期
    dispute_over_2_weeks: string | null; // 争议是否已超过2周
    meeting_minutes: string | null; // 会议纪要
    is_undertaken: string | null; // 是否承接
    is_converted_to_problem: string | null; // 是否转为问题
    is_submitted_to_province_assoc: string | null; // 是否提交省联社
    undertaken_req_tool_no: string | null; // 承接需求问工具编号（金科用，如需）
    demand_remarks: string | null; // 需求备注
    current_handler: string | null; // 当前处理人/处理方
    current_status: string | null; // 当前状态
    expected_complete_time: string | null; // 预计完成/完成时间（如需YYMMDD）
    is_demand_closed: string | null; // 需求是否关闭
    created_at: string;
    updated_at: string;
    is_linked?: number; // 关联问题状态
}


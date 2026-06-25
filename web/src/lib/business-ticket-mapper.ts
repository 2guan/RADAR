/**
 * @file business-ticket-mapper.ts
 * @description PAMS 系统业务工单 Excel/CSV 报表导入时映射表字段与中英文标签配置定义文件
 * @author hengguan
 * @date 2026-06-08
 */

export const BUSINESS_TICKET_COLUMNS = [
    { key: 'seq_no', label: '序号' },
    { key: 'problem_register_date', label: '问题登记日期' },
    { key: 'problem_source', label: '问题来源' },
    { key: 'ticket_no', label: '问题编号（工单编号）' },
    { key: 'delivery_section', label: '交付件所属板块' },
    { key: 'subsystem', label: '物理子系统/组件' },
    { key: 'province_assoc_dept', label: '省联社主责部门' },
    { key: 'jinke_group', label: '金科事业群/农信科中心' },
    { key: 'problem_description', label: '问题描述' },
    { key: 'attachments', label: '附件/图片' },
    { key: 'jinke_initial_feedback', label: '金科初步反馈意见' },
    { key: 'register_time', label: '登记时间' },
    { key: 'issue_control_no', label: '问题管控工具编号（金科用,如需）' },
    { key: 'issue_control_status', label: '问题管控工具状态（金科用,如需）' },
    { key: 'issue_control_close_time', label: '问题管控关闭时间（金科用,如需）' },
    { key: 'reporter_dept_contact', label: '问题提出部门/板块联系人' },
    { key: 'reporter_contact_info', label: '提出人联系方式' },
    { key: 'jinke_contact_phone', label: '金科联系人及电话' },
    { key: 'operation_instruction_reason', label: '操作说明原因（如需）' },
    { key: 'next_step_processing', label: '下一步处理' },
    { key: 'estimated_or_completed_time', label: '预计完成/完成时间' },
    { key: 'is_problem_resolved', label: '问题是否解决' },
    { key: 'remarks', label: '备注（问题解决反馈备注）' },
    { key: 'is_disputed', label: '是否争议' },
    { key: 'both_parties_schedule', label: '双方排期' },
    { key: 'dispute_over_2_weeks', label: '争议是否已超过2周' },
    { key: 'meeting_minutes', label: '会议纪要' },
    { key: 'is_undertaken', label: '是否承接' },
    { key: 'is_converted_to_problem', label: '是否转为问题' },
    { key: 'is_submitted_to_province_assoc', label: '是否提交省联社' },
    { key: 'undertaken_req_tool_no', label: '承接需求问工具编号（金科用，如需）' },
    { key: 'demand_remarks', label: '需求备注' },
    { key: 'current_handler', label: '当前处理人/处理方' },
    { key: 'current_status', label: '当前状态' },
    { key: 'expected_complete_time', label: '预计完成/完成时间（如需YYMMDD）' },
    { key: 'is_demand_closed', label: '需求是否关闭' }
];

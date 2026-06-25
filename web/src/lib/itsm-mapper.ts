/**
 * @file itsm-mapper.ts
 * @description PAMS 系统 ITSM 工单 Excel/CSV 报表导入时映射表字段与中英文标签配置定义文件
 * @author hengguan
 * @date 2026-05-20
 */

/**
 * ITSM 系统导出的原始 Excel 表格列头字段映射配置数组
 * 用于将上传的 Excel/CSV 文件中的中文表头自动匹配识别并转化为数据库对应的业务英文字段
 */
export const ITSM_COLUMNS = [
    { key: 'processing_time', label: '处理时长' },
    { key: 'ticket_name', label: '工单名称' },
    { key: 'ticket_no', label: '工单编号' },
    { key: 'ticket_status', label: '工单状态' },
    { key: 'current_step', label: '当前环节' },
    { key: 'current_handler', label: '当前处理人' },
    { key: 'ticket_type', label: '工单类型' },
    { key: 'creation_time', label: '创建时间' },
    { key: 'creator', label: '创建人' },
    { key: 'last_update_time', label: '最后更新时间' },
    { key: 'id', label: 'id' },
    { key: 'title', label: '标题' },
    { key: 'detail', label: '详述' },
    { key: 'creator_alt', label: '创建人' },
    { key: 'creator_dept', label: '创建单位（部门）' },
    { key: 'creator_contact', label: '建单人联系方式' },
    { key: 'org_code', label: '机构码' },
    { key: 'trans_code', label: '交易码' },
    { key: 'app_system', label: '应用系统' },
    { key: 'is_system_error', label: '是否系统报错引起' },
    { key: 'images', label: '上传图片' },
    { key: 'history_record', label: '历史处置过程记录' },
    { key: 'is_trigger_other', label: '是否引发其他工单' },
    { key: 'occurrence_time', label: '发生时间' },
    { key: 'acceptance_time', label: '受理时间' },
    { key: 'resolve_time', label: '解决时间' },
    { key: 'solution', label: '解决方案' },
    { key: 'resolve_group', label: '解决组' },
    { key: 'resolver', label: '解决人' },
    { key: 'attachment', label: '附件' },
    { key: 'close_status', label: '关闭状态' },
    { key: 'satisfaction_score', label: '满意度得分' },
    { key: 'satisfaction_desc', label: '满意度说明' }
];

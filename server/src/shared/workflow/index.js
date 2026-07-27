/**
 * 文件：server/src/shared/workflow/index.js
 * 说明：仅导出不访问数据库、无模块归属的流程值对象与纯规则。
 * 用途：跨业务模块共同维护的流程基础契约入口。
 * 作者：hengguan
 */

export { normalizeWorkflowStatusType } from './status.js';

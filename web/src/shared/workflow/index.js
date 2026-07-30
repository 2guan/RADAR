/**
 * 文件：web/src/shared/workflow/index.js
 * 说明：仅导出不拥有业务表、不直接请求业务接口的流程展示与布局能力。
 * 用途：前端共享流程基础能力公开入口。
 * 作者：hengguan
 */

export { default as StatusBadge, getStatusType, statusSelectWidth } from './StatusBadge.jsx';
export { default as TaskStatusBadge } from './TaskStatusBadge.jsx';
export { default as TaskEditor } from './TaskEditor.jsx';
export { buildStageSectionLayout } from './stageSectionLayout.js';

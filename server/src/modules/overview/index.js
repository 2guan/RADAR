/**
 * 文件：server/src/modules/overview/index.js
 * 说明：概览模块仅提供跨模块只读聚合，不拥有业务写入表。
 * 用途：概览模块公开契约入口。
 * 作者：hengguan
 */

export const overviewContract = Object.freeze({ name: 'overview', mode: 'read-only' });
export {
  TASK_STATUS_STAGE_ORDER, taskStatusNode, shortTaskStatusStage, buildTaskStatusChain, resolveCurrentTaskStatuses,
} from './application/task-status.js';

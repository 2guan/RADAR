/**
 * 文件：server/src/shared/workflow/status.js
 * 说明：归一化流程状态分类，不读取配置、数据库或业务模块。
 * 用途：为多个流程模块共享初始、进行中和终态的稳定分类值。
 * 作者：hengguan
 */

/** 将历史状态别名收敛为共享展示与校验使用的三类状态。 */
export function normalizeWorkflowStatusType(value) {
  if (value === 'final') return 'final';
  if (value === 'initial' || value === 'not-started') return 'initial';
  return 'in-progress';
}

/**
 * 文件：server/src/modules/dashboard/index.js
 * 说明：仪表盘模块负责指标与图表的只读聚合，业务写入仍归源模块所有。
 * 用途：仪表盘模块公开契约入口。
 * 作者：hengguan
 */

export {
  SOURCES, DIMENSIONS, CHART_TYPES, ANALYTICS_DIMENSIONS, ANALYTICS_STAGES,
  buildContext, aggregate, extract, matchFilters, isValidDim, testTypeOf,
} from './application/chart-dims.js';
export { MODULE_CONTRACT as dashboardContract } from './contracts/index.js';

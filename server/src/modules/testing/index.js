/**
 * 文件：server/src/modules/testing/index.js
 * 说明：测试任务复用开发模块公开的工作项读取与通用排期规则，不访问其内部实现。
 * 用途：测试模块的公开契约入口。
 * 作者：hengguan
 */

export {
  calcDeviation, formatCoverageText, generateTestTaskCode,
  getWorkItem, workItemCodesInReleasePoints, releaseDateMapForCodes,
} from '../development/index.js';

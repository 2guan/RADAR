/**
 * 文件：server/src/modules/overview/application/task-status.js
 * 说明：统一需求/工单全链路当前任务状态的阶段顺序和代表状态选择，供只读聚合与业务列表复用。
 * 用途：版本概览模块公开的只读生命周期状态契约；不拥有业务表，也不执行业务写入。
 * 作者：hengguan
 */

import { isTerminalStatus } from '../../settings/process-configuration/index.js';
import { listDevTaskStatuses } from '../../development/index.js';
import { listTestTaskStatuses } from '../../testing/index.js';
import { listReleaseTaskStatuses } from '../../release/index.js';

export const TASK_STATUS_STAGE_ORDER = Object.freeze([
  '需求/工单分析', '开发', '应用组装测试', '用户测试', '非功能测试', '安全测试', '投产审批',
]);

const SHORT_STAGE_LABEL = Object.freeze({
  开发: '开发', 应用组装测试: 'SIT', 用户测试: 'UAT', 非功能测试: 'NFT', 安全测试: 'SEC', 投产审批: '投产',
});

/** 将统一阶段名转换为紧凑展示名；首阶段按实际工作项类型区分需求与工单。 */
export function shortTaskStatusStage(stage, workItem = {}) {
  if (stage === '需求/工单分析') {
    const type = workItem.entity_type || workItem.entityType || workItem.workItemType;
    return type === 'ticket' || workItem.ticket_code ? '工单' : '需求';
  }
  if (stage === '需求分析') return '需求';
  if (stage === '工单分析') return '工单';
  return SHORT_STAGE_LABEL[stage] || stage;
}

/** 概览首阶段按工作项实体类型使用明确的展示文案，统计阶段名保持不变。 */
function analysisStageLabel(workItem = {}) {
  return shortTaskStatusStage('需求/工单分析', workItem) === '工单' ? '工单分析' : '需求分析';
}

/** 计算一个阶段的流程状态及其稳定代表状态。 */
export function taskStatusNode(tasks = []) {
  if (!tasks.length) return { state: 'pending', text: null, status: null };
  const allTerminal = tasks.every((task) => isTerminalStatus(task.status));
  const nonTerminal = tasks.find((task) => !isTerminalStatus(task.status));
  const status = nonTerminal ? nonTerminal.status : tasks.at(-1)?.status;
  return { state: allTerminal ? 'done' : 'doing', text: tasks.map((task) => task.status).join('、'), status };
}

/**
 * 构建一个工作项的全链路节点。
 * 可选测试只在实际存在任务时参与链路；SIT/UAT/投产节点始终保留以表达未开始状态。
 */
export function buildTaskStatusChain(workItem, devMap = {}, testMap = {}, releaseMap = {}, options = {}) {
  const code = workItem?.req_code || workItem?.ticket_code || workItem?.code;
  const tests = testMap[code] || {};
  const releaseTask = releaseMap[code];
  const analysisLabel = options.analysisLabel === 'entity' ? analysisStageLabel(workItem) : '需求/工单分析';
  const nodes = [
    { key: 'analysis', label: analysisLabel, ...taskStatusNode(workItem ? [{ status: workItem.status }] : []) },
    { key: 'dev', label: '开发', ...taskStatusNode(devMap[code] || []) },
    { key: 'SIT', label: '应用组装测试', ...taskStatusNode(tests.SIT || []) },
    { key: 'UAT', label: '用户测试', ...taskStatusNode(tests.UAT || []) },
  ];
  if ((tests.NFT || []).length) nodes.push({ key: 'NFT', label: '非功能测试', ...taskStatusNode(tests.NFT) });
  if ((tests.SEC || []).length) nodes.push({ key: 'SEC', label: '安全测试', ...taskStatusNode(tests.SEC) });
  nodes.push({ key: 'release', label: '投产审批', ...taskStatusNode(releaseTask ? [releaseTask] : []) });

  let current = nodes.find((node) => node.state === 'doing');
  if (!current) current = nodes.filter((node) => node.state === 'done').at(-1) || nodes[0];
  const status = current.status || '未开始';
  const shortStage = shortTaskStatusStage(current.label, workItem);
  return {
    nodes,
    stage: current.label,
    status,
    display: `${current.label}-${status}`,
    shortStage,
    shortDisplay: `${shortStage} · ${status}`,
  };
}

/** 以模块公开读取契约批量解析多个工作项的当前任务状态。 */
export async function resolveCurrentTaskStatuses(workItems = []) {
  const itemsByCode = new Map();
  for (const item of workItems) {
    const code = item?.req_code || item?.ticket_code || item?.code;
    if (code && !itemsByCode.has(code)) itemsByCode.set(code, item);
  }
  const codes = [...itemsByCode.keys()];
  if (!codes.length) return {};

  const [devMap, testMap, releaseMap] = await Promise.all([
    listDevTaskStatuses(codes), listTestTaskStatuses(codes), listReleaseTaskStatuses(codes),
  ]);
  return Object.fromEntries(codes.map((code) => [
    code,
    buildTaskStatusChain(itemsByCode.get(code), devMap, testMap, releaseMap),
  ]));
}

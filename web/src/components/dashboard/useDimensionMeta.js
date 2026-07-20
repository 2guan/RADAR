/**
 * 文件：components/dashboard/useDimensionMeta.js
 * 用途：分析图表的「维度元数据」hook。一次性预载字典/系统/投产点与各数据源维度，
 *       对外提供：数据源、图表类型、某源可用维度、维度选项、原始值→显示名 映射。
 * 作者：hengguan
 * 说明：维度取值随数据源变化，但 optionSource 与字典是源无关的，故显示名映射可全局复用。
 */

import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client.js';

// 需要预载的字典分类（覆盖所有 dict:* optionSource）
const DICT_CATS = ['process_status', 'req_type', 'ticket_type', 'org', 'sector'];

// 会话级缓存：元数据基本不变，缓存后再次进入仪表盘瞬时就绪，避免重复往返。
// 缓存 Promise（而非结果）以合并并发首载；失败时清空以便重试。
let metaCache = null;

/** 一次并发拉取并归一化全部维度元数据 */
async function fetchMeta() {
  // 维度(含 dimsBySource)/字典/系统/投产点彼此独立，单波并发即可（约 1 个往返）
  const [base, dictArr, systems, rps] = await Promise.all([
    apiGet('/dashboard/dimensions'),
    Promise.all(DICT_CATS.map((c) => apiGet(`/dict/by-category/${c}`).then((rows) => [c, rows || []]))),
    apiGet('/systems/all').then((r) => r || []),
    apiGet('/release-points/all').then((r) => r || []),
  ]);

  const sources = base.sources || [];
  const statDimensions = base.statDimensions || [];
  const statStages = base.statStages || [];
  const dimsBySource = base.dimsBySource || {};
  const dimByKey = {};
  for (const dims of Object.values(dimsBySource)) {
    for (const d of dims) dimByKey[d.key] = d;
  }

  const dictOptions = {}; const dictLabel = {};
  for (const [c, rows] of dictArr) {
    dictOptions[c] = rows.map((r) => ({ value: r.attr_value, label: r.display_value || r.attr_value }));
    dictLabel[c] = Object.fromEntries(rows.map((r) => [r.attr_value, r.display_value || r.attr_value]));
  }

  const systemList = systems.map((s) => ({ value: s.sys_code, label: s.sys_name }));
  const sysLabel = Object.fromEntries(systems.map((s) => [s.sys_code, s.sys_name]));

  const rpLabel = {};
  const rpList = rps.map((p) => {
    const label = `${p.release_date}${p.version_type ? ' ' + p.version_type : ''}`;
    rpLabel[String(p.id)] = label;
    return { value: String(p.id), label, searchLabel: label, releaseDate: p.release_date, versionType: p.version_type };
  });

  const stageList = [
    { value: '需求/工单分析', label: '需求/工单分析' },
    { value: '开发', label: '开发' },
    { value: '应用组装测试', label: '应用组装测试' },
    { value: '用户测试', label: '用户测试' },
    { value: '非功能测试', label: '非功能测试' },
    { value: '安全测试', label: '安全测试' },
    { value: '投产审批', label: '投产审批' },
  ];
  const stageLabel = Object.fromEntries(stageList.map((s) => [s.value, s.label]));

  const processStatusRows = dictArr.find(([c]) => c === 'process_status')?.[1] || [];
  const taskStatusList = [];
  processStatusRows.forEach((item) => taskStatusList.push({
    value: item.attr_value, label: item.display_value || item.attr_value, stage: item.extra?.stage,
  }));
  const taskStatusLabel = Object.fromEntries(taskStatusList.map((t) => [t.value, t.label]));

  return {
    sources, statDimensions, statStages, chartTypes: base.chartTypes || [], dimsBySource, dimByKey,
    dictOptions, dictLabel, systemList, sysLabel, rpList, rpLabel,
    stageList, stageLabel, taskStatusList, taskStatusLabel,
  };
}

const EMPTY_META = {
  sources: [], statDimensions: [], statStages: [], chartTypes: [], dimsBySource: {}, dimByKey: {},
  dictOptions: {}, dictLabel: {}, systemList: [], sysLabel: {}, rpList: [], rpLabel: {},
  stageList: [], stageLabel: {}, taskStatusList: [], taskStatusLabel: {},
};

export function useDimensionMeta() {
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState(EMPTY_META);

  useEffect(() => {
    let alive = true;
    if (!metaCache) {
      metaCache = fetchMeta().catch((e) => { metaCache = null; throw e; });
    }
    metaCache
      .then((m) => { if (alive) { setMeta(m); setReady(true); } })
      .catch(() => { /* 失败保持未就绪，下次进入会重试 */ });
    return () => { alive = false; };
  }, []);

  /** 某数据源的可用维度 [{key,label,optionSource,isDate}] */
  const dimsOf = (source) => meta.dimsBySource[source] || [];

  /** 维度元数据 */
  const dimMeta = (dim) => meta.dimByKey[dim];

  /** 维度的可选项（下拉/预设用）；时间/自由文本返回空数组（由 tags 输入） */
  const getOptions = (dim) => {
    const m = meta.dimByKey[dim];
    if (!m) return [];
    const os = m.optionSource || '';
    if (os.startsWith('dict:')) return meta.dictOptions[os.slice(5)] || [];
    if (os === 'system') return meta.systemList;
    if (os === 'release_point') return meta.rpList;
    if (os === 'stage') return meta.stageList;
    if (os === 'task_status') return meta.taskStatusList;
    if (os === 'implementation_type') return meta.statDimensions;
    if (os === 'work_item_type') return [...(meta.dictOptions.req_type || []), { value: '生产工单', label: '生产工单' }];
    return [];
  };

  /**
   * 分组“加载预设”专用选项。统计阶段已限定时，阶段状态仅加载该阶段可用的状态。
   * 需求/工单分析阶段再结合统计维度，避免把需求状态和工单状态混在一起。
   */
  const getPresetOptions = (dim, { statStage = 'all', statDimension = 'all' } = {}) => {
    if (dim !== 'stage_status' || statStage === 'all') return getOptions(dim);
    const stageMap = {
      analysis: statDimension === 'requirement' ? ['需求'] : (statDimension === 'ticket' ? ['工单'] : ['需求', '工单']),
      dev: ['开发'], sit: ['测试'], uat: ['测试'], nft: ['测试'], sec: ['测试'], release: ['投产'],
    };
    const stages = stageMap[statStage];
    if (!stages) return getOptions(dim);
    return meta.taskStatusList.filter((option) => stages.includes(option.stage));
  };

  /** 原始值 → 显示名 */
  const labelOf = (dim, raw) => {
    const m = meta.dimByKey[dim];
    if (!m || raw == null) return raw;
    const os = m.optionSource || '';
    if (os.startsWith('dict:')) return meta.dictLabel[os.slice(5)]?.[raw] || raw;
    if (os === 'system') return meta.sysLabel[raw] || raw;
    if (os === 'release_point') return meta.rpLabel[raw] || raw;
    if (os === 'stage') return meta.stageLabel[raw] || raw;
    if (os === 'task_status') return meta.taskStatusLabel[raw] || raw;
    if (os === 'implementation_type') return meta.statDimensions.find((x) => x.value === raw)?.label || raw;
    return raw;
  };

  return {
    ready, sources: meta.sources, statDimensions: meta.statDimensions, statStages: meta.statStages,
    chartTypes: meta.chartTypes, dimsOf, dimMeta, getOptions, getPresetOptions, labelOf,
  };
}

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
const DICT_CATS = ['process_status', 'req_type', 'org', 'sector'];

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
    { value: '需求', label: '需求' },
    { value: '开发', label: '开发' },
    { value: '应用组装', label: '应用组装' },
    { value: '非功能测试', label: '非功能测试' },
    { value: '安全测试', label: '安全测试' },
    { value: '用户测试', label: '用户测试' },
    { value: '投产', label: '投产' },
  ];
  const stageLabel = Object.fromEntries(stageList.map((s) => [s.value, s.label]));

  const processStatusRows = dictArr.find(([c]) => c === 'process_status')?.[1] || [];
  const taskStatusList = [];
  const stages = ['需求', '开发', '应用组装', '非功能测试', '安全测试', '用户测试', '投产'];
  stages.forEach((stg) => {
    taskStatusList.push({ value: `${stg}-未开始`, label: `${stg} - 未开始` });
  });
  processStatusRows.forEach((item) => {
    const stg = item.extra?.stage;
    const statusVal = item.attr_value;
    if (stg === '需求' || stg === '开发' || stg === '投产') {
      taskStatusList.push({ value: `${stg}-${statusVal}`, label: `${stg} - ${statusVal}` });
    } else if (stg === '测试') {
      taskStatusList.push({ value: `应用组装-${statusVal}`, label: `应用组装 - ${statusVal}` });
      taskStatusList.push({ value: `非功能测试-${statusVal}`, label: `非功能测试 - ${statusVal}` });
      taskStatusList.push({ value: `安全测试-${statusVal}`, label: `安全测试 - ${statusVal}` });
      taskStatusList.push({ value: `用户测试-${statusVal}`, label: `用户测试 - ${statusVal}` });
    }
  });
  const taskStatusLabel = Object.fromEntries(taskStatusList.map((t) => [t.value, t.label]));

  return {
    sources, chartTypes: base.chartTypes || [], dimsBySource, dimByKey,
    dictOptions, dictLabel, systemList, sysLabel, rpList, rpLabel,
    stageList, stageLabel, taskStatusList, taskStatusLabel,
  };
}

const EMPTY_META = {
  sources: [], chartTypes: [], dimsBySource: {}, dimByKey: {},
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
    return [];
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
    return raw;
  };

  return { ready, sources: meta.sources, chartTypes: meta.chartTypes, dimsOf, dimMeta, getOptions, labelOf };
}

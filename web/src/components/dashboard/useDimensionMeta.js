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

export function useDimensionMeta() {
  const [ready, setReady] = useState(false);
  const [meta, setMeta] = useState({
    sources: [], chartTypes: [], dimsBySource: {}, dimByKey: {},
    dictOptions: {}, dictLabel: {}, systemList: [], sysLabel: {}, rpList: [], rpLabel: {},
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      // 基础：数据源 + 图表类型
      const base = await apiGet('/dashboard/dimensions');
      const sources = base.sources || [];
      // 各源维度（并行）
      const dimsArr = await Promise.all(
        sources.map((s) => apiGet('/dashboard/dimensions', { source: s.value }).then((r) => [s.value, r.dimensions || []])),
      );
      const dimsBySource = {}; const dimByKey = {};
      for (const [src, dims] of dimsArr) {
        dimsBySource[src] = dims;
        for (const d of dims) dimByKey[d.key] = d;
      }
      // 字典
      const dictArr = await Promise.all(DICT_CATS.map((c) => apiGet(`/dict/by-category/${c}`).then((rows) => [c, rows || []])));
      const dictOptions = {}; const dictLabel = {};
      for (const [c, rows] of dictArr) {
        dictOptions[c] = rows.map((r) => ({ value: r.attr_value, label: r.display_value || r.attr_value }));
        dictLabel[c] = Object.fromEntries(rows.map((r) => [r.attr_value, r.display_value || r.attr_value]));
      }
      // 系统
      const systems = (await apiGet('/systems/all')) || [];
      const systemList = systems.map((s) => ({ value: s.sys_code, label: s.sys_name }));
      const sysLabel = Object.fromEntries(systems.map((s) => [s.sys_code, s.sys_name]));
      // 投产点
      const rps = (await apiGet('/release-points/all')) || [];
      const rpLabel = {}; const rpList = rps.map((p) => {
        const label = `${p.release_date}${p.version_type ? ' ' + p.version_type : ''}`;
        rpLabel[String(p.id)] = label;
        return { value: String(p.id), label };
      });

      if (!alive) return;
      setMeta({ sources, chartTypes: base.chartTypes || [], dimsBySource, dimByKey, dictOptions, dictLabel, systemList, sysLabel, rpList, rpLabel });
      setReady(true);
    })();
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
    return raw;
  };

  return { ready, sources: meta.sources, chartTypes: meta.chartTypes, dimsOf, dimMeta, getOptions, labelOf };
}

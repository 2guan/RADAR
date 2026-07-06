/**
 * 文件：components/ReleasePointText.jsx
 * 用途：统一渲染投产点文本、选项标签与投产点待定占位值。
 * 作者：hengguan
 */

import React from 'react';

export const PENDING_RELEASE_POINT = '投产点待定';

const NUMERIC_RELEASE_POINT_RE = /^\d+$/;
// 投产点日期与变更编号统一使用同一套等宽字体，保证数字在各列表/详情中对齐。
const RELEASE_POINT_NUMBER_FONT = 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace';

export function isNumericReleasePoint(value) {
  return NUMERIC_RELEASE_POINT_RE.test(String(value || ''));
}

// 投产点标签可按场景附带版本类型，供列表、筛选与搜索复用。
export function releasePointLabelText(point, { includeVersionType = false, separator = ' · ' } = {}) {
  const releaseDate = String(point?.release_date || '');
  if (!releaseDate) return '';
  return includeVersionType && point?.version_type ? `${releaseDate}${separator}${point.version_type}` : releaseDate;
}

export function ReleasePointText({ value, placeholder = '—', style, className }) {
  const hasValue = value !== undefined && value !== null && value !== '';
  const text = hasValue ? String(value) : placeholder;
  const numericStyle = hasValue && isNumericReleasePoint(value)
    ? { fontFamily: RELEASE_POINT_NUMBER_FONT, fontVariantNumeric: 'tabular-nums' }
    : null;

  return (
    <span className={className} style={{ ...style, ...numericStyle }}>
      {text}
    </span>
  );
}

export function ReleasePointOptionLabel({ releaseDate, versionType, includeVersionType = false }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
      <ReleasePointText value={releaseDate} />
      {includeVersionType && versionType ? (
        <span style={{ color: 'var(--radar-text-secondary)' }}>· {versionType}</span>
      ) : null}
    </span>
  );
}

export function makeReleasePointOption(point, { includeVersionType = false, valueKey = 'id' } = {}) {
  const releaseDate = point?.release_date || '';
  return {
    value: point?.[valueKey],
    label: (
      <ReleasePointOptionLabel
        releaseDate={releaseDate}
        versionType={point?.version_type}
        includeVersionType={includeVersionType}
      />
    ),
    searchLabel: releasePointLabelText(point, { includeVersionType }),
    releaseDate,
    versionType: point?.version_type,
  };
}

export function makeReleasePointOptions(points, options) {
  return (points || []).map((point) => makeReleasePointOption(point, options));
}

export function releasePointFilter(input, option) {
  const text = option?.searchLabel ?? option?.label ?? '';
  return String(text).toLowerCase().includes(String(input || '').toLowerCase());
}

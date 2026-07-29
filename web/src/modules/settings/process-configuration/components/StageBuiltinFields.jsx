/**
 * 文件：web/src/modules/settings/process-configuration/components/StageBuiltinFields.jsx
 * 说明：内置输入项与扩展输入项共用阶段配置中的分区、排序和宽度，不再由业务页面写死。
 * 用途：将业务页面保留的专业字段控件直接渲染到配置指定的分区卡片。
 * 作者：hengguan
 */

import { Children, useEffect, useMemo, useState } from 'react';
import { invalidateStageContentData, loadStageContentSchema, subscribeStageContentConfigUpdated } from '../api/stageContentDataCache.js';

function normalizeScope(scopeKey) {
  return String(scopeKey || '').replace(/[^a-zA-Z0-9_-]/g, '-');
}

function directFieldDescriptors(children) {
  return Children.toArray(children)
    .filter((child) => child?.type === StageBuiltinField && child.props?.fieldKey)
    .map((child) => child.props);
}

/**
 * 业务页面只声明一次字段控件；本组件根据输入项配置创建分区并决定每个字段的挂载位置。
 * 默认分区只在配置未返回时兜底，避免首次加载把表单误判为隐藏。
 */
export default function StageBuiltinFields({ scopeKey, defaults = {}, children }) {
  const [schema, setSchema] = useState(null);
  const descriptors = useMemo(() => directFieldDescriptors(children), [children]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const next = await loadStageContentSchema(scopeKey);
      if (alive) setSchema(next);
    };
    load().catch(() => {});
    const refresh = () => {
      invalidateStageContentData(scopeKey);
      load().catch(() => {});
    };
    const unsubscribe = subscribeStageContentConfigUpdated(scopeKey, refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [scopeKey]);

  const model = useMemo(() => {
    const configured = new Map((schema?.fields || []).map((field) => [field.field_key, field]));
    const fallbackSections = Object.entries(defaults).map(([section_key, definition], index) => ({
      section_key,
      title: definition.title || '',
      layout_mode: definition.layout_mode || 'left',
      sort: definition.sort ?? index * 10,
      show_title: definition.show_title !== false,
    }));
    // 空配置与请求尚未返回时都必须保留业务页面声明的默认分区，避免把所有
    // 内置字段误判为无挂载位置。
    const sections = schema?.sections?.length ? schema.sections : fallbackSections;
    const sectionById = new Map(sections.map((section) => [section.id, section]));
    const placementByKey = new Map();
    for (const descriptor of descriptors) {
      const field = configured.get(descriptor.fieldKey);
      // 配置可能引用已删除分区；此时按业务声明的默认分区展示，而不是让字段消失。
      const section = sectionById.get(field?.section_id)
        || sections.find((item) => item.section_key === descriptor.defaultSection);
      if (!section || field?.visible === false || field?.visible === 0) continue;
      placementByKey.set(descriptor.fieldKey, {
        field,
        section,
        columnSpan: Number(field?.column_span || descriptor.defaultColumnSpan || 12) === 24 ? 24 : 12,
        sort: Number(field?.sort ?? descriptor.sort ?? 0),
      });
    }
    const activeSections = sections
      .filter((section) => [...placementByKey.values()].some((placement) => placement.section.section_key === section.section_key))
      .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || Number(a.id || 0) - Number(b.id || 0));
    return { placementByKey, activeSections };
  }, [defaults, descriptors, schema]);

  const fieldsBySection = useMemo(() => {
    const result = new Map(model.activeSections.map((section) => [section.section_key, []]));
    for (const descriptor of descriptors) {
      const placement = model.placementByKey.get(descriptor.fieldKey);
      const fields = placement && result.get(placement.section.section_key);
      if (!fields) continue;
      fields.push(<BuiltinFieldSlot key={descriptor.fieldKey} placement={placement}>{descriptor.children}</BuiltinFieldSlot>);
    }
    return result;
  }, [descriptors, model.activeSections, model.placementByKey]);
  const scopeClass = normalizeScope(scopeKey);

  return <>
    {model.activeSections.map((section) => {
      const sectionKey = section.section_key;
      return <div
        key={section.id || sectionKey}
        className={`form-section-card stage-detail-section-${sectionKey}`}
        data-stage-layout-section={sectionKey}
        data-stage-layout-slot="builtin"
        data-stage-layout-instance="builtin"
      >
        {section.show_title !== false && section.show_title !== 0 && <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>{section.title}</div>}
        {!section.collapsed && <div
          className="stage-builtin-section-fields"
          data-stage-builtin-section={`${scopeClass}:${sectionKey}`}
        >{fieldsBySection.get(sectionKey)}</div>}
      </div>;
    })}
    <style>{`
      .stage-builtin-section-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 8px;}
      .stage-builtin-field{min-width:0;}
      .stage-builtin-field-full{grid-column:1 / -1;}
      @media (max-width:767px){.stage-builtin-section-fields{grid-template-columns:minmax(0,1fr);}.stage-builtin-field-full{grid-column:auto;}}
    `}</style>
  </>;
}

function BuiltinFieldSlot({ placement, children }) {
  const className = `stage-builtin-field${placement.columnSpan === 24 ? ' stage-builtin-field-full' : ''}`;
  return <div className={className} style={{ order: placement.sort }}>{children}</div>;
}

/** 供业务页面声明内置字段；由 StageBuiltinFields 按配置统一渲染。 */
export function StageBuiltinField() {
  return null;
}

/**
 * 文件：web/src/modules/settings/process-configuration/components/StageSectionLayout.jsx
 * 说明：历史详情页保留各自的专业表单结构，但模块所在左/右/整行及排序均从阶段配置读取。
 * 用途：将详情页内置业务模块的分区配置转换为统一的布局样式。
 * 作者：hengguan
 */

import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { buildStageSectionLayout } from '../../../../shared/workflow/index.js';
import { invalidateStageContentData, loadStageContentSchema } from '../api/stageContentDataCache.js';

const safeScope = (scopeKey) => String(scopeKey || '').replace(/[^a-zA-Z0-9_-]/g, '-');
const cssContent = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');

export default function StageSectionLayout({ scopeKey, leftSpan = 14, rightSpan = 10, defaults = {} }) {
  const [sections, setSections] = useState([]);
  const [flowCss, setFlowCss] = useState('');
  // 调用方通常以 JSX 字面量传入默认配置；按内容稳定引用，避免表单输入时重复
  // 创建监听器和重新排版。
  const defaultsKey = JSON.stringify(defaults);
  const stableDefaults = useMemo(() => JSON.parse(defaultsKey), [defaultsKey]);
  const load = async () => setSections((await loadStageContentSchema(scopeKey))?.sections || []);
  useEffect(() => {
    load().catch(() => {});
    const refresh = () => {
      invalidateStageContentData(scopeKey);
      load().catch(() => {});
    };
    window.addEventListener('stage-content-config-updated', refresh);
    return () => window.removeEventListener('stage-content-config-updated', refresh);
  }, [scopeKey]);
  const css = useMemo(() => {
    // 内置模块与管理员新增的分区均使用同一套样式生成逻辑，避免扩展信息、
    // 交付件等公共模块游离在分区排序之外。
    const byKey = new Map(Object.entries(stableDefaults));
    sections.forEach((section) => byKey.set(section.section_key, section));
    const layoutSelector = `.stage-detail-layout-${safeScope(scopeKey)}`;
    const columnsCss = `${layoutSelector}{display:grid!important;grid-template-columns:calc(${(leftSpan / 24) * 100}% - 6px) calc(${(rightSpan / 24) * 100}% - 6px);column-gap:12px;row-gap:12px;margin-left:0!important;margin-right:0!important;}`;
    const configuredSections = [...byKey.entries()].map(([key, section], index) => {
      const fallback = stableDefaults[key] || {};
      const layout = section.layout_mode || 'left';
      const order = Number(section.sort ?? fallback.sort ?? index * 10);
      return { key, section, fallback, layout, order, index };
    });
    // sort 是全局布局顺序，而不是“左、右、整行”三个固定区域内的顺序。
    // 由公共算法生成行列位置，支持整行模块出现在任意位置。
    const layoutPlan = buildStageSectionLayout(configuredSections);
    const sectionsCss = configuredSections.map(({ key, section, fallback, order }) => {
      // Col 使用 display: contents 以允许模块跨栏；CSS 选择器不能用直接子节点，
      // 否则会因保留的 DOM 包装层而丢失配置样式。
      const selector = `.stage-detail-layout-${safeScope(scopeKey)} .stage-detail-section-${key}`;
      const placement = layoutPlan.placements.get(key) || { column: '1', row: 1 };
      const title = cssContent(section.title || fallback.title || '');
      const titleCss = section.show_title === false || section.show_title === 0
        ? `${selector}>.form-section-title{display:none;}`
        : (title ? `${selector}>.form-section-title{font-size:0;}${selector}>.form-section-title::after{content:"${title}";font-size:13px;}` : '');
      // 默认折叠只在卡片挂载折叠类时生效；点击标题后可移除该类重新展开内容。
      const collapsedCss = section.collapsed ? `${selector}.is-stage-section-collapsed>.form-section-title~*{display:none!important;}` : '';
      // order 仅在移动端单栏回退时参与排序；桌面端由独立左右内容流决定位置。
      // 不覆盖卡片自身的内边距：详情页各模块原有的标题留白、字段留白应保持一致。
      return `${selector}{order:${order};grid-column:${placement.column};grid-row:${placement.row};min-width:0;box-sizing:border-box;}${titleCss}${collapsedCss}`;
    }).join('\n');
    return { css: `${columnsCss}\n${sectionsCss}`, configuredSections, layoutPlan };
  }, [scopeKey, sections, leftSpan, rightSpan, stableDefaults]);

  useLayoutEffect(() => {
    const layoutSelector = `.stage-detail-layout-${safeScope(scopeKey)}`;
    const cleanups = [];
    const container = document.querySelector(layoutSelector);
    if (container) for (const item of css.configuredSections.filter(({ section }) => !!section.collapsed && section.show_title !== 0 && section.show_title !== false)) {
      const card = container.querySelector(`.stage-detail-section-${item.key}`);
      const title = card?.querySelector(':scope > .form-section-title');
      if (!card || !title) continue;
      card.classList.add('is-stage-section-collapsed', 'is-stage-section-collapsible');
      title.tabIndex = 0;
      title.setAttribute('role', 'button');
      title.setAttribute('aria-expanded', 'false');
      const toggle = () => {
        const collapsed = card.classList.toggle('is-stage-section-collapsed');
        title.setAttribute('aria-expanded', String(!collapsed));
        // 绝对定位布局需重新测量折叠后的卡片高度与后续模块位置。
        window.dispatchEvent(new Event('stage-section-collapse-toggled'));
      };
      const onKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      };
      title.addEventListener('click', toggle);
      title.addEventListener('keydown', onKeyDown);
      cleanups.push(() => {
        title.removeEventListener('click', toggle);
        title.removeEventListener('keydown', onKeyDown);
        title.removeAttribute('role');
        title.removeAttribute('aria-expanded');
        title.removeAttribute('tabindex');
        card.classList.remove('is-stage-section-collapsed', 'is-stage-section-collapsible');
      });
    }
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [scopeKey, css]);

  useLayoutEffect(() => {
    const layoutSelector = `.stage-detail-layout-${safeScope(scopeKey)}`;
    let frameId = 0;
    let observer;
    let mutationObserver;

    const measure = () => {
      // 移动端保持单栏自然流，避免绝对定位影响表单的响应式展开。
      if (window.matchMedia('(max-width: 767px)').matches) {
        setFlowCss((old) => old ? '' : old);
        return;
      }
      const container = document.querySelector(layoutSelector);
      if (!container) return;
      const containerWidth = container.getBoundingClientRect().width;
      if (!containerWidth) return;

      const gap = 12;
      const leftWidth = (containerWidth * leftSpan / 24) - gap / 2;
      const rightWidth = (containerWidth * rightSpan / 24) - gap / 2;
      const rightOffset = (containerWidth * leftSpan / 24) + gap / 2;
      const rules = [];
      let top = 0;
        // 全宽模块按全局顺序作为分隔点；两个全宽模块之间，左右栏分别累加高度。
        // 因而左侧较短的“需求分析说明书”等模块会紧贴上一左侧模块，不会被右侧
        // 基本信息或负责人模块的高度向下挤压。
      for (const segment of css.layoutPlan.segments) {
          const positioned = segment.items.map((item) => ({
            item,
            element: container.querySelector(`.stage-detail-section-${item.key}`),
            placement: css.layoutPlan.placements.get(item.key),
          })).filter(({ element }) => !!element);
          if (!positioned.length) continue;
          if (segment.type === 'full') {
            const [{ item, element }] = positioned;
            const selector = `${layoutSelector} .stage-detail-section-${item.key}`;
            rules.push(`${selector}{position:absolute!important;top:${top}px;left:0;width:${containerWidth}px!important;}`);
            top += element.getBoundingClientRect().height + gap;
            continue;
          }
          const laneTop = { left: top, right: top };
          for (const { item, element, placement } of positioned) {
            const layout = placement.layout === 'right' ? 'right' : 'left';
            const selector = `${layoutSelector} .stage-detail-section-${item.key}`;
            const width = layout === 'right' ? rightWidth : leftWidth;
            const left = layout === 'right' ? rightOffset : 0;
            rules.push(`${selector}{position:absolute!important;top:${laneTop[layout]}px;left:${left}px;width:${width}px!important;}`);
            laneTop[layout] += element.getBoundingClientRect().height + gap;
          }
          top = Math.max(laneTop.left, laneTop.right);
      }
      const height = Math.max(0, top - (top ? gap : 0));
      const nextCss = `@media (min-width:768px){${layoutSelector}{display:block!important;position:relative!important;min-height:${height}px!important;}${rules.join('')}}`;
      setFlowCss((old) => old === nextCss ? old : nextCss);
    };
    const schedule = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    // 首次测量在 layout effect 内同步完成，浏览器绘制前即从普通流切换为稳定布局。
    measure();
    const container = document.querySelector(layoutSelector);
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(container);
    }
    if (container && typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(schedule);
      mutationObserver.observe(container, { childList: true, subtree: true });
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('stage-section-collapse-toggled', schedule);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('stage-section-collapse-toggled', schedule);
    };
  }, [scopeKey, leftSpan, rightSpan, css]);

  return <><style>{css.css}</style><style>{flowCss}</style></>;
}

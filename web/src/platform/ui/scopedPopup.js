/**
 * 文件：web/src/platform/ui/scopedPopup.js
 * 说明：遵循项目研发规约；跨模块能力仅可经公开契约访问。
 * 用途：为多页签模式提供当前活动页签的弹层容器，供静态确认框等脱离 React 上下文的弹窗使用。
 * 作者：hengguan
 */

let scopedPopupGetter = null;

export function setScopedPopupContainerGetter(getter) {
  scopedPopupGetter = getter;
}

export function clearScopedPopupContainerGetter(getter) {
  if (scopedPopupGetter === getter) scopedPopupGetter = null;
}

export function getScopedPopupContainer() {
  if (typeof document === 'undefined') return undefined;
  return scopedPopupGetter?.() || document.body;
}

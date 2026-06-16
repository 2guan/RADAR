/**
 * 文件：router/detailLinks.js
 * 用途：详情单页的「模块 → 路由路径」统一映射，以及生成可复制的完整详情链接。
 *       供详情弹窗内点击编号复制链接、以及详情单页之间互相跳转使用。
 * 作者：hengguan
 * 说明：采用 HashRouter，完整链接形如 `${origin}${pathname}#/dev/DEV-2026-001`。
 *       module 取值与后端权限模块对齐：requirement/dev/test/release_apply/release。
 */

// 各模块详情单页的 Hash 路由路径（不含 # 前缀）
const PATH_BUILDERS = {
  requirement: (code) => `/requirements/${encodeURIComponent(code)}`,
  dev: (code) => `/dev/${encodeURIComponent(code)}`,
  test: (code) => `/test/detail/${encodeURIComponent(code)}`,
  release_apply: (code) => `/release/apply/${encodeURIComponent(code)}`,
  release: (code) => `/release/detail/${encodeURIComponent(code)}`,
};

/** 生成详情单页的 Hash 路由路径（用于 navigate / <Link>） */
export function detailPath(module, code) {
  const build = PATH_BUILDERS[module];
  return build && code ? build(code) : null;
}

/** 生成可复制分享的完整 URL（含域名与 Hash），用于剪贴板 */
export function detailUrl(module, code) {
  const path = detailPath(module, code);
  if (!path) return null;
  const base = window.location.href.split('#')[0];
  return `${base}#${path}`;
}

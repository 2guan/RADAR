/**
 * 文件：components/Can.jsx
 * 用途：按钮级权限包装组件。仅当当前用户拥有指定模块的指定操作权限时渲染子节点。
 * 作者：hengguan
 * 说明：底层订阅了 useAppStore 的 can 权限校验方法，用于按模块和动作（如 'view', 'edit' 等）控制组件渲染，无权限时渲染为 null。
 */

import { useAppStore } from '../stores/app.js';

export default function Can({ module, action, children }) {
  const can = useAppStore((s) => s.can);
  return can(module, action) ? children : null;
}

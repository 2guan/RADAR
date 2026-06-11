/**
 * 文件：components/Can.jsx
 * 用途：按钮级权限包装组件。仅当当前用户拥有指定模块的指定操作权限时渲染子节点。
 * 作者：hengguan
 * 用法：<Can module="dev" action="dev.intake"><Button/></Can>
 */

import { useAppStore } from '../stores/app.js';

export default function Can({ module, action, children }) {
  const can = useAppStore((s) => s.can);
  return can(module, action) ? children : null;
}

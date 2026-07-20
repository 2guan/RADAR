/**
 * 文件：app.jsx
 * 用途：应用路由装配。HashRouter + 登录页 + 受保护的主框架布局，并基于权限做路由守卫。
 * 作者：hengguan
 * 说明：进入受保护区域前确保已加载用户/平台/投产窗口信息；无权限模块自动重定向。
 */

import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { TOKEN_KEY } from './api/client.js';
import { useAppStore } from './stores/app.js';
import MainLayout from './layout/MainLayout.jsx';
import Login from './pages/Login.jsx';
import { getHomePath } from './router/home.js';
import { getRouteModule, renderMainRouteElements } from './router/routes.jsx';

/**
 * 受保护区域容器：首次加载拉取用户/平台/投产窗口；未登录跳转登录页。
 */
function Protected({ children }) {
  const { user, loadMe, loadPlatform, loadReleasePoint, loadStatusCatalog, can } = useAppStore();
  const [loading, setLoading] = useState(!user);
  const location = useLocation();
  const token = localStorage.getItem(TOKEN_KEY);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    if (user) { setLoading(false); return; }
    (async () => {
      try {
        await Promise.all([loadPlatform(), loadMe()]);
        await loadStatusCatalog();
        await loadReleasePoint();
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (!token) return <Navigate to="/login" state={{ from: location }} replace />;
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
        <span style={{ color: 'var(--radar-text-secondary)' }}>加载中…</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  // 路由守卫：无该模块查看权限则重定向到默认首页
  // 采用前缀匹配，兼顾列表页与详情单页（/requirements/:code、/release/apply/:code 等）；
  // 顺序敏感：更具体的前缀须排在前面（/release/apply 先于 /release）。
  const path = location.pathname;
  const mod = getRouteModule(path);
  if (mod && !can(mod, 'view')) {
    const homePath = getHomePath(user?.defaultHome);
    return <Navigate to={homePath} replace />;
  }
  return children;
}

export default function AppRouter() {
  // 应用启动时预加载平台信息（用于登录页标题）
  const loadPlatform = useAppStore((s) => s.loadPlatform);
  useEffect(() => { loadPlatform(); }, []);

  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={<Protected><MainLayout /></Protected>}
        >
          {renderMainRouteElements()}
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

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
import Dashboard from './pages/Dashboard.jsx';
import Overview from './pages/Overview.jsx';
import Requirements from './pages/Requirements.jsx';
import DevTasks from './pages/DevTasks.jsx';
import { SitPage, UatPage, NftPage, SecPage } from './pages/TestTasks.jsx';
import Release from './pages/Release.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';

/**
 * 受保护区域容器：首次加载拉取用户/平台/投产窗口；未登录跳转登录页。
 */
function Protected({ children }) {
  const { user, loadMe, loadPlatform, loadReleasePoint, can } = useAppStore();
  const [loading, setLoading] = useState(!user);
  const location = useLocation();
  const token = localStorage.getItem(TOKEN_KEY);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    if (user) { setLoading(false); return; }
    (async () => {
      try {
        await Promise.all([loadPlatform(), loadMe()]);
        await loadReleasePoint();
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (!token) return <Navigate to="/login" replace />;
  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
        <span style={{ color: 'var(--radar-text-secondary)' }}>加载中…</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  // 路由守卫：无该模块查看权限则重定向到首个有权限模块
  const path = location.pathname;
  const moduleByPath = {
    '/dashboard': 'dashboard', '/overview': 'overview', '/requirements': 'requirement',
    '/dev': 'dev', '/test': 'test', '/release': 'release', '/users': 'user', '/settings': 'settings',
  };
  const mod = moduleByPath[path] || (path.startsWith('/test/') ? 'test' : undefined);
  if (mod && !can(mod, 'view')) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function AppRouter() {
  // 应用启动时预加载平台信息（用于登录页标题）
  const loadPlatform = useAppStore((s) => s.loadPlatform);
  useEffect(() => { loadPlatform(); }, []);

  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={<Protected><MainLayout /></Protected>}
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="overview" element={<Overview />} />
          <Route path="requirements" element={<Requirements />} />
          <Route path="dev" element={<DevTasks />} />
          <Route path="test" element={<Navigate to="/test/sit" replace />} />
          <Route path="test/sit" element={<SitPage />} />
          <Route path="test/uat" element={<UatPage />} />
          <Route path="test/nft" element={<NftPage />} />
          <Route path="test/sec" element={<SecPage />} />
          <Route path="release" element={<Release />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

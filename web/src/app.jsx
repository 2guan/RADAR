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
import PamsDashboard from './pages/pams/dashboard/page.tsx';
import PamsReport from './pages/pams/report/page.tsx';
import PamsReportTracker from './pages/pams/report-tracker/page.tsx';
import PamsReportTicket from './pages/pams/report-ticket/page.tsx';
import PamsMyIssues from './pages/pams/my-issues/page.tsx';
import PamsIssues from './pages/pams/issues/page.tsx';
import PamsMajorIssues from './pages/pams/major-issues/page.tsx';
import PamsFaq from './pages/pams/faq/page.tsx';
import PamsIssueDetail from './pages/pams/issues/detail-page.tsx';
import PamsBusinessTicket from './pages/pams/business-ticket/page.tsx';
import PamsBusinessTicketDetail from './pages/pams/business-ticketdetail/page.tsx';
import PamsKongming from './pages/pams/kongming/page.tsx';
import PamsKongmingDetail from './pages/pams/kongmingdetail/page.tsx';
import PamsItsm from './pages/pams/itsm/page.tsx';
import PamsItsmDetail from './pages/pams/itsmdetail/page.tsx';
import PamsProblemReport from './pages/pams/problem-report/page.tsx';
import PamsAnalyst from './pages/pams/analyst/page.tsx';
import PamsConfig from './pages/pams/config/page.tsx';
import DevTasks from './pages/DevTasks.jsx';
import { SitPage, UatPage, NftPage, SecPage } from './pages/TestTasks.jsx';
import Release from './pages/Release.jsx';
import ReleaseApply from './pages/ReleaseApply.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import {
  RequirementDetailPage,
  DevTaskDetailPage,
  TestTaskDetailPage,
  ReleaseApplyDetailPage,
  ReleaseApprovalDetailPage,
} from './pages/DetailPages.jsx';

export function getHomePath(defaultHome) {
  const routeMap = {
    '仪表盘': '/dashboard',
    '效能仪表盘': '/dashboard',
    '版本概览': '/overview',
    '需求分析': '/requirements',
    '问题管理': '/pams/dashboard',
    'PAMS问题管理': '/pams/dashboard',
    'PAMS 问题管理': '/pams/dashboard',
    '开发管理': '/dev',
    '测试管理': '/test/sit',
    '应用组装测试': '/test/sit',
    '用户测试': '/test/uat',
    '非功能测试': '/test/nft',
    '安全测试': '/test/sec',
    '投产管理': '/release/apply',
    '投产申请': '/release/apply',
    '投产审批': '/release',
    '人员管理': '/users',
    '系统设置': '/settings',
  };
  if (!defaultHome) return '/dashboard';
  if (defaultHome.startsWith('/')) return defaultHome;
  return routeMap[defaultHome] || '/dashboard';
}

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
  const PREFIX_MODULE = [
    ['/dashboard', 'dashboard'], ['/overview', 'overview'],
    ['/requirements', 'requirement'], ['/pams', 'pams'],
    ['/dev', 'dev'], ['/test', 'test'],
    ['/release/apply', 'release_apply'], ['/release', 'release'],
    ['/users', 'user'], ['/settings', 'settings'],
  ];
  const mod = PREFIX_MODULE.find(([p]) => path === p || path.startsWith(p + '/'))?.[1];
  if (mod && !can(mod, 'view')) {
    const homePath = getHomePath(user?.defaultHome);
    return <Navigate to={homePath} replace />;
  }
  return children;
}

function IndexRedirect() {
  const user = useAppStore((s) => s.user);
  const homePath = getHomePath(user?.defaultHome);
  return <Navigate to={homePath} replace />;
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
          <Route index element={<IndexRedirect />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="overview" element={<Overview />} />
          <Route path="requirements" element={<Requirements />} />
          <Route path="requirements/:code" element={<RequirementDetailPage />} />
          <Route path="pams" element={<Navigate to="/pams/dashboard" replace />} />
          <Route path="pams/dashboard" element={<PamsDashboard />} />
          <Route path="pams/report" element={<PamsReport />} />
          <Route path="pams/report-tracker" element={<PamsReportTracker />} />
          <Route path="pams/report-ticket" element={<PamsReportTicket />} />
          <Route path="pams/my-issues" element={<PamsMyIssues />} />
          <Route path="pams/issues" element={<PamsIssues />} />
          <Route path="pams/issues/:id" element={<PamsIssueDetail />} />
          <Route path="pams/major-issues" element={<PamsMajorIssues />} />
          <Route path="pams/faq" element={<PamsFaq />} />
          <Route path="pams/business-ticket" element={<PamsBusinessTicket />} />
          <Route path="pams/business-ticketdetail/:id" element={<PamsBusinessTicketDetail />} />
          <Route path="pams/kongming" element={<PamsKongming />} />
          <Route path="pams/kongmingdetail/:id" element={<PamsKongmingDetail />} />
          <Route path="pams/itsm" element={<PamsItsm />} />
          <Route path="pams/itsmdetail/:id" element={<PamsItsmDetail />} />
          <Route path="pams/problem-report" element={<PamsProblemReport />} />
          <Route path="pams/analyst" element={<PamsAnalyst />} />
          <Route path="pams/config" element={<PamsConfig />} />
          <Route path="dev" element={<DevTasks />} />
          <Route path="dev/:code" element={<DevTaskDetailPage />} />
          <Route path="test" element={<Navigate to="/test/sit" replace />} />
          <Route path="test/sit" element={<SitPage />} />
          <Route path="test/uat" element={<UatPage />} />
          <Route path="test/nft" element={<NftPage />} />
          <Route path="test/sec" element={<SecPage />} />
          <Route path="test/detail/:code" element={<TestTaskDetailPage />} />
          <Route path="release" element={<Release />} />
          <Route path="release/apply" element={<ReleaseApply />} />
          <Route path="release/apply/:code" element={<ReleaseApplyDetailPage />} />
          <Route path="release/detail/:code" element={<ReleaseApprovalDetailPage />} />
          <Route path="users" element={<Users />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

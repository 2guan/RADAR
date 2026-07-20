/**
 * 文件：router/routes.jsx
 * 用途：业务路由定义。供主路由与多页签工作区共用，避免维护两份页面映射。
 * 作者：hengguan
 */

import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppStore } from '../stores/app.js';
import Dashboard from '../pages/Dashboard.jsx';
import Overview from '../pages/Overview.jsx';
import Requirements from '../pages/Requirements.jsx';
import Tickets from '../pages/Tickets.jsx';
import Issues from '../pages/Issues.jsx';
import DevTasks from '../pages/DevTasks.jsx';
import { SitPage, UatPage, NftPage, SecPage } from '../pages/TestTasks.jsx';
import Release from '../pages/Release.jsx';
import ReleaseApply from '../pages/ReleaseApply.jsx';
import Users from '../pages/Users.jsx';
import Settings from '../pages/Settings.jsx';
import {
  RequirementDetailPage,
  DevTaskDetailPage,
  TestTaskDetailPage,
  ReleaseApplyDetailPage,
  ReleaseApprovalDetailPage,
} from '../pages/DetailPages.jsx';
import { getHomePath } from './home.js';

export const ROUTE_MODULE_PREFIXES = [
  ['/dashboard', 'dashboard'], ['/overview', 'overview'],
  ['/requirements', 'requirement'], ['/tickets', 'ticket'], ['/issues', 'issue'],
  ['/dev', 'dev'], ['/test/sit', 'test.SIT'], ['/test/uat', 'test.UAT'], ['/test/nft', 'test.NFT'], ['/test/sec', 'test.SEC'],
  ['/release/apply', 'release_apply'], ['/release', 'release'],
  ['/users', 'user'], ['/settings', 'settings'],
];

export function getRouteModule(path) {
  return ROUTE_MODULE_PREFIXES.find(([p]) => path === p || path.startsWith(`${p}/`))?.[1];
}

function IndexRedirect() {
  const user = useAppStore((s) => s.user);
  const homePath = getHomePath(user?.defaultHome);
  return <Navigate to={homePath} replace />;
}

export const MAIN_ROUTES = [
  { index: true, element: <IndexRedirect /> },
  { path: 'dashboard', element: <Dashboard /> },
  { path: 'overview', element: <Overview /> },
  { path: 'requirements', element: <Requirements /> },
  { path: 'requirements/:code', element: <RequirementDetailPage /> },
  { path: 'tickets', element: <Tickets /> },
  { path: 'issues', element: <Issues /> },
  { path: 'dev', element: <DevTasks /> },
  { path: 'dev/:code', element: <DevTaskDetailPage /> },
  { path: 'test', element: <Navigate to="/test/sit" replace /> },
  { path: 'test/sit', element: <SitPage /> },
  { path: 'test/uat', element: <UatPage /> },
  { path: 'test/nft', element: <NftPage /> },
  { path: 'test/sec', element: <SecPage /> },
  { path: 'test/detail/:code', element: <TestTaskDetailPage /> },
  { path: 'release', element: <Release /> },
  { path: 'release/apply', element: <ReleaseApply /> },
  { path: 'release/apply/:code', element: <ReleaseApplyDetailPage /> },
  { path: 'release/detail/:code', element: <ReleaseApprovalDetailPage /> },
  { path: 'users', element: <Users /> },
  { path: 'settings', element: <Settings /> },
];

export function renderMainRouteElements() {
  return MAIN_ROUTES.map((route) => (
    <Route
      key={route.index ? 'index' : route.path}
      index={route.index}
      path={route.path}
      element={route.element}
    />
  ));
}

export function WorkspaceRoutes({ location }) {
  return (
    <Routes location={location}>
      {renderMainRouteElements()}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

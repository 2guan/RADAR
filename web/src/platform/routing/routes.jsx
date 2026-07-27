/**
 * 文件：web/src/platform/routing/routes.jsx
 * 说明：遵循项目研发规约；跨模块能力仅可经公开契约访问。
 * 用途：业务路由定义。供主路由与多页签工作区共用，避免维护两份页面映射。
 * 作者：hengguan
 */

import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppStore } from '../state/app.js';
import { getHomePath } from './home.js';

// 统一适配具名导出页面，确保每个业务模块都按需加载而不复制页面入口逻辑。
const lazyNamed = (load, name) => lazy(async () => ({ default: (await load())[name] }));
const Dashboard = lazy(() => import('../../modules/dashboard/pages/DashboardPage.jsx'));
const Overview = lazy(() => import('../../modules/overview/pages/OverviewPage.jsx'));
const Requirements = lazy(() => import('../../modules/requirements/pages/RequirementsPage.jsx'));
const Tickets = lazy(() => import('../../modules/tickets/pages/TicketsPage.jsx'));
const Issues = lazy(() => import('../../modules/issues/pages/IssuesPage.jsx'));
const DevTasks = lazy(() => import('../../modules/development/pages/DevTasksPage.jsx'));
const SitPage = lazyNamed(() => import('../../modules/testing/pages/TestTasksPage.jsx'), 'SitPage');
const UatPage = lazyNamed(() => import('../../modules/testing/pages/TestTasksPage.jsx'), 'UatPage');
const NftPage = lazyNamed(() => import('../../modules/testing/pages/TestTasksPage.jsx'), 'NftPage');
const SecPage = lazyNamed(() => import('../../modules/testing/pages/TestTasksPage.jsx'), 'SecPage');
const Release = lazy(() => import('../../modules/release/pages/ReleasePage.jsx'));
const ReleaseApply = lazy(() => import('../../modules/release/pages/ReleaseApplyPage.jsx'));
const Users = lazy(() => import('../../modules/identity-access/pages/UsersPage.jsx'));
const Settings = lazy(() => import('../../modules/settings/pages/SettingsPage.jsx'));
const RequirementDetailPage = lazy(() => import('../../modules/requirements/pages/RequirementDetailPage.jsx'));
const DevTaskDetailPage = lazy(() => import('../../modules/development/pages/DevTaskDetailPage.jsx'));
const TestTaskDetailPage = lazy(() => import('../../modules/testing/pages/TestTaskDetailPage.jsx'));
const ReleaseApplyDetailPage = lazy(() => import('../../modules/release/pages/ReleaseApplyDetailPage.jsx'));
const ReleaseApprovalDetailPage = lazy(() => import('../../modules/release/pages/ReleaseApprovalDetailPage.jsx'));

function LoadingPage() {
  return <div style={{ padding: 24, color: 'var(--radar-text-secondary)' }}>页面加载中…</div>;
}

// 路径与 RBAC 模块键的映射是前端鉴权和工作区标签的共同事实来源。
export const ROUTE_MODULE_PREFIXES = [
  ['/dashboard', 'dashboard'], ['/overview', 'overview'],
  ['/requirements', 'requirement'], ['/tickets', 'ticket'], ['/issues', 'issue'],
  ['/dev', 'dev'], ['/test/sit', 'test.SIT'], ['/test/uat', 'test.UAT'], ['/test/nft', 'test.NFT'], ['/test/sec', 'test.SEC'],
  ['/release/apply', 'release_apply'], ['/release', 'release'],
  ['/users', 'user'], ['/settings', 'settings'],
];

export function getRouteModule(path) {
  // 按声明顺序匹配，使更具体的 /release/apply 优先于 /release。
  return ROUTE_MODULE_PREFIXES.find(([p]) => path === p || path.startsWith(`${p}/`))?.[1];
}

function IndexRedirect() {
  const user = useAppStore((s) => s.user);
  const homePath = getHomePath(user?.defaultHome);
  return <Navigate to={homePath} replace />;
}

// 主区域和多页签工作区复用这一份路由定义，防止两处页面映射逐渐偏离。
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
  // 每条懒加载路由都由同一 Suspense 回退包裹，避免切换页面时出现空白区域。
  return MAIN_ROUTES.map((route) => (
    <Route
      key={route.index ? 'index' : route.path}
      index={route.index}
      path={route.path}
      element={<Suspense fallback={<LoadingPage />}>{route.element}</Suspense>}
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

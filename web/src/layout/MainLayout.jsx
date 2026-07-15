/**
 * 文件：layout/MainLayout.jsx
 * 用途：主框架布局（企业风，配色随平台预设）。固定侧边栏（品牌 + 自定义导航 + 用户）+ 顶栏
 *       （页面标题 / 投产窗口胶囊 / 主题切换 / 用户菜单）+ 内容区 + 页脚。
 * 作者：hengguan
 * 说明：左侧菜单栏、上方导航栏以及内容区的企业风格整体布局，支持抽屉式的移动端自适应。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layout, Select, Button, Dropdown, Avatar, Drawer, Form, Input, Modal, message, theme as antdTheme, ConfigProvider, Empty, Tooltip } from 'antd';
import {
  MenuOutlined, BulbOutlined, BulbFilled, UserOutlined, LogoutOutlined, RocketOutlined, DownOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, KeyOutlined, AppstoreOutlined, ProfileOutlined, CloseOutlined, ClearOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAppStore } from '../stores/app.js';
import { useResponsive } from '../hooks/useResponsive.js';
import { MENU } from '../router/menu.js';
import { getHomePath } from '../router/home.js';
import { WorkspaceRoutes } from '../router/routes.jsx';
import { apiGet, apiPost } from '../api/client.js';
import ThemeSwitcher from '../components/ThemeSwitcher.jsx';
import { makeReleasePointOptions, releasePointFilter } from '../components/ReleasePointText.jsx';
import { BRAND_LOGO_SRC } from '../utils/logo.js';
import { clearScopedPopupContainerGetter, setScopedPopupContainerGetter } from '../components/scopedPopup.js';

const { Header, Sider, Content } = Layout;

function flattenMenu(items = MENU) {
  return items.flatMap((m) => (m.children ? [m, ...m.children] : [m]));
}

function normalizeTabPath(pathname, search = '') {
  const path = pathname || '/';
  return `${path}${search || ''}`;
}

function parseTabPath(path) {
  const [pathname, query = ''] = path.split('?');
  return {
    pathname: pathname || '/',
    search: query ? `?${query}` : '',
    hash: '',
    state: null,
    key: path,
  };
}

function routeLabel(path, platformName) {
  const pathname = path.split('?')[0];
  const exact = flattenMenu().find((m) => m.key === pathname);
  if (exact) return exact.label;

  const detailRules = [
    [/^\/requirements\/(.+)$/, '需求详情'],
    [/^\/dev\/(.+)$/, '开发详情'],
    [/^\/test\/detail\/(.+)$/, '测试详情'],
    [/^\/release\/apply\/(.+)$/, '投产申请详情'],
    [/^\/release\/detail\/(.+)$/, '投产审批详情'],
  ];
  for (const [pattern, prefix] of detailRules) {
    const matched = pathname.match(pattern);
    if (matched) return `${prefix} · ${decodeURIComponent(matched[1])}`;
  }
  return platformName || '页面';
}

function TabPane({ tab, active }) {
  const portalRef = useRef(null);
  const popupGetter = useCallback(() => portalRef.current || document.body, []);

  useEffect(() => {
    if (!active) return undefined;
    setScopedPopupContainerGetter(popupGetter);
    return () => clearScopedPopupContainerGetter(popupGetter);
  }, [active, popupGetter]);

  const getPopupContainer = useCallback((node) => node?.parentElement || portalRef.current || document.body, []);

  return (
    <div className={`radar-tab-pane ${active ? 'active' : ''}`} aria-hidden={!active}>
      <ConfigProvider getPopupContainer={getPopupContainer}>
        <WorkspaceRoutes location={tab.location} />
      </ConfigProvider>
      <div ref={portalRef} className="radar-tab-popup-root" />
    </div>
  );
}

function HeaderTabStrip({ tabs, activeKey, onActivate, onClose, onCloseAll }) {
  if (!tabs.length) return null;

  return (
    <div className="radar-header-tabs">
      <div className="radar-tab-list">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.key}
            className={`radar-tab-button ${tab.key === activeKey ? 'active' : ''}`}
            onClick={() => onActivate(tab.key)}
            title={tab.title}
          >
            <span className="radar-tab-title">{tab.title}</span>
            <span
              className="radar-tab-close"
              role="button"
              tabIndex={0}
              title="关闭页签"
              onClick={(e) => { e.stopPropagation(); onClose(tab.key); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onClose(tab.key);
                }
              }}
            >
              <CloseOutlined />
            </span>
          </button>
        ))}
      </div>
      <Tooltip title="关闭全部页签">
        <Button
          className="radar-tab-clear"
          size="small"
          type="text"
          shape="circle"
          icon={<ClearOutlined />}
          onClick={onCloseAll}
        />
      </Tooltip>
    </div>
  );
}

function TabbedWorkspace({ tabs, activeKey }) {
  if (!tabs.length) {
    return (
      <div className="radar-tab-workspace empty">
        <Empty description="暂无打开的页签" />
      </div>
    );
  }

  return (
    <div className="radar-tab-workspace">
      <div className="radar-tab-body">
        {tabs.map((tab) => (
          <TabPane key={tab.key} tab={tab} active={tab.key === activeKey} />
        ))}
      </div>
    </div>
  );
}

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useResponsive();
  const { token } = antdTheme.useToken();
  const {
    user, platform, theme, toggleTheme, can, releasePointIds, setReleasePointIds, loadMe,
    contentMode, setContentMode,
  } = useAppStore();

  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [points, setPoints] = useState([]);
  const [openMenus, setOpenMenus] = useState({});
  const [tabs, setTabs] = useState([]);
  const [activeTabKey, setActiveTabKey] = useState(null);

  const [changePwdOpen, setChangePwdOpen] = useState(false);
  const [pwdForm] = Form.useForm();
  const [pwdSaving, setPwdSaving] = useState(false);

  const handleSavePwd = async () => {
    try {
      const v = await pwdForm.validateFields();
      if (v.newPassword !== v.confirmPassword) {
        message.error('两次输入的新密码不一致');
        return;
      }
      setPwdSaving(true);
      await apiPost('/auth/change-password', {
        oldPassword: v.oldPassword,
        newPassword: v.newPassword,
      });
      message.success('密码修改成功');
      setChangePwdOpen(false);
      pwdForm.resetFields();
      await loadMe();
    } catch (err) {
      message.error(err.message || '修改失败');
    } finally {
      setPwdSaving(false);
    }
  };

  const userMenu = {
    items: [
      { key: 'password', icon: <KeyOutlined />, label: '修改密码' },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') {
        useAppStore.getState().logout();
      } else if (key === 'password') {
        setChangePwdOpen(true);
      }
    },
  };

  useEffect(() => { apiGet('/release-points/all').then(setPoints).catch(() => {}); }, []);

  useEffect(() => {
    if (!points.length || !releasePointIds.length) return;
    const normalized = releasePointIds
      .map((value) => {
        const numericValue = Number(value);
        const matched = points.find((point) => Number(point.id) === numericValue)
          || points.find((point) => String(point.release_date) === String(value));
        return matched?.id;
      })
      .map(Number)
      .filter(Number.isFinite)
      .filter((id, index, arr) => arr.indexOf(id) === index);

    const unchanged = normalized.length === releasePointIds.length
      && normalized.every((id, index) => id === Number(releasePointIds[index]));
    if (unchanged) return;

    if (normalized.length) {
      setReleasePointIds(normalized);
      return;
    }

    apiGet('/release-points/current')
      .then((cur) => setReleasePointIds(cur?.id ? [cur.id] : []))
      .catch(() => setReleasePointIds([]));
  }, [points, releasePointIds, setReleasePointIds]);

  const isTabMode = contentMode === 'tabs' && !isMobile;
  const platformName = platform['platform.name'] || '日常需求研发流程管理';

  const activePath = isTabMode ? (activeTabKey ? activeTabKey.split('?')[0] : '') : location.pathname;
  const currentRouteKey = normalizeTabPath(location.pathname, location.search);

  const buildTab = useCallback((path) => ({
    key: path,
    title: routeLabel(path, platformName),
    location: parseTabPath(path),
  }), [platformName]);

  const openTab = useCallback((path, { syncUrl = true } = {}) => {
    const nextPath = path === '/' ? getHomePath(user?.defaultHome) : path;
    const tab = buildTab(nextPath);
    setTabs((prev) => (prev.some((item) => item.key === tab.key) ? prev : [...prev, tab]));
    setActiveTabKey(tab.key);
    if (syncUrl && currentRouteKey !== tab.key) navigate(tab.key);
  }, [buildTab, currentRouteKey, navigate, user?.defaultHome]);

  useEffect(() => {
    if (!isTabMode) return;
    if (location.pathname === '/') {
      const homePath = getHomePath(user?.defaultHome);
      openTab(homePath, { syncUrl: true });
      return;
    }
    openTab(currentRouteKey, { syncUrl: false });
  }, [currentRouteKey, isTabMode, location.pathname, openTab, user?.defaultHome]);

  // 当前路径进入某子菜单时，自动展开其父级
  useEffect(() => {
    setOpenMenus((prev) => {
      const next = { ...prev };
      MENU.forEach((m) => {
        if (m.children?.some((c) => activePath === c.key || activePath.startsWith(`${c.key}/`))) next[m.key] = true;
      });
      return next;
    });
  }, [activePath]);

  const visibleMenu = MENU.filter((m) => can(m.module, 'view'));
  const brand = platform['platform.shortName'] || 'RADAR';

  const go = (key) => {
    if (isTabMode) openTab(key);
    else navigate(key);
    setDrawerOpen(false);
  };
  const toggleMenu = (key) => setOpenMenus((p) => ({ ...p, [key]: !p[key] }));

  const activateTab = (key) => {
    setActiveTabKey(key);
    if (currentRouteKey !== key) navigate(key);
  };

  const closeTab = (key) => {
    const idx = tabs.findIndex((tab) => tab.key === key);
    if (idx < 0) return;
    const next = tabs.filter((tab) => tab.key !== key);
    setTabs(next);
    if (activeTabKey === key) {
      const fallback = next[Math.min(idx, next.length - 1)];
      setActiveTabKey(fallback?.key || null);
      if (fallback && currentRouteKey !== fallback.key) navigate(fallback.key);
    }
  };

  const closeAllTabs = () => {
    setTabs([]);
    setActiveTabKey(null);
  };

  const toggleContentMode = () => {
    const next = isTabMode ? 'single' : 'tabs';
    if (next === 'tabs') {
      const path = location.pathname === '/' ? getHomePath(user?.defaultHome) : currentRouteKey;
      openTab(path);
    } else if (activeTabKey && currentRouteKey !== activeTabKey) {
      navigate(activeTabKey);
    }
    setContentMode(next);
  };

  // 当前页面标题（含子菜单查找）
  const currentLabel = useMemo(() => routeLabel(activePath, platformName), [activePath, platformName]);

  // 渲染单个菜单项（支持一级子菜单）
  const renderNavItem = (m) => {
    if (!m.children) {
      return (
        <div key={m.key}
          className={`radar-nav-item ${activePath === m.key ? 'active' : ''}`}
          onClick={() => go(m.key)}>
          {m.icon}<span>{m.label}</span>
        </div>
      );
    }
    const childItems = m.children.filter((c) => can(c.module, 'view'));
    const open = !!openMenus[m.key];
    const parentActive = childItems.some((c) => activePath === c.key || activePath.startsWith(`${c.key}/`));
    return (
      <div key={m.key}>
        <div className={`radar-nav-item ${parentActive && !open ? 'active' : ''}`} onClick={() => toggleMenu(m.key)}>
          {m.icon}<span style={{ flex: 1 }}>{m.label}</span>
          <DownOutlined style={{ fontSize: 11, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }} />
        </div>
        {open && childItems.map((c) => (
          <div key={c.key}
            className={`radar-nav-item radar-nav-sub ${activePath === c.key ? 'active' : ''}`}
            onClick={() => go(c.key)}>
            <span className="radar-nav-dot" /><span>{c.label}</span>
          </div>
        ))}
      </div>
    );
  };

  // 侧边栏内容
  const siderInner = (
    <>
      <div className="radar-brand">
        <div className="radar-brand-logo"><img src={BRAND_LOGO_SRC} alt="RADAR" /></div>
        <div style={{ minWidth: 0 }}>
          <div className="radar-brand-name">{brand}</div>
          <div className="radar-brand-sub" title={platformName}>{platformName}</div>
        </div>
      </div>
      <div className="radar-nav">
        {visibleMenu.map(renderNavItem)}
      </div>
      <Dropdown menu={userMenu} trigger={['click']}>
        <div className="radar-sider-user" style={{ cursor: 'pointer' }}>
          <Avatar size={32} icon={<UserOutlined />} style={{ background: token.colorPrimary, flexShrink: 0 }} />
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div className="name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
            <div className="role">{user?.roles?.map((r) => r.name).join('、') || '—'}</div>
          </div>
          <DownOutlined style={{ fontSize: 10, color: 'var(--radar-text-secondary)' }} />
        </div>
      </Dropdown>
    </>
  );

  const rpSelector = (
    <Select
      mode="multiple"
      value={releasePointIds}
      placeholder="所有投产点"
      variant="borderless"
      size="small"
      maxTagCount="responsive"
      showSearch
      optionFilterProp="searchLabel"
      filterOption={releasePointFilter}
      style={isMobile ? { width: '100%', minWidth: 0, fontSize: 12 } : { minWidth: 260, fontSize: 12 }}
      className="radar-rp-select"
      classNames={{ popup: { root: 'radar-rp-select-dropdown' } }}
      suffixIcon={<DownOutlined style={{ color: token.colorPrimary }} />}
      onChange={(ids) => setReleasePointIds(ids)}
      options={makeReleasePointOptions(points, { includeVersionType: !isMobile })}
    />
  );

  // userMenu has been moved up to be declared before siderInner

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && !siderCollapsed && (
        <Sider className="radar-sider" width={236}
          style={{ display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{siderInner}</div>
        </Sider>
      )}

      <Layout>
        <Header className="radar-header">
          {!isMobile && (
            <Button
              type="text"
              icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setSiderCollapsed(!siderCollapsed)}
              style={{ fontSize: 16, marginRight: 12 }}
            />
          )}
          {isMobile && <Button className="radar-mobile-menu-btn" type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />}
          {isMobile ? (
            <div className="radar-header-logo" aria-label={brand}>
              <img src={BRAND_LOGO_SRC} alt={brand} />
            </div>
          ) : (
            <div className="radar-page-title">{currentLabel}</div>
          )}
          {!isMobile && <div style={{ flex: 1 }} />}
          <div className="radar-rp-pill" style={{ paddingRight: 2 }}>
            {!isMobile && <RocketOutlined />}
            {rpSelector}
          </div>
          {!isMobile && <ThemeSwitcher />}
          {!isMobile && <Tooltip title={isTabMode ? '切换为单页模式' : '切换为页签模式'}>
            <Button
              type={isTabMode ? 'primary' : 'text'}
              shape="circle"
              size="small"
              icon={isTabMode ? <AppstoreOutlined /> : <ProfileOutlined />}
              onClick={toggleContentMode}
            />
          </Tooltip>}
          <Button type="text" shape="circle" icon={theme === 'dark' ? <BulbFilled /> : <BulbOutlined />} onClick={toggleTheme} title="切换白天/夜间" />
          {/* Global top-right profile removed */}
        </Header>
        {isTabMode && tabs.length > 0 && (
          <div className="radar-header-tab-row">
            <HeaderTabStrip
              tabs={tabs}
              activeKey={activeTabKey}
              onActivate={activateTab}
              onClose={closeTab}
              onCloseAll={closeAllTabs}
            />
          </div>
        )}

        <Content className="radar-content" style={{ margin: isMobile ? 12 : (isTabMode ? 0 : 20), overflow: 'auto hidden' }}>
          {isTabMode ? (
            <TabbedWorkspace
              tabs={tabs}
              activeKey={activeTabKey}
            />
          ) : (
            <Outlet />
          )}
        </Content>
      </Layout>

      <Drawer placement="left" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={236}
        styles={{ body: { padding: 0 }, header: { display: 'none' } }} className="radar-drawer radar-sider">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{siderInner}</div>
      </Drawer>

      <Modal
        title={user?.mustChangePassword ? "密码过期 - 请修改密码" : "修改密码"}
        open={changePwdOpen || !!user?.mustChangePassword}
        closable={!user?.mustChangePassword}
        maskClosable={false}
        keyboard={false}
        onOk={handleSavePwd}
        confirmLoading={pwdSaving}
        onCancel={user?.mustChangePassword ? undefined : () => {
          setChangePwdOpen(false);
          pwdForm.resetFields();
        }}
        destroyOnHidden
        footer={user?.mustChangePassword ? [
          <Button key="logout" icon={<LogoutOutlined />} onClick={() => useAppStore.getState().logout()}>退出登录</Button>,
          <Button key="submit" type="primary" loading={pwdSaving} onClick={handleSavePwd}>保存并启用</Button>
        ] : undefined}
        okText="保存"
        cancelText={user?.mustChangePassword ? null : "取消"}
        width={400}
      >
        <Form form={pwdForm} layout="vertical" style={{ marginTop: 16 }}>
          {user?.mustChangePassword && (
            <div style={{ marginBottom: 16, color: 'var(--radar-primary)', fontWeight: 'bold' }}>
              您的密码已超过有效期，为了您的账号安全，请立即修改密码。
            </div>
          )}
          <Form.Item
            name="oldPassword"
            label="旧密码"
            rules={[{ required: true, message: '请输入旧密码' }]}
          >
            <Input.Password placeholder="请输入当前使用的旧密码" />
          </Form.Item>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  const minLen = platform['security.password.minLength'] ? Number(platform['security.password.minLength']) : 8;
                  if (value.length < minLen) {
                    return Promise.reject(new Error(`密码长度不能小于 ${minLen} 位`));
                  }
                  const complexityEnabled = platform['security.password.complexity'] !== 'false';
                  if (complexityEnabled) {
                    if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[!@#$%^&*()_+\-=\[\]{};':",./<>?\\|~`]/.test(value)) {
                      return Promise.reject(new Error('密码必须包含大小写字母、数字及特殊字符'));
                    }
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的新密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}

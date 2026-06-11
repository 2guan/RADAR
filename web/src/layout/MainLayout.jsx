/**
 * 文件：layout/MainLayout.jsx
 * 用途：主框架布局（靛蓝企业风）。深藏青固定侧边栏（品牌 + 自定义导航 + 用户）+ 白色顶栏
 *       （页面标题 / 投产窗口胶囊 / 主题切换 / 用户菜单）+ 浅色内容区 + 页脚。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import { Layout, Select, Button, Dropdown, Avatar, Drawer, Typography, theme as antdTheme } from 'antd';
import {
  MenuOutlined, BulbOutlined, BulbFilled, UserOutlined, LogoutOutlined, RocketOutlined, RadarChartOutlined, DownOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAppStore } from '../stores/app.js';
import { useResponsive } from '../hooks/useResponsive.js';
import { MENU } from '../router/menu.js';
import { apiGet } from '../api/client.js';
import ThemeSwitcher from '../components/ThemeSwitcher.jsx';

const { Header, Sider, Content } = Layout;

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useResponsive();
  const { token } = antdTheme.useToken();
  const { user, platform, theme, toggleTheme, can, releasePointIds, setReleasePointIds } = useAppStore();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [points, setPoints] = useState([]);
  const [openMenus, setOpenMenus] = useState({});

  useEffect(() => { apiGet('/release-points/all').then(setPoints).catch(() => {}); }, []);

  // 当前路径进入某子菜单时，自动展开其父级
  useEffect(() => {
    setOpenMenus((prev) => {
      const next = { ...prev };
      MENU.forEach((m) => {
        if (m.children?.some((c) => location.pathname === c.key)) next[m.key] = true;
      });
      return next;
    });
  }, [location.pathname]);

  const visibleMenu = MENU.filter((m) => can(m.module, 'view'));
  const brand = platform['platform.shortName'] || 'RADAR';

  const go = (key) => { navigate(key); setDrawerOpen(false); };
  const toggleMenu = (key) => setOpenMenus((p) => ({ ...p, [key]: !p[key] }));

  // 当前页面标题（含子菜单查找）
  const currentLabel = (() => {
    for (const m of MENU) {
      if (m.key === location.pathname) return m.label;
      const c = m.children?.find((x) => x.key === location.pathname);
      if (c) return c.label;
    }
    return platform['platform.name'];
  })();

  // 渲染单个菜单项（支持一级子菜单）
  const renderNavItem = (m) => {
    if (!m.children) {
      return (
        <div key={m.key}
          className={`radar-nav-item ${location.pathname === m.key ? 'active' : ''}`}
          onClick={() => go(m.key)}>
          {m.icon}<span>{m.label}</span>
        </div>
      );
    }
    const childItems = m.children.filter((c) => can(c.module, 'view'));
    const open = !!openMenus[m.key];
    const parentActive = location.pathname.startsWith(`${m.key}/`);
    return (
      <div key={m.key}>
        <div className={`radar-nav-item ${parentActive && !open ? 'active' : ''}`} onClick={() => toggleMenu(m.key)}>
          {m.icon}<span style={{ flex: 1 }}>{m.label}</span>
          <DownOutlined style={{ fontSize: 11, transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }} />
        </div>
        {open && childItems.map((c) => (
          <div key={c.key}
            className={`radar-nav-item radar-nav-sub ${location.pathname === c.key ? 'active' : ''}`}
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
        <div className="radar-brand-logo"><RadarChartOutlined /></div>
        <div>
          <div className="radar-brand-name">{brand}</div>
          <div className="radar-brand-sub">R&amp;D Management</div>
        </div>
      </div>
      <div className="radar-nav">
        {visibleMenu.map(renderNavItem)}
      </div>
      <div className="radar-sider-user">
        <Avatar size={32} icon={<UserOutlined />} style={{ background: token.colorPrimary, flexShrink: 0 }} />
        <div style={{ overflow: 'hidden' }}>
          <div className="name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
          <div className="role">{user?.roles?.map((r) => r.name).join('、') || '—'}</div>
        </div>
      </div>
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
      style={{ minWidth: 260, fontSize: 12 }}
      className="radar-rp-select"
      suffixIcon={<DownOutlined style={{ color: token.colorPrimary }} />}
      onChange={(ids) => setReleasePointIds(ids)}
      options={points.map((p) => ({
        value: p.id,
        label: `${p.release_date}${p.version_type ? ' · ' + p.version_type : ''}`,
      }))}
    />
  );

  const userMenu = {
    items: [
      { key: 'name', label: `${user?.name}（${user?.roles?.map((r) => r.name).join('、') || '—'}）`, disabled: true },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: '退出登录' },
    ],
    onClick: ({ key }) => { if (key === 'logout') useAppStore.getState().logout(); },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider className="radar-sider" width={236}
          style={{ display: 'flex', flexDirection: 'column', position: 'sticky', top: 0, height: '100vh' }}>
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{siderInner}</div>
        </Sider>
      )}

      <Layout>
        <Header className="radar-header">
          {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />}
          <div className="radar-page-title">{isMobile ? brand : currentLabel}</div>
          <div style={{ flex: 1 }} />
          <div className="radar-rp-pill" style={{ paddingRight: 2 }}>
            <RocketOutlined />
            {rpSelector}
          </div>
          <ThemeSwitcher />
          <Button type="text" shape="circle" icon={theme === 'dark' ? <BulbFilled /> : <BulbOutlined />} onClick={toggleTheme} title="切换白天/夜间" />
          <Dropdown menu={userMenu}>
            <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Avatar size="small" icon={<UserOutlined />} style={{ background: token.colorPrimary }} />
              {!isMobile && <span style={{ fontSize: 13 }}>{user?.name}</span>}
            </span>
          </Dropdown>
        </Header>

        <Content className="radar-content" style={{ margin: isMobile ? 12 : 20, overflow: 'auto hidden' }}>
          <Outlet />
        </Content>
      </Layout>

      <Drawer placement="left" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={236}
        styles={{ body: { padding: 0 }, header: { display: 'none' } }} className="radar-drawer radar-sider">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{siderInner}</div>
      </Drawer>
    </Layout>
  );
}

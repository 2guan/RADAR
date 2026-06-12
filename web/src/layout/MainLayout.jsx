/**
 * 文件：layout/MainLayout.jsx
 * 用途：主框架布局（靛蓝企业风）。深藏青固定侧边栏（品牌 + 自定义导航 + 用户）+ 白色顶栏
 *       （页面标题 / 投产窗口胶囊 / 主题切换 / 用户菜单）+ 浅色内容区 + 页脚。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import { Layout, Select, Button, Dropdown, Avatar, Drawer, Typography, Form, Input, Modal, message, theme as antdTheme } from 'antd';
import {
  MenuOutlined, BulbOutlined, BulbFilled, UserOutlined, LogoutOutlined, RocketOutlined, RadarChartOutlined, DownOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, KeyOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { useAppStore } from '../stores/app.js';
import { useResponsive } from '../hooks/useResponsive.js';
import { MENU } from '../router/menu.js';
import { apiGet, apiPost } from '../api/client.js';
import ThemeSwitcher from '../components/ThemeSwitcher.jsx';

const { Header, Sider, Content } = Layout;

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useResponsive();
  const { token } = antdTheme.useToken();
  const { user, platform, theme, toggleTheme, can, releasePointIds, setReleasePointIds } = useAppStore();

  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [points, setPoints] = useState([]);
  const [openMenus, setOpenMenus] = useState({});

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
  // 平台名称（系统设置-基础设置中维护，联动显示于品牌区与登录页）
  const platformName = platform['platform.name'] || '日常需求研发流程管理平台';

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
      filterOption={(input, option) => option.label.toLowerCase().includes(input.toLowerCase())}
      style={isMobile ? { width: 120, minWidth: 0, maxWidth: '34vw', fontSize: 12 } : { minWidth: 260, fontSize: 12 }}
      className="radar-rp-select"
      popupClassName="radar-rp-select-dropdown"
      suffixIcon={<DownOutlined style={{ color: token.colorPrimary }} />}
      onChange={(ids) => setReleasePointIds(ids)}
      options={points.map((p) => ({
        value: p.id,
        label: `${p.release_date}${p.version_type ? ' · ' + p.version_type : ''}`,
      }))}
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
          {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />}
          <div className="radar-page-title">{isMobile ? brand : currentLabel}</div>
          <div style={{ flex: 1 }} />
          <div className="radar-rp-pill" style={{ paddingRight: 2 }}>
            <RocketOutlined />
            {rpSelector}
          </div>
          <ThemeSwitcher />
          <Button type="text" shape="circle" icon={theme === 'dark' ? <BulbFilled /> : <BulbOutlined />} onClick={toggleTheme} title="切换白天/夜间" />
          {/* Global top-right profile removed */}
        </Header>

        <Content className="radar-content" style={{ margin: isMobile ? 12 : 20, overflow: 'auto hidden' }}>
          <Outlet />
        </Content>
      </Layout>

      <Drawer placement="left" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={236}
        styles={{ body: { padding: 0 }, header: { display: 'none' } }} className="radar-drawer radar-sider">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>{siderInner}</div>
      </Drawer>

      <Modal
        title="修改密码"
        open={changePwdOpen}
        onOk={handleSavePwd}
        confirmLoading={pwdSaving}
        onCancel={() => {
          setChangePwdOpen(false);
          pwdForm.resetFields();
        }}
        destroyOnClose
        okText="保存"
        cancelText="取消"
        width={400}
      >
        <Form form={pwdForm} layout="vertical" style={{ marginTop: 16 }}>
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
              { min: 6, message: '密码长度不能小于 6 位' }
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

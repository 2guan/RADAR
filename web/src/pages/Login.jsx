/**
 * 文件：pages/Login.jsx
 * 用途：登录页。读取平台公开信息渲染标题，提交登录后保存 token 并加载用户信息跳转首页。
 * 作者：hengguan
 * 说明：系统登录页面，提供账号/密码验证、登录异常提示、并自适应拉取系统主题和平台品牌名称。
 */

import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiPost, TOKEN_KEY } from '../api/client.js';
import { useAppStore } from '../stores/app.js';
import { getHomePath } from '../app.jsx';

export default function Login() {
  const navigate = useNavigate();
  const { platform, loadPlatform, loadMe, loadReleasePoint } = useAppStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadPlatform(); }, []);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const data = await apiPost('/auth/login', values);
      localStorage.setItem(TOKEN_KEY, data.token);
      const me = await loadMe();
      await loadReleasePoint();
      message.success(`欢迎回来，${data.name}`);
      const homePath = getHomePath(me?.defaultHome);
      navigate(homePath);
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false);
    }
  };

  const name = platform['platform.name'] || '日常需求研发流程管理';
  const shortName = platform['platform.shortName'] || 'RADAR';
  const fullName = platform['platform.fullName'] || '';
  const copyright = platform['platform.copyright'] || '';

  return (
    <div className="login-bg">
      {/* 动态雷达背景：同心圆 + 十字准线 + 旋转扫描波束 + 脉冲目标点（与品牌呼应） */}
      <div className="login-radar" aria-hidden="true">
        <svg viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="radarSweepGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--radar-primary)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--radar-primary)" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          <g className="radar-grid">
            <circle className="ring" cx="300" cy="300" r="90" />
            <circle className="ring" cx="300" cy="300" r="170" />
            <circle className="ring" cx="300" cy="300" r="250" />
            <circle className="ring" cx="300" cy="300" r="300" />
            <line className="cross" x1="0" y1="300" x2="600" y2="300" />
            <line className="cross" x1="300" y1="0" x2="300" y2="600" />
            <line className="cross" x1="88" y1="88" x2="512" y2="512" />
            <line className="cross" x1="512" y1="88" x2="88" y2="512" />
          </g>
          <g className="radar-sweep">
            <path d="M300 300 L300 0 A300 300 0 0 0 89.7 89.7 Z" fill="url(#radarSweepGrad)" />
            <line x1="300" y1="300" x2="300" y2="0" className="sweep-edge" />
          </g>
          <circle className="blip blip-a" cx="402" cy="206" r="4" />
          <circle className="blip blip-b" cx="214" cy="392" r="4" />
          <circle className="blip blip-c" cx="430" cy="372" r="4" />
        </svg>
      </div>
      <Card
        className="login-card"
        style={{ width: 410, maxWidth: '100%', borderRadius: 0, boxShadow: '0 24px 70px rgba(31,45,80,0.22)' }}
        styles={{ body: { padding: '38px 34px' } }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h1 className="brand-gradient" style={{ fontSize: 44, fontWeight: 800, letterSpacing: 4, lineHeight: 1.1, margin: 0 }}>
            {shortName}
          </h1>
          <Typography.Text strong style={{ fontSize: 16, display: 'block', marginTop: 8 }}>{name}</Typography.Text>
          {fullName && <div><Typography.Text type="secondary" style={{ fontSize: 12 }}>{fullName}</Typography.Text></div>}
        </div>
        <Form onFinish={onFinish} size="large" initialValues={{ phone: '', password: '' }}>
          <Form.Item name="phone" rules={[{ required: true, message: '请输入登录名/手机号' }]}>
            <Input prefix={<UserOutlined />} placeholder="登录名 / 手机号" aria-label="登录名或手机号" autoFocus />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" aria-label="密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>登 录</Button>
          </Form.Item>
        </Form>
      </Card>
      {copyright && (
        <footer className="login-footer">
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{copyright}</Typography.Text>
        </footer>
      )}
    </div>
  );
}

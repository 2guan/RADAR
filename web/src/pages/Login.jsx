/**
 * 文件：pages/Login.jsx
 * 用途：登录页。读取平台公开信息渲染标题，提交登录后保存 token 并加载用户信息跳转首页。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiPost, TOKEN_KEY } from '../api/client.js';
import { useAppStore } from '../stores/app.js';

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
      await loadMe();
      await loadReleasePoint();
      message.success(`欢迎回来，${data.name}`);
      navigate('/dashboard');
    } catch {
      // 错误已由拦截器提示
    } finally {
      setLoading(false);
    }
  };

  const name = platform['platform.name'] || '日常需求研发流程管理平台';
  const shortName = platform['platform.shortName'] || 'RADAR';
  const fullName = platform['platform.fullName'] || '';

  return (
    <div className="login-bg">
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
    </div>
  );
}

/**
 * 文件：pages/Login.jsx
 * 用途：登录页。读取平台公开信息渲染标题，提交登录后保存 token 并加载用户信息跳转首页。
 *       改进：支持验证码输入（输错2次密码后自动出现）。
 * 作者：hengguan
 * 说明：验证码通过 GET /api/auth/captcha 获取，不依赖外部服务。
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, SafetyOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiPost, apiGet, TOKEN_KEY, rawClient } from '../api/client.js';
import { useAppStore } from '../stores/app.js';
import { getHomePath } from '../app.jsx';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { platform, loadPlatform, loadMe, loadReleasePoint } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [needsCaptcha, setNeedsCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const captchaRef = useRef(null);

  useEffect(() => { loadPlatform(); }, []);

  /** 加载验证码（后端返回 SVG + token） */
  const loadCaptcha = useCallback(async () => {
    try {
      const data = await apiGet('/auth/captcha');
      setCaptchaSvg(data.captchaSvg);
      setCaptchaToken(data.captchaToken);
      // 清除旧的验证码输入
      setCaptchaAnswer('');
    } catch {
      // 静默处理
    }
  }, []);

  /** 处理登录失败，检查是否需要显示验证码 */
  const handleLoginError = useCallback(async (err) => {
    const resp = err?.response?.data;
    if (resp?.data?.needsCaptcha) {
      setNeedsCaptcha(true);
      if (resp.data.captchaToken && resp.data.captchaSvg) {
        // 验证码已随错误返回，直接使用
        setCaptchaToken(resp.data.captchaToken);
        setCaptchaSvg(resp.data.captchaSvg);
      } else {
        // 重新获取验证码
        await loadCaptcha();
      }
    }
  }, [loadCaptcha]);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      // 如果有验证码 token，一并提交
      const payload = { ...values };
      if (needsCaptcha && captchaToken) {
        payload.captchaToken = captchaToken;
        payload.captchaAnswer = captchaAnswer;
      }
      const data = await apiPost('/auth/login', payload);
      localStorage.setItem(TOKEN_KEY, data.token);
      const me = await loadMe();
      await loadReleasePoint();
      message.success(`欢迎回来，${data.name}`);

      const redirectHash = sessionStorage.getItem('radar_redirect_hash');
      const from = location.state?.from;

      if (redirectHash && redirectHash !== '#/login' && redirectHash !== '#') {
        sessionStorage.removeItem('radar_redirect_hash');
        const targetPath = redirectHash.startsWith('#') ? redirectHash.substring(1) : redirectHash;
        navigate(targetPath, { replace: true });
      } else if (from && from.pathname !== '/login') {
        navigate(from, { replace: true });
      } else {
        const homePath = getHomePath(me?.defaultHome);
        navigate(homePath, { replace: true });
      }
    } catch (err) {
      // 检查是否需要验证码
      await handleLoginError(err);
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
          {needsCaptcha && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24 }}>
              <Input
                size="large"
                placeholder="验证码"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                style={{ width: 140 }}
                prefix={<SafetyOutlined />}
              />
              <div
                ref={captchaRef}
                onClick={(e) => { e.preventDefault(); loadCaptcha(); }}
                style={{ cursor: 'pointer', lineHeight: 0, border: '1px solid var(--radar-border)', borderRadius: 2, overflow: 'hidden' }}
                dangerouslySetInnerHTML={{ __html: captchaSvg }}
                title="点击刷新验证码"
              />
            </div>
          )}
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

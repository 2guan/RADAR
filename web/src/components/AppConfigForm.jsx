/**
 * 文件：components/AppConfigForm.jsx
 * 用途：平台配置表单。按给定键集合加载 app_config 值并渲染可编辑表单，统一保存。
 *       保存后刷新全局平台信息，使标题/页脚/主题色即时生效。
 * 作者：hengguan
 * 说明：平台基础设置表单，包括系统全称、版权声明、配色主题、主责系统和开发/测试编号规则的管理配置。
 */

import React, { useEffect, useState } from 'react';
import { Form, Input, Button, message, ColorPicker, Switch, InputNumber, Row, Col, Card, Space, Tag, Alert, Select } from 'antd';
import { 
  ProjectOutlined, 
  GlobalOutlined, 
  CopyrightOutlined, 
  LockOutlined, 
  ClockCircleOutlined, 
  SafetyOutlined, 
  SafetyCertificateOutlined, 
  KeyOutlined,
  DeploymentUnitOutlined
} from '@ant-design/icons';
import { apiGet, apiPut } from '../api/client.js';
import { useAppStore } from '../stores/app.js';
import { BRAND_LOGO_SRC } from '../utils/logo.js';

export default function AppConfigForm({ mode, items }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const loadPlatform = useAppStore((s) => s.loadPlatform);

  // 监听平台信息的 Form 值（用于实时效果预览）
  const watchName = Form.useWatch('platform.name', form);
  const watchShortName = Form.useWatch('platform.shortName', form);
  const watchFullName = Form.useWatch('platform.fullName', form);
  const watchCopyright = Form.useWatch('platform.copyright', form);

  // 监听编号规则的 Form 值（用于实时生成示例预览）
  const watchReq = Form.useWatch('code.requirement', form);
  const watchDev = Form.useWatch('code.dev', form);
  const watchSIT = Form.useWatch('code.test.SIT', form);
  const watchUAT = Form.useWatch('code.test.UAT', form);
  const watchNFT = Form.useWatch('code.test.NFT', form);
  const watchSEC = Form.useWatch('code.test.SEC', form);
  const watchRelApply = Form.useWatch('code.release_apply', form);

  useEffect(() => {
    apiGet('/settings/app-config').then((rows) => {
      const map = {};
      (rows || []).forEach((r) => {
        const def = items.find((it) => it.key === r.key);
        if (def) {
          if (def.type === 'switch') {
            map[r.key] = r.value === 'true' || r.value === '1';
          } else if (def.type === 'number') {
            map[r.key] = r.value !== null && r.value !== '' ? Number(r.value) : undefined;
          } else {
            map[r.key] = r.value;
          }
        } else {
          map[r.key] = r.value;
        }
      });
      form.setFieldsValue(map);
    });
  }, [items]);

  const onSave = async () => {
    const v = await form.validateFields();
    const payload = {};
    for (const it of items) {
      let val = v[it.key];
      if (it.type === 'color' && val && typeof val === 'object') {
        val = val.toHexString();
      } else if (it.type === 'switch') {
        val = val ? 'true' : 'false';
      } else if (it.type === 'number') {
        val = val !== undefined && val !== null ? String(val) : '';
      }
      payload[it.key] = val;
    }
    setLoading(true);
    try {
      await apiPut('/settings/app-config', { items: payload });
      message.success('配置已保存');
      await loadPlatform(); // 即时生效
    } finally {
      setLoading(false);
    }
  };

  const renderFormItem = (key, customProps = {}) => {
    const it = items.find(i => i.key === key);
    if (!it) return null;

    const label = customProps.prefix ? (
      <Space size={6}>
        {customProps.prefix}
        <span>{it.label}</span>
      </Space>
    ) : it.label;

    return (
      <Form.Item
        key={it.key}
        name={it.key}
        label={label}
        extra={customProps.extra !== undefined ? customProps.extra : it.extra}
        valuePropName={it.type === 'switch' ? 'checked' : 'value'}
        style={{ marginBottom: 16, ...customProps.style }}
      >
        {it.type === 'color'
          ? <ColorPicker showText />
          : it.type === 'switch'
            ? <Switch />
            : it.type === 'number'
              ? <InputNumber style={{ width: '100%' }} placeholder={it.placeholder} min={it.min} max={it.max} />
              : it.type === 'select'
                ? <Select options={it.options || []} placeholder={it.placeholder} />
                : it.type === 'password'
                  ? <Input.Password placeholder={it.placeholder} autoComplete={it.autoComplete || 'new-password'} />
                : it.type === 'textarea'
                  ? <Input.TextArea rows={customProps.rows || 2} />
                : <Input placeholder={it.placeholder} autoComplete={it.autoComplete || 'off'} />}
      </Form.Item>
    );
  };

  const mockGenerate = (pattern, fallbackDefault) => {
    const activePattern = pattern || fallbackDefault;
    if (!activePattern) return '—';
    return activePattern
      .replace('{投产窗口}', '20260630')
      .replace('{版本年月}', '202606')
      .replace('{需求编号}', 'REQ-20260630-003')
      .replace('{序号}', '001');
  };

  // 1. 平台信息自定义布局
  if (mode === 'platform') {
    return (
      <Form form={form} layout="vertical" autoComplete="off">
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={13}>
            <div className="form-section-title">平台信息配置</div>
            <div className="form-section-card" style={{ padding: '20px 24px' }}>
              {renderFormItem('platform.name', { prefix: <ProjectOutlined style={{ color: 'var(--radar-primary)' }} /> })}
              {renderFormItem('platform.shortName', { prefix: <DeploymentUnitOutlined style={{ color: 'var(--radar-primary)' }} /> })}
              {renderFormItem('platform.fullName', { prefix: <GlobalOutlined style={{ color: 'var(--radar-primary)' }} /> })}
              {renderFormItem('platform.copyright', { prefix: <CopyrightOutlined style={{ color: 'var(--radar-primary)' }} /> })}
              
              <div style={{ marginTop: 24 }}>
                <Button type="primary" onClick={onSave} loading={loading} style={{ width: 120 }}>
                  保存配置
                </Button>
              </div>
            </div>
          </Col>

          <Col xs={24} lg={11}>
            <div className="form-section-title">效果预览</div>
            <Card
              styles={{ body: { padding: 16 } }}
              style={{
                background: 'var(--radar-primary-soft)',
                borderColor: 'var(--radar-primary-fade)',
                borderRadius: 8
              }}
            >
              {/* 侧栏 brand */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--radar-text-secondary)', marginBottom: 6, fontFamily: 'monospace' }}>
                  // 侧边栏
                </div>
                <div style={{
                  background: 'var(--radar-surface)',
                  border: '1px solid var(--radar-border)',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 6,
                  boxShadow: 'var(--radar-card-shadow)'
                }}>
                  <div className="radar-brand-logo" style={{ width: 32, height: 32, fontSize: 18, boxShadow: 'none' }}>
                    <img src={BRAND_LOGO_SRC} alt="RADAR" />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="radar-brand-name" style={{ fontSize: 15 }}>{watchShortName || 'RADAR'}</div>
                    <div className="radar-brand-sub" style={{ fontSize: 10, marginTop: 1 }} title={watchName}>{watchName || '日常需求研发流程管理'}</div>
                  </div>
                </div>
              </div>

              {/* 登录页 brand */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--radar-text-secondary)', marginBottom: 6, fontFamily: 'monospace' }}>
                  // 登录页
                </div>
                <div style={{
                  background: 'var(--radar-surface)',
                  border: '1px solid var(--radar-border)',
                  padding: '16px 14px',
                  borderRadius: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  boxShadow: 'var(--radar-card-shadow)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: 'linear-gradient(135deg, var(--radar-primary), var(--radar-primary-fade, #52C41A))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18
                    }}><img src={BRAND_LOGO_SRC} alt="RADAR" className="radar-inline-logo" /></span>
                    <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--radar-ink)' }}>{watchShortName || 'RADAR'}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--radar-ink)', marginBottom: 4 }}>
                    {watchName || '日常需求研发流程管理'}
                  </div>
                  {watchFullName && (
                    <div style={{ fontSize: 10, color: 'var(--radar-text-secondary)', marginBottom: 16, textTransform: 'uppercase' }}>
                      {watchFullName}
                    </div>
                  )}
                  <div style={{
                    borderTop: '1px dashed var(--radar-border)',
                    width: '100%',
                    paddingTop: 12,
                    fontSize: 11,
                    color: 'var(--radar-text-secondary)'
                  }}>
                    {watchCopyright || '© 2026 hengguan. All rights reserved.'}
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </Form>
    );
  }

  // 2. 编号规则自定义布局
  if (mode === 'code') {
    return (
      <Form form={form} layout="vertical" autoComplete="off">
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={15}>
            <div className="form-section-card">
              <div className="form-section-title">1. 核心单据规则</div>
              <Row gutter={16}>
                <Col span={12}>{renderFormItem('code.requirement')}</Col>
                <Col span={12}>{renderFormItem('code.dev')}</Col>
              </Row>
            </div>

            <div className="form-section-card" style={{ marginTop: 16 }}>
              <div className="form-section-title">2. 测试阶段单据规则</div>
              <Row gutter={16}>
                <Col span={12}>{renderFormItem('code.test.SIT')}</Col>
                <Col span={12}>{renderFormItem('code.test.UAT')}</Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col span={12}>{renderFormItem('code.test.NFT')}</Col>
                <Col span={12}>{renderFormItem('code.test.SEC')}</Col>
              </Row>
            </div>

            <div className="form-section-card" style={{ marginTop: 16 }}>
              <div className="form-section-title">3. 投产阶段单据规则</div>
              <Row gutter={16}>
                <Col span={12}>{renderFormItem('code.release_apply')}</Col>
              </Row>
            </div>

            <div style={{ marginTop: 20 }}>
              <Button type="primary" onClick={onSave} loading={loading} style={{ width: 120 }}>
                保存配置
              </Button>
            </div>
          </Col>

          <Col xs={24} lg={9}>
            <div className="form-section-title">编号生成效果实时预览</div>
            <Card
              styles={{ body: { padding: 14 } }}
              style={{
                background: 'var(--radar-primary-soft)',
                borderColor: 'var(--radar-primary-fade)',
                marginBottom: 12
              }}
            >
              <Row gutter={[12, 12]}>
                <Col span={12}>
                  <div style={{ fontSize: 10, color: 'var(--radar-text-secondary)', marginBottom: 2 }}>需求单号：</div>
                  <div className="code-pill" style={{ display: 'block', textAlign: 'center', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 11, padding: '2px 4px' }}>
                    {mockGenerate(watchReq, 'REQ-{投产窗口}-{序号}')}
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 10, color: 'var(--radar-text-secondary)', marginBottom: 2 }}>开发单号：</div>
                  <div className="code-pill" style={{ display: 'block', textAlign: 'center', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 11, padding: '2px 4px' }}>
                    {mockGenerate(watchDev, '{需求编号}-DEV-{序号}')}
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 10, color: 'var(--radar-text-secondary)', marginBottom: 2 }}>SIT测试单号：</div>
                  <div className="code-pill" style={{ display: 'block', textAlign: 'center', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 11, padding: '2px 4px' }}>
                    {mockGenerate(watchSIT, '{需求编号}-SIT-{序号}')}
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 10, color: 'var(--radar-text-secondary)', marginBottom: 2 }}>UAT测试单号：</div>
                  <div className="code-pill" style={{ display: 'block', textAlign: 'center', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 11, padding: '2px 4px' }}>
                    {mockGenerate(watchUAT, '{需求编号}-UAT-{序号}')}
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 10, color: 'var(--radar-text-secondary)', marginBottom: 2 }}>NFT测试单号：</div>
                  <div className="code-pill" style={{ display: 'block', textAlign: 'center', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 11, padding: '2px 4px' }}>
                    {mockGenerate(watchNFT, '{需求编号}-NFT-{序号}')}
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 10, color: 'var(--radar-text-secondary)', marginBottom: 2 }}>SEC测试单号：</div>
                  <div className="code-pill" style={{ display: 'block', textAlign: 'center', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 11, padding: '2px 4px' }}>
                    {mockGenerate(watchSEC, '{需求编号}-SEC-{序号}')}
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 10, color: 'var(--radar-text-secondary)', marginBottom: 2 }}>投产变更单号：</div>
                  <div className="code-pill" style={{ display: 'block', textAlign: 'center', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: 11, padding: '2px 4px' }}>
                    {mockGenerate(watchRelApply, '{版本年月}-10bg{序号}')}
                  </div>
                </Col>
              </Row>
            </Card>

            <Alert
              type="info"
              showIcon
              message="占位符说明"
              description={
                <div style={{ fontSize: 11, lineHeight: '1.6' }}>
                  规则输入框中可使用以下花括号占位符：
                  <ul style={{ paddingLeft: 16, margin: '4px 0 0' }}>
                    <li><strong>{"{投产窗口}"}</strong>：如 `20260630`</li>
                    <li><strong>{"{版本年月}"}</strong>：如 `202606`</li>
                    <li><strong>{"{需求编号}"}</strong>：如 `REQ-20260630-003`</li>
                    <li><strong>{"{序号}"}</strong>：流水序号，如 `001`</li>
                  </ul>
                </div>
              }
            />
          </Col>
        </Row>
      </Form>
    );
  }

  // 3. 安全规则自定义布局
  if (mode === 'security') {
    return (
      <Form form={form} layout="vertical" autoComplete="off">
        <Row gutter={[24, 24]}>
          <Col xs={24} md={12}>
            <div className="form-section-card" style={{ height: '100%', padding: '20px 24px' }}>
              <div className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <KeyOutlined style={{ color: 'var(--radar-primary)' }} />
                <span>密码强度与有效期策略</span>
              </div>
              {renderFormItem('security.password.complexity')}
              {renderFormItem('security.password.minLength')}
              {renderFormItem('security.password.expireDays')}
            </div>
          </Col>

          <Col xs={24} md={12}>
            <div className="form-section-card" style={{ height: '100%', padding: '20px 24px' }}>
              <div className="form-section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
                <SafetyCertificateOutlined style={{ color: 'var(--radar-primary)' }} />
                <span>账户防爆破与解锁策略</span>
              </div>
              {renderFormItem('security.lockout.enabled')}
              {renderFormItem('security.lockout.maxAttempts')}
              {renderFormItem('security.lockout.durationMinutes')}
            </div>
          </Col>
        </Row>

        <div style={{ marginTop: 24 }}>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Alert
              message="安全提示"
              description="本系统的安全规则配置修改并保存后，将即时应用于系统的登录校验 and 密码更新规则。为了满足企业级信息安全防范标准，建议开启密码复杂度校验并配置登录失败锁定。"
              type="warning"
              showIcon
            />
            <div>
              <Button type="primary" onClick={onSave} loading={loading} style={{ width: 120 }}>
                保存配置
              </Button>
            </div>
          </Space>
        </div>
      </Form>
    );
  }

  // 默认平铺降级布局
  return (
    <Form form={form} layout="vertical" autoComplete="off" style={{ maxWidth: 560 }}>
      {items.map((it) => renderFormItem(it.key))}
      <Button type="primary" onClick={onSave} loading={loading}>保存</Button>
    </Form>
  );
}

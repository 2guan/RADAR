/**
 * 文件：components/AppConfigForm.jsx
 * 用途：平台配置表单。按给定键集合加载 app_config 值并渲染可编辑表单，统一保存。
 *       保存后刷新全局平台信息，使标题/页脚/主题色即时生效。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import { Form, Input, Button, message, ColorPicker } from 'antd';
import { apiGet, apiPut } from '../api/client.js';
import { useAppStore } from '../stores/app.js';

export default function AppConfigForm({ items }) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const loadPlatform = useAppStore((s) => s.loadPlatform);

  useEffect(() => {
    apiGet('/settings/app-config').then((rows) => {
      const map = {};
      (rows || []).forEach((r) => { map[r.key] = r.value; });
      form.setFieldsValue(map);
    });
  }, []);

  const onSave = async () => {
    const v = await form.validateFields();
    // ColorPicker 返回对象，统一转 hex
    const payload = {};
    for (const it of items) {
      let val = v[it.key];
      if (it.type === 'color' && val && typeof val === 'object') val = val.toHexString();
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

  return (
    <Form form={form} layout="vertical" style={{ maxWidth: 560 }}>
      {items.map((it) => (
        <Form.Item key={it.key} name={it.key} label={it.label} extra={it.extra}>
          {it.type === 'color'
            ? <ColorPicker showText />
            : it.type === 'textarea'
              ? <Input.TextArea rows={2} />
              : <Input placeholder={it.placeholder} />}
        </Form.Item>
      ))}
      <Button type="primary" onClick={onSave} loading={loading}>保存</Button>
    </Form>
  );
}

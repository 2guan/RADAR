/**
 * 文件：pages/pams/PamsPlaceholder.jsx
 * 用途：PAMS 逐页迁移期间的页面骨架。先接通路由、顶部菜单与独立数据库状态。
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Descriptions, Space, Tag, Typography, message } from 'antd';
import { DatabaseOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { apiGet } from '../../api/client.js';
import { PAMS_TOP_MENU } from '../../router/menu.js';

const { Text } = Typography;

function flattenMenu() {
  const items = [];
  for (const m of PAMS_TOP_MENU) {
    if (m.children) items.push(...m.children);
    else items.push(m);
  }
  return items;
}

export default function PamsPlaceholder() {
  const location = useLocation();
  const [meta, setMeta] = useState(null);

  const page = useMemo(() => {
    return flattenMenu().find((item) => item.key === location.pathname) || { label: 'PAMS 问题管理' };
  }, [location.pathname]);

  useEffect(() => {
    apiGet('/pams/meta')
      .then(setMeta)
      .catch((err) => message.error(err?.message || '读取 PAMS 数据库状态失败'));
  }, []);

  return (
    <Card
      title={
        <Space>
          <DatabaseOutlined />
          <span>{page.label}</span>
          <Tag color="blue" style={{ borderRadius: 0 }}>迁移中</Tag>
        </Space>
      }
      variant="borderless"
    >
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="页面状态">
          <Text>路由、顶部菜单、权限入口和独立 PAMS 数据库已接通，下一步会按原 PAMS 页面逐个替换。</Text>
        </Descriptions.Item>
        <Descriptions.Item label="数据库文件">
          <Text code>{meta?.dbFile || '加载中...'}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="数据概览">
          {meta?.counts
            ? Object.entries(meta.counts).map(([key, value]) => (
              <Tag key={key} style={{ borderRadius: 0, marginBottom: 4 }}>{key}: {value}</Tag>
            ))
            : '加载中...'}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

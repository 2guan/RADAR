/**
 * 文件：components/HistoryDrawer.jsx
 * 用途：变更历史弹窗。展示某业务记录的历史编辑记录（用户、修改栏位、修改前后内容、时间）。
 *       采用页面居中弹窗（Modal）而非右侧抽屉，避免遮挡过多内容。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import { Modal, Timeline, Tag, Empty, Spin, Typography } from 'antd';
import { apiGet } from '../api/client.js';

export default function HistoryDrawer({ open, onClose, entityType, entityId }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !entityId) return;
    setLoading(true);
    apiGet('/audit', { entityType, entityId })
      .then((rows) => setList(rows || []))
      .finally(() => setLoading(false));
  }, [open, entityType, entityId]);

  const actionTag = (a) => ({
    create: <Tag color="green">新建</Tag>,
    update: <Tag color="blue">修改</Tag>,
    delete: <Tag color="red">删除</Tag>,
  }[a] || <Tag>{a}</Tag>);

  return (
    <Modal
      title="历史编辑记录"
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnHidden
      styles={{ body: { maxHeight: '60vh', overflowY: 'auto', paddingTop: 12 } }}
    >
      {loading ? <Spin /> : (
        list.length === 0 ? <Empty description="暂无变更记录" /> : (
          <Timeline
            items={list.map((r) => ({
              children: (
                <div>
                  <div style={{ marginBottom: 4 }}>
                    {actionTag(r.action)}
                    <Typography.Text strong>{r.field || '记录'}</Typography.Text>
                    <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {r.operator || '—'} · {r.created_at}
                    </Typography.Text>
                  </div>
                  {r.action === 'update' && (
                    <div style={{ fontSize: 13 }}>
                      <Typography.Text delete type="secondary">{r.old_value || '空'}</Typography.Text>
                      <span style={{ margin: '0 6px' }}>→</span>
                      <Typography.Text>{r.new_value || '空'}</Typography.Text>
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        )
      )}
    </Modal>
  );
}

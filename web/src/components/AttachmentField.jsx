/**
 * 文件：components/AttachmentField.jsx
 * 用途：附件字段组件。支持"上传文件"与"填写路径"两种方式并存，列出已有附件、下载、删除。
 * 作者：hengguan
 * 说明：需先保存主记录拿到 entityId 后方可管理附件；下载走 blob 触发浏览器保存。
 */

import React, { useEffect, useState } from 'react';
import { Upload, Button, Input, Space, List, Tag, Popconfirm, message } from 'antd';
import { UploadOutlined, LinkOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { apiGet, apiPost, apiDelete, rawClient, TOKEN_KEY } from '../api/client.js';

export default function AttachmentField({ entityType, entityId, fieldKey, readOnly }) {
  const [list, setList] = useState([]);
  const [pathText, setPathText] = useState('');

  const reload = async () => {
    if (!entityId) { setList([]); return; }
    const rows = await apiGet('/attachments', { entityType, entityId });
    setList((rows || []).filter((a) => a.field_key === fieldKey));
  };
  useEffect(() => { reload(); }, [entityId, fieldKey]);

  if (!entityId) {
    return <Tag className="status-tag status-tag-error">保存记录后可管理附件</Tag>;
  }

  // 上传文件
  const customUpload = async ({ file, onSuccess, onError }) => {
    const fd = new FormData();
    fd.append('entityType', entityType);
    fd.append('entityId', String(entityId));
    fd.append('fieldKey', fieldKey);
    fd.append('file', file);
    try {
      await rawClient.post('/attachments/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      });
      message.success('上传成功');
      onSuccess?.();
      reload();
    } catch (e) {
      onError?.(e);
    }
  };

  // 添加路径
  const addPath = async () => {
    if (!pathText.trim()) return;
    await apiPost('/attachments/path', { entityType, entityId, fieldKey, pathText: pathText.trim() });
    setPathText('');
    reload();
  };

  // 下载
  const download = async (a) => {
    const resp = await rawClient.get(`/attachments/${a.id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(resp.data);
    const link = document.createElement('a');
    link.href = url; link.download = a.filename || 'file';
    link.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (a) => { await apiDelete(`/attachments/${a.id}`); reload(); };

  return (
    <div>
      <List
        size="small"
        locale={{ emptyText: '暂无附件/路径' }}
        dataSource={list}
        renderItem={(a) => (
          <List.Item
            actions={readOnly ? [] : [
              a.kind === 'file'
                ? <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => download(a)}>下载</Button>
                : null,
              <Popconfirm title="确认删除？" onConfirm={() => remove(a)}>
                <Button type="link" size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>,
            ].filter(Boolean)}
          >
            {a.kind === 'file'
              ? <Space><Tag className="tag-file">文件</Tag>{a.filename}</Space>
              : <Space><Tag className="tag-path">路径</Tag>{a.path_text}</Space>}
          </List.Item>
        )}
      />
      {!readOnly && (
        <Space.Compact style={{ width: '100%', marginTop: 8 }}>
          <Input
            placeholder="填写文件路径，如 \\\\server\\share\\file.docx"
            value={pathText} onChange={(e) => setPathText(e.target.value)} onPressEnter={addPath}
            prefix={<LinkOutlined />}
          />
          <Button onClick={addPath}>添加路径</Button>
          <Upload customRequest={customUpload} showUploadList={false}>
            <Button icon={<UploadOutlined />}>上传文件</Button>
          </Upload>
        </Space.Compact>
      )}
    </div>
  );
}

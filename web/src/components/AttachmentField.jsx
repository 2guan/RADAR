/**
 * 文件：components/AttachmentField.jsx
 * 用途：附件字段组件。支持"上传文件"与"填写路径"两种方式并存，列出已有附件、下载、删除。
 * 作者：hengguan
 * 说明：需先保存主记录拿到 entityId 后方可管理附件；下载走 blob 触发浏览器保存。
 */

import React, { useEffect, useState } from 'react';
import { Upload, Button, Input, Space, List, Tag, Popconfirm, message, Modal } from 'antd';
import { UploadOutlined, LinkOutlined, DownloadOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { apiGet, apiPost, apiDelete, rawClient, TOKEN_KEY } from '../api/client.js';

export default function AttachmentField({ entityType, entityId, fieldKey, readOnly, inputMode = 'both' }) {
  const [list, setList] = useState([]);
  const [pathText, setPathText] = useState('');
  const allowFile = inputMode !== 'path';
  const allowPath = inputMode !== 'file';

  // 弹窗编辑路径状态
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editText, setEditText] = useState('');

  const reload = async () => {
    if (!entityId) { setList([]); return; }
    const rows = await apiGet('/attachments', { entityType, entityId });
    setList((rows || []).filter((a) => a.field_key === fieldKey));
  };
  useEffect(() => { reload(); }, [entityId, fieldKey]);

  if (!entityId) {
    return <Tag className="status-tag status-tag-error" style={{ fontSize: 11 }}>保存记录后可管理附件</Tag>;
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

  const handleEditPathClick = (item) => {
    if (readOnly) return;
    setEditingItem(item);
    setEditText(item.path_text || '');
    setEditOpen(true);
  };

  return (
    <div>
      {list.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', padding: '4px 0' }}>暂无附件/路径</div>
      ) : (
        <List
          size="small"
          dataSource={list}
          renderItem={(a) => (
            <List.Item
              style={{ padding: '3px 0' }}
              actions={[
                a.kind === 'file' ? (
                  <Button key="dl" type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 11 }} icon={<DownloadOutlined style={{ fontSize: 11 }} />} onClick={() => download(a)} />
                ) : null,
                (a.kind === 'path' && !readOnly) ? (
                  <Button key="edit" type="link" size="small" style={{ padding: 0, height: 'auto', fontSize: 11 }} icon={<EditOutlined style={{ fontSize: 11 }} />} onClick={() => handleEditPathClick(a)} />
                ) : null,
                !readOnly ? (
                  <Popconfirm key="del" title="确认删除？" onConfirm={() => remove(a)}>
                    <Button type="link" size="small" danger style={{ padding: 0, height: 'auto', fontSize: 11 }} icon={<DeleteOutlined style={{ fontSize: 11 }} />} />
                  </Popconfirm>
                ) : null,
              ].filter(Boolean)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flex: 1, minWidth: 0 }}>
                {a.kind === 'file' ? (
                  <>
                    <Tag className="tag-file" style={{ borderRadius: 2, margin: 0, fontSize: 10, padding: '0 4px', height: 18, lineHeight: '16px', flexShrink: 0 }}>文件</Tag>
                    <span style={{
                      fontSize: 11,
                      lineHeight: '14px',
                      color: 'var(--radar-ink)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      wordBreak: 'break-all',
                      flex: 1,
                    }}>
                      {a.filename}
                    </span>
                  </>
                ) : (
                  <>
                    <Tag className="tag-path" style={{ borderRadius: 2, margin: 0, fontSize: 10, padding: '0 4px', height: 18, lineHeight: '16px', flexShrink: 0 }}>路径</Tag>
                    <span
                      style={{
                        fontSize: 11,
                        lineHeight: '14px',
                        color: 'var(--radar-ink)',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'break-all',
                        flex: 1,
                      }}
                    >
                      {a.path_text}
                    </span>
                  </>
                )}
              </div>
            </List.Item>
          )}
        />
      )}
      {!readOnly && (
        <div style={{ display: 'flex', width: '100%', marginTop: 8 }}>
          {allowFile && (
            <Upload customRequest={customUpload} showUploadList={false} style={{ flexShrink: 0 }}>
              <Button size="small" icon={<UploadOutlined style={{ fontSize: 11 }} />} style={{ fontSize: 11, borderTopLeftRadius: 2, borderBottomLeftRadius: 2, borderTopRightRadius: allowPath ? 0 : 2, borderBottomRightRadius: allowPath ? 0 : 2, height: 24 }}>上传文件</Button>
            </Upload>
          )}
          {allowPath && (
            <>
              <Button size="small" onClick={addPath} style={{ flexShrink: 0, fontSize: 11, borderTopLeftRadius: allowFile ? 0 : 2, borderBottomLeftRadius: allowFile ? 0 : 2, borderTopRightRadius: 0, borderBottomRightRadius: 0, height: 24, borderLeft: allowFile ? 0 : undefined }}>添加路径</Button>
              <Input
                placeholder="填写文件路径，如 \\\\server\\share\\file.docx"
                value={pathText} onChange={(e) => setPathText(e.target.value)} onPressEnter={addPath}
                prefix={<LinkOutlined style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }} />}
                size="small"
                style={{ flex: 1, fontSize: 11, borderTopRightRadius: 2, borderBottomRightRadius: 2, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 24, borderLeft: 0 }}
              />
            </>
          )}
        </div>
      )}

      {/* 修改路径弹窗 */}
      <Modal
        open={editOpen}
        title="修改路径"
        onCancel={() => setEditOpen(false)}
        onOk={async () => {
          if (!editingItem) return;
          try {
            await apiPost('/attachments/edit-path', { id: editingItem.id, pathText: editText.trim() });
            message.success('路径已修改');
            setEditOpen(false);
            reload();
          } catch (e) {
            message.error(e.message || '修改失败');
          }
        }}
        width={500}
        destroyOnHidden
        okText="确认"
        cancelText="取消"
      >
        <div style={{ padding: '12px 0' }}>
          <Input
            placeholder="请输入新的文件路径"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            style={{ fontSize: 12 }}
            size="small"
          />
        </div>
      </Modal>
    </div>
  );
}

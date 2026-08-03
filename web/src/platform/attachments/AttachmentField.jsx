/**
 * 文件：web/src/platform/attachments/AttachmentField.jsx
 * 说明：统一交付件仅展示当前版本，并复用附件平台的版本、预览、下载和软删除接口。
 * 用途：所有 StageContentPanel 交付件区域的附件/路径交互组件。
 * 作者：hengguan
 */

import { useCallback, useEffect, useState } from 'react';
import { App, Upload, Button, Input, List, Tag, Popconfirm, Modal, Space, Tooltip } from 'antd';
import {
  UploadOutlined, LinkOutlined, DownloadOutlined, DeleteOutlined, EyeOutlined, HistoryOutlined, SyncOutlined,
} from '@ant-design/icons';
import { apiGet, apiPost, apiDelete, rawClient, TOKEN_KEY } from '../api.js';
import { formatBeijingShortDateTime } from '../../shared/utils/index.js';

const attachmentCache = new Map();
const attachmentRequests = new Map();
let previewAvailability;
let previewAvailabilityRequest;
const attachmentCacheKey = (entityType, entityId) => `${entityType || ''}:${entityId || ''}`;
const fileExtension = (filename) => `.${String(filename || '').split('.').pop()?.toLowerCase()}`;
const previewable = (filename, extensions) => extensions.includes(fileExtension(filename));

async function loadPreviewAvailability() {
  if (previewAvailability !== undefined) return previewAvailability;
  if (!previewAvailabilityRequest) {
    previewAvailabilityRequest = apiGet('/attachments/preview-availability')
      .then((value) => {
        previewAvailability = {
          enabled: Boolean(value?.enabled),
          extensions: Array.isArray(value?.extensions) ? value.extensions.map((ext) => String(ext).toLowerCase()) : [],
        };
        return previewAvailability;
      })
      .catch(() => ({ enabled: false, extensions: [] }))
      .finally(() => { previewAvailabilityRequest = null; });
  }
  return previewAvailabilityRequest;
}

/** 同一记录下的多个交付件共用附件列表，避免每张交付件卡片重复请求同一接口。 */
async function loadEntityAttachments(entityType, entityId, { force = false } = {}) {
  if (!entityId) return [];
  const key = attachmentCacheKey(entityType, entityId);
  if (force) {
    attachmentCache.delete(key);
    attachmentRequests.delete(key);
  }
  if (attachmentCache.has(key)) return attachmentCache.get(key);
  if (attachmentRequests.has(key)) return attachmentRequests.get(key);
  const pending = apiGet('/attachments', { entityType, entityId })
    .then((rows) => {
      const normalized = rows || [];
      attachmentCache.set(key, normalized);
      return normalized;
    })
    .finally(() => attachmentRequests.delete(key));
  attachmentRequests.set(key, pending);
  return pending;
}

function attachmentName(item) {
  return item.kind === 'file' ? item.filename : item.path_text;
}

/** 页面只展示提交时间，不展示不参与用户决策的手机号掩码。 */
function formatUploadTime(value) {
  return formatBeijingShortDateTime(value);
}

function CompactAttachmentTitle({ item, actions }) {
  const name = attachmentName(item);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <Tag className={item.kind === 'file' ? 'tag-file' : 'tag-path'} style={{ borderRadius: 2, margin: 0, fontSize: 10 }}>
        {item.kind === 'file' ? '文件' : '路径'}
      </Tag>
      <span
        title={name}
        style={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 12, lineHeight: '20px' }}
      >
        {name}
      </span>
      <Space size={0} style={{ flexShrink: 0 }}>{actions}</Space>
    </div>
  );
}

function VersionHistoryItem({ item, onDownload, onPreview, previewEnabled, previewExtensions }) {
  const name = attachmentName(item);
  return (
    <List.Item style={{ padding: '4px 0', alignItems: 'stretch' }}>
      <div style={{ minWidth: 0, width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto minmax(0, 1fr) auto', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <Tag className={item.kind === 'file' ? 'tag-file' : 'tag-path'} style={{ borderRadius: 2, margin: 0, fontSize: 10 }}>
            {item.kind === 'file' ? '文件' : '路径'}
          </Tag>
          <Tag style={{ margin: 0, fontSize: 10 }}>V{item.version_no}</Tag>
          <span title={name} style={{ minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: 12, lineHeight: '20px' }}>{name}</span>
          {item.kind === 'file' && item.is_deleted === 0 && (
            <Space size={0} style={{ flexShrink: 0 }}>
              {previewEnabled && previewable(item.filename, previewExtensions) && <Tooltip title="在线预览"><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => onPreview(item)} aria-label="在线预览" style={{ padding: '0 4px', height: 20 }} /></Tooltip>}
              <Tooltip title="下载此版本"><Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => onDownload(item)} aria-label="下载此版本" style={{ padding: '0 4px', height: 20 }} /></Tooltip>
            </Space>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, marginTop: 1, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
          <span>{item.uploader_name || item.uploader || '历史导入'}</span>
          {item.upload_time && <span>{formatUploadTime(item.upload_time)}</span>}
          {item.is_current === 1 && item.is_deleted === 0 && <Tag color="processing" style={{ margin: 0, fontSize: 10 }}>当前</Tag>}
          {item.is_deleted === 1 && <Tag color="default" style={{ margin: 0, fontSize: 10 }}>已删除</Tag>}
        </div>
      </div>
    </List.Item>
  );
}

export default function AttachmentField({ entityType, entityId, fieldKey, deliverableId, readOnly, inputMode = 'both' }) {
  const { message } = App.useApp();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(!!entityId);
  const [pathText, setPathText] = useState('');
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [previewExtensions, setPreviewExtensions] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [editText, setEditText] = useState('');
  const [versionItem, setVersionItem] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const allowFile = inputMode !== 'path';
  const allowPath = inputMode !== 'file';
  const validateUploadFile = (file) => {
    if (!previewExtensions.length || previewable(file?.name, previewExtensions)) return true;
    message.error('不支持的文件类型，请上传系统允许的交付件文件');
    return Upload.LIST_IGNORE;
  };

  const reload = useCallback(async ({ force = false } = {}) => {
    if (!entityId) { setList([]); setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await loadEntityAttachments(entityType, entityId, { force });
      setList((rows || []).filter((a) => {
        if (!deliverableId) return a.field_key === fieldKey;
        return Number(a.deliverable_id) === Number(deliverableId)
          || (!a.deliverable_id && a.field_key === fieldKey);
      }));
    } finally {
      setLoading(false);
    }
  }, [deliverableId, entityId, entityType, fieldKey]);

  useEffect(() => { reload().catch(() => setLoading(false)); }, [reload]);
  useEffect(() => {
    const applyPreviewConfiguration = (settings) => {
      setPreviewEnabled(Boolean(settings?.enabled));
      setPreviewExtensions(settings?.extensions || []);
    };
    const refreshPreviewAvailability = () => {
      previewAvailability = undefined;
      loadPreviewAvailability().then(applyPreviewConfiguration);
    };
    loadPreviewAvailability().then(applyPreviewConfiguration);
    window.addEventListener('radar:deliverable-preview-config-updated', refreshPreviewAvailability);
    return () => window.removeEventListener('radar:deliverable-preview-config-updated', refreshPreviewAvailability);
  }, []);

  if (!entityId) {
    return <Tag className="status-tag status-tag-error" style={{ fontSize: 11 }}>保存记录后可管理附件</Tag>;
  }

  const customUpload = async ({ file, onSuccess, onError }) => {
    const fd = new FormData();
    fd.append('entityType', entityType);
    fd.append('entityId', String(entityId));
    if (fieldKey) fd.append('fieldKey', fieldKey);
    if (deliverableId) fd.append('deliverableId', String(deliverableId));
    fd.append('file', file);
    try {
      await rawClient.post('/attachments/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      });
      message.success('已上传为新的交付件');
      onSuccess?.();
      await reload({ force: true });
    } catch (error) {
      onError?.(error);
    }
  };

  const uploadNewVersion = (item) => async ({ file, onSuccess, onError }) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await rawClient.post(`/attachments/${item.id}/versions`, fd, {
        headers: { 'Content-Type': 'multipart/form-data', Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      });
      message.success('已生成新版本');
      onSuccess?.();
      await reload({ force: true });
    } catch (error) {
      onError?.(error);
    }
  };

  const addPath = async () => {
    if (!pathText.trim()) return;
    await apiPost('/attachments/path', { entityType, entityId, fieldKey, deliverableId, pathText: pathText.trim() });
    setPathText('');
    message.success('已新增路径交付件');
    await reload({ force: true });
  };

  const download = async (item) => {
    const resp = await rawClient.get(`/attachments/${item.id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(resp.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = item.filename || 'file';
    link.click();
    URL.revokeObjectURL(url);
  };

  const openVersions = async (item) => {
    setVersionItem(item);
    setVersionsLoading(true);
    try { setVersions(await apiGet(`/attachments/${item.id}/versions`)); } catch (error) { message.error(error.message || '加载版本历史失败'); } finally { setVersionsLoading(false); }
  };

  const openPreview = async (item) => {
    setPreviewLoading(true);
    try {
      const session = await apiPost(`/attachments/${item.id}/preview-session`);
      setPreview({ ...session, filename: item.filename });
    } catch (error) {
      message.error(error.message || '预览服务暂不可用');
    } finally {
      setPreviewLoading(false);
    }
  };

  const openHistoricalPreview = async (item) => {
    if (!previewEnabled) return;
    setVersionItem(null);
    await openPreview(item);
  };

  const remove = async (item) => {
    await apiDelete(`/attachments/${item.id}`);
    message.success('交付件及其版本历史已删除');
    await reload({ force: true });
  };

  const savePathVersion = async () => {
    if (!editingItem || !editText.trim()) return;
    await apiPost(`/attachments/${editingItem.id}/path-versions`, { pathText: editText.trim() });
    message.success('已生成新路径版本');
    setEditingItem(null);
    await reload({ force: true });
  };

  return (
    <div>
      {loading ? (
        <div style={{ minHeight: 24, fontSize: 11, color: 'var(--radar-text-secondary)', padding: '4px 0' }}>正在加载附件/路径…</div>
      ) : list.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', padding: '4px 0' }}>暂无附件/路径</div>
      ) : (
        <List
          size="small"
          dataSource={list}
          renderItem={(item) => (
            <List.Item style={{ padding: '4px 0', alignItems: 'stretch' }}>
              <div style={{ minWidth: 0, width: '100%' }}>
                <CompactAttachmentTitle
                  item={item}
                  actions={[
                    previewEnabled && item.kind === 'file' && previewable(item.filename, previewExtensions) ? (
                      <Tooltip title="在线预览" key="preview"><Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openPreview(item)} loading={previewLoading} aria-label="在线预览" style={{ padding: '0 4px', height: 20 }} /></Tooltip>
                    ) : null,
                    item.kind === 'file' ? (
                      <Tooltip title="下载当前版本" key="download"><Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => download(item)} aria-label="下载当前版本" style={{ padding: '0 4px', height: 20 }} /></Tooltip>
                    ) : null,
                    !readOnly ? (
                      <Popconfirm key="delete" title="删除此交付件？其全部版本将不再可下载或预览。" onConfirm={() => remove(item)} okText="删除" cancelText="取消">
                        <Tooltip title="删除交付件"><Button type="link" size="small" danger icon={<DeleteOutlined />} aria-label="删除交付件" style={{ padding: '0 4px', height: 20 }} /></Tooltip>
                      </Popconfirm>
                    ) : null,
                  ].filter(Boolean)}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, marginTop: 1, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                  <span>{item.uploader_name || item.uploader || '历史导入'}</span>
                  {item.upload_time && <span>{formatUploadTime(item.upload_time)}</span>}
                  <Space size={0} style={{ marginLeft: 'auto', flexShrink: 0 }}>
                    {!readOnly && (
                      item.kind === 'file' ? (
                        <Upload accept={previewExtensions.join(',') || undefined} beforeUpload={validateUploadFile} customRequest={uploadNewVersion(item)} showUploadList={false}>
                          <Tooltip title="上传新版本"><Button type="link" size="small" icon={<SyncOutlined style={{ fontSize: 14 }} />} aria-label="上传新版本" style={{ padding: '0 4px', height: 20, fontSize: 12 }}>更新文件</Button></Tooltip>
                        </Upload>
                      ) : (
                        <Tooltip title="更新路径"><Button type="link" size="small" icon={<SyncOutlined style={{ fontSize: 14 }} />} onClick={() => { setEditingItem(item); setEditText(item.path_text || ''); }} aria-label="更新路径" style={{ padding: '0 4px', height: 20, fontSize: 12 }}>更新路径</Button></Tooltip>
                      )
                    )}
                    <Tooltip title="查看全部版本"><Button type="link" size="small" icon={<HistoryOutlined style={{ fontSize: 14 }} />} onClick={() => openVersions(item)} aria-label="版本历史" style={{ padding: '0 4px', height: 20, fontSize: 12 }}>历史版本</Button></Tooltip>
                  </Space>
                </div>
              </div>
            </List.Item>
          )}
        />
      )}

      {!readOnly && (
        <div style={{ display: 'flex', width: '100%', marginTop: 8 }}>
          {allowFile && (
            <Upload accept={previewExtensions.join(',') || undefined} beforeUpload={validateUploadFile} customRequest={customUpload} showUploadList={false} style={{ flexShrink: 0 }}>
              <Button size="small" icon={<UploadOutlined />} style={{ fontSize: 11, borderTopRightRadius: allowPath ? 0 : 2, borderBottomRightRadius: allowPath ? 0 : 2, height: 24 }}>上传文件</Button>
            </Upload>
          )}
          {allowPath && (
            <>
              <Button size="small" onClick={addPath} style={{ flexShrink: 0, fontSize: 11, borderTopLeftRadius: allowFile ? 0 : 2, borderBottomLeftRadius: allowFile ? 0 : 2, borderTopRightRadius: 0, borderBottomRightRadius: 0, height: 24, borderLeft: allowFile ? 0 : undefined }}>添加路径</Button>
              <Input
                placeholder="填写文件路径，如 \\server\share\file.docx"
                value={pathText} onChange={(event) => setPathText(event.target.value)} onPressEnter={addPath}
                prefix={<LinkOutlined style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }} />}
                size="small"
                style={{ flex: 1, fontSize: 11, borderTopRightRadius: 2, borderBottomRightRadius: 2, borderTopLeftRadius: 0, borderBottomLeftRadius: 0, height: 24, borderLeft: 0 }}
              />
            </>
          )}
        </div>
      )}

      <Modal open={Boolean(editingItem)} title="更新路径（生成新版本）" onCancel={() => setEditingItem(null)} onOk={savePathVersion} okText="生成新版本" cancelText="取消" width={500} destroyOnHidden>
        <Input placeholder="请输入新的文件路径" value={editText} onChange={(event) => setEditText(event.target.value)} />
      </Modal>

      <Modal
        open={Boolean(versionItem)}
        title="交付件版本历史"
        onCancel={() => setVersionItem(null)}
        footer={null}
        width={560}
        destroyOnHidden
        styles={{ body: { maxHeight: '56vh', overflowY: 'auto', paddingTop: 4 } }}
      >
        <List loading={versionsLoading} dataSource={versions} locale={{ emptyText: '暂无版本历史' }} renderItem={(item) => <VersionHistoryItem item={item} onDownload={download} onPreview={openHistoricalPreview} previewEnabled={previewEnabled} previewExtensions={previewExtensions} />} />
      </Modal>

      <Modal open={Boolean(preview)} title={`预览：${preview?.filename || ''}`} onCancel={() => setPreview(null)} footer={null} width="min(1120px, 94vw)" destroyOnHidden>
        {preview?.previewUrl && <iframe title={`预览 ${preview.filename}`} src={preview.previewUrl} style={{ width: '100%', height: '72vh', border: 0 }} />}
      </Modal>
    </div>
  );
}

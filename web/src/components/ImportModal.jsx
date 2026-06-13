/**
 * 文件：components/ImportModal.jsx
 * 用途：统一数据导入弹窗组件。支持模板下载、导入模式选择（跳过/覆盖/回滚）、
 *       拖拽上传以及详细的导入结果展示（新增、更新、失败、跳过）。
 * 作者：hengguan
 * 说明：提供模板下载、Excel 拖拽上传、在线预览与错误字段高亮提示的批量导入弹出框。
 */

import React, { useState } from 'react';
import { Modal, Radio, Upload, Button, Alert, Tabs, Space, Table, Tag } from 'antd';
import { InboxOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { importXlsx, downloadGet } from '../utils/io.js';

const { Dragger } = Upload;

export default function ImportModal({
  open,
  onCancel,
  onSuccess,
  importUrl,
  templateUrl,
  templateFilename = 'template.xlsx',
  extraFields = {},
}) {
  const [mode, setMode] = useState('overwrite'); // skip, overwrite, rollback
  const [fileList, setFileList] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null); // { stat, details }

  // 下载导入模板
  const handleDownloadTemplate = async () => {
    try {
      await downloadGet(templateUrl, extraFields, templateFilename);
    } catch (err) {
      console.error(err);
    }
  };

  // 开始执行导入
  const handleUpload = async () => {
    if (fileList.length === 0) return;
    setUploading(true);
    try {
      const data = await importXlsx(importUrl, fileList[0], mode, extraFields);
      setResult(data);
    } catch (err) {
      // 错误一般已经在 Axios 拦截器里处理或报错
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  // 确定关闭并刷新
  const handleOk = () => {
    setResult(null);
    setFileList([]);
    setMode('overwrite');
    if (onSuccess) {
      onSuccess();
    }
    onCancel();
  };

  // 重置状态重新导入
  const handleReset = () => {
    setResult(null);
    setFileList([]);
  };

  // 渲染导入结果
  const renderResult = () => {
    if (!result) return null;
    const { stat, details = [] } = result;

    const insertedList = details.filter(item => item.action === 'insert' && item.status === 'success');
    const updatedList = details.filter(item => item.action === 'update' && item.status === 'success');
    const failedList = details.filter(item => item.status === 'fail');
    const skippedList = details.filter(item => item.action === 'skip');

    const hasFailed = failedList.length > 0;
    const isRollback = mode === 'rollback';

    let alertMsg = `导入完成。成功新增 ${stat.inserted || 0} 条，更新 ${stat.updated || 0} 条，跳过 ${stat.skipped || 0} 条，失败 ${stat.failed || 0} 条。`;
    let alertType = 'success';

    if (hasFailed) {
      if (isRollback) {
        alertMsg = `检测到导入错误。由于选择了“出错回滚”模式，已自动回滚全部 ${details.length} 条数据操作，无任何修改被保存。`;
        alertType = 'error';
      } else {
        alertMsg = `部分数据导入失败。成功新增 ${stat.inserted || 0} 条，更新 ${stat.updated || 0} 条，跳过 ${stat.skipped || 0} 条，失败 ${stat.failed || 0} 条。`;
        alertType = 'warning';
      }
    }

    // 表格列定义
    const columns = [
      {
        title: '行号',
        dataIndex: '__rowNum__',
        key: '__rowNum__',
        width: 80,
        render: val => val ? `第 ${val} 行` : '-',
      },
      {
        title: '编号',
        dataIndex: 'key',
        key: 'key',
        width: 150,
      },
      {
        title: '标题/主键信息',
        dataIndex: 'title',
        key: 'title',
      },
      {
        title: '处理状态',
        key: 'status',
        width: 120,
        render: (_, record) => {
          if (record.status === 'fail') return <Tag color="error">失败</Tag>;
          if (record.action === 'insert') return <Tag color="success">新增</Tag>;
          if (record.action === 'update') return <Tag color="processing">更新</Tag>;
          if (record.action === 'skip') return <Tag color="warning">跳过</Tag>;
          return null;
        }
      }
    ];

    const tabItems = [
      {
        key: 'inserted',
        label: `新增成功 (${insertedList.length})`,
        children: (
          <Table
            dataSource={insertedList}
            columns={columns.filter(c => c.key !== 'status')}
            rowKey={(record, idx) => record.key || idx}
            size="small"
            pagination={{ pageSize: 5 }}
          />
        )
      },
      {
        key: 'updated',
        label: `更新成功 (${updatedList.length})`,
        children: (
          <Table
            dataSource={updatedList}
            columns={[
              ...columns.filter(c => c.key !== 'status'),
              {
                title: '更新内容',
                key: 'changes',
                render: (_, record) => {
                  if (!record.changes || record.changes.length === 0) return <span style={{ color: 'var(--radar-text-secondary)' }}>无字段变更</span>;
                  return (
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      {record.changes.map((change, idx) => (
                        <li key={idx}>
                          <strong>{change.field}</strong>: 从 <span style={{ textDecoration: 'line-through', color: 'var(--radar-error-color)' }}>'{change.old || '空'}'</span> 修改为 <span style={{ color: 'var(--radar-success-color)' }}>'{change.new || '空'}'</span>
                        </li>
                      ))}
                    </ul>
                  );
                }
              }
            ]}
            rowKey={(record, idx) => record.key || idx}
            size="small"
            pagination={{ pageSize: 5 }}
          />
        )
      },
      {
        key: 'failed',
        label: `失败条目 (${failedList.length})`,
        children: (
          <Table
            dataSource={failedList}
            columns={[
              ...columns.filter(c => c.key !== 'status'),
              {
                title: '错误详情',
                dataIndex: 'error',
                key: 'error',
                render: val => <span style={{ color: 'var(--radar-error-color, #ff4d4f)' }}>{val}</span>
              }
            ]}
            rowKey={(record, idx) => record.key || idx}
            size="small"
            pagination={{ pageSize: 5 }}
          />
        )
      },
      {
        key: 'skipped',
        label: `跳过条目 (${skippedList.length})`,
        children: (
          <Table
            dataSource={skippedList}
            columns={columns.filter(c => c.key !== 'status')}
            rowKey={(record, idx) => record.key || idx}
            size="small"
            pagination={{ pageSize: 5 }}
          />
        )
      }
    ];

    return (
      <div style={{ marginTop: 16 }}>
        <Alert message={alertMsg} type={alertType} showIcon style={{ marginBottom: 16 }} />
        <Tabs defaultActiveKey={hasFailed ? 'failed' : 'inserted'} items={tabItems} size="small" />
      </div>
    );
  };

  const uploadProps = {
    accept: '.xlsx',
    onRemove: () => setFileList([]),
    beforeUpload: (file) => {
      setFileList([file]);
      return false; // 阻止自动上传
    },
    fileList,
  };

  const modalFooter = result ? [
    <Button key="reset" icon={<ReloadOutlined />} onClick={handleReset}>重新上传</Button>,
    <Button key="ok" type="primary" onClick={handleOk}>确定</Button>
  ] : [
    <Button key="cancel" onClick={onCancel} disabled={uploading}>取消</Button>,
    <Button key="import" type="primary" onClick={handleUpload} disabled={fileList.length === 0} loading={uploading}>开始导入</Button>
  ];

  return (
    <Modal
      title="Excel 数据导入"
      open={open}
      onCancel={onCancel}
      footer={modalFooter}
      width={720}
      maskClosable={false}
      destroyOnHidden
    >
      {!result ? (
        <Space direction="vertical" size="middle" style={{ width: '100%', marginTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>请下载模板，并根据模板规则填写数据进行导入。</span>
            <Button type="link" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
              下载导入模板
            </Button>
          </div>

          <div>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>选择数据冲突处理模式:</div>
            <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)}>
              <Radio value="overwrite">覆盖更新</Radio>
              <Radio value="skip">重复跳过</Radio>
              <Radio value="rollback">出错回滚</Radio>
            </Radio.Group>
          </div>

          <Dragger {...uploadProps} style={{ padding: '24px 0' }}>
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或将 Excel 文件拖拽到此处上传</p>
            <p className="ant-upload-hint">仅支持 .xlsx 格式的 Excel 文件</p>
          </Dragger>
        </Space>
      ) : renderResult()}
    </Modal>
  );
}

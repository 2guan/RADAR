/**
 * 文件：components/editors/EditorShell.jsx
 * 用途：详情编辑器的可切换外壳。mode='modal' 时渲染为 AntD Modal（原有弹窗形态）；
 *       mode='page' 时渲染为详情单页布局（顶部操作条 + 正文区），供通过 URL 直达的详情单页复用同一份正文。
 * 作者：hengguan
 * 说明：保存/取消语义与 Modal 保持一致：onOk=保存、onCancel=关闭/返回；okButtonProps.style.display==='none' 时隐藏保存按钮（只读）。
 */

import React from 'react';
import { Modal, Button } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';

export default function EditorShell({
  mode = 'modal',
  open,
  width,
  title,
  footer,            // 显式传 null 表示无底部操作（如投产审批详情走内联保存）
  okText = '保存',
  onOk,
  onCancel,
  okButtonProps,
  cancelText = '取消',
  isDirty = false,
  children,
}) {
  const handleCancel = (e) => {
    if (mode !== 'page' && isDirty) {
      Modal.confirm({
        title: '确认取消',
        content: '检测到您已修改了内容，确认要取消并退出吗？未保存的内容将丢失。',
        okText: '确认取消',
        cancelText: '保留修改',
        onOk: () => {
          onCancel?.(e);
        }
      });
    } else {
      onCancel?.(e);
    }
  };

  if (mode !== 'page') {
    return (
      <Modal
        open={open}
        width={width}
        title={title}
        footer={footer}
        okText={okText}
        onOk={onOk}
        onCancel={handleCancel}
        okButtonProps={okButtonProps}
        cancelText={cancelText}
        destroyOnHidden
        styles={{ body: { fontSize: 12 } }}
      >
        {children}
      </Modal>
    );
  }

  // 单页模式：保存按钮在只读（okButtonProps 隐藏）或 footer===null 时不渲染
  const showSave = footer !== null && okButtonProps?.style?.display !== 'none';

  return (
    <div className="detail-page">
      <div className="detail-page-bar">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={onCancel} className="detail-page-back">返回</Button>
        <div className="detail-page-title">{title}</div>
        <div className="detail-page-actions">
          {showSave && (
            <Button type="primary" onClick={onOk} {...okButtonProps}>{okText}</Button>
          )}
        </div>
      </div>
      <div className="detail-page-content" style={{ fontSize: 12 }}>
        {children}
      </div>
    </div>
  );
}

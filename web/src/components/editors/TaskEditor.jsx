/**
 * 文件：components/editors/TaskEditor.jsx
 * 用途：开发/测试任务编辑弹窗（可复用：开发管理、测试管理、版本概览均使用）。
 *       栅格对齐布局；顶部只读元信息条（关联需求/实施方/偏差率）；含分阶段附件与历史记录。
 * 作者：hengguan
 * 说明：kind='dev' 用开发表与开发阶段状态；kind='test' 用测试表与测试阶段状态。
 */

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, DatePicker, Row, Col, Button, Space, message } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import DictSelect from '../DictSelect.jsx';
import SystemSelect from '../SystemSelect.jsx';
import PersonPicker from '../PersonPicker.jsx';
import AttachmentField from '../AttachmentField.jsx';
import HistoryDrawer from '../HistoryDrawer.jsx';
import { apiGet, apiPut } from '../../api/client.js';

const CFG = {
  dev: {
    api: '/dev-tasks', entity: 'dev', stage: '开发', title: '开发任务',
    attachFields: ['概要设计', '详细设计', '代码走查', '单元测试报告'],
    statusLabel: '开发状态', ownerLabel: '开发负责人', orgLabel: '开发实施方',
  },
  test: {
    api: '/test-tasks', entity: 'test', stage: '测试', title: '测试任务',
    attachFields: ['测试方案', '测试报告'],
    statusLabel: '测试状态', ownerLabel: '测试负责人', orgLabel: '测试实施方',
  },
};

export default function TaskEditor({ open, kind = 'dev', taskId, onClose, onSaved }) {
  const cfg = CFG[kind];
  const [form] = Form.useForm();
  const [current, setCurrent] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    if (!open || !taskId) return;
    apiGet(`${cfg.api}/${taskId}`).then((d) => {
      setCurrent(d);
      form.setFieldsValue({
        ...d,
        plan_start: d.plan_start ? dayjs(d.plan_start) : null,
        plan_end: d.plan_end ? dayjs(d.plan_end) : null,
        actual_start: d.actual_start ? dayjs(d.actual_start) : null,
        actual_end: d.actual_end ? dayjs(d.actual_end) : null,
      });
    });
  }, [open, taskId, kind]);

  const save = async () => {
    const v = await form.validateFields();
    const fmt = (x) => (x ? x.format('YYYY-MM-DD') : null);
    await apiPut(`${cfg.api}/${taskId}`, {
      ...v, plan_start: fmt(v.plan_start), plan_end: fmt(v.plan_end),
      actual_start: fmt(v.actual_start), actual_end: fmt(v.actual_end),
    });
    message.success('已保存');
    // 重新加载以刷新偏差率
    const d = await apiGet(`${cfg.api}/${taskId}`);
    setCurrent(d);
    onSaved?.();
  };

  return (
    <Modal
      open={open} width={820} okText="保存" onOk={save} onCancel={onClose} destroyOnHidden
      title={(
        <Space>
          {`${cfg.title} · ${current?.task_code || ''}`}
          {current && <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>历史记录</Button>}
        </Space>
      )}
    >
      {current && (
        <div className="meta-bar">
          <span className="meta-item"><span className="meta-label">关联需求</span><b>{current.req_code}</b></span>
          <span className="meta-item"><span className="meta-label">实施方</span><b>{current.impl_org || '—'}</b></span>
          <span className="meta-item"><span className="meta-label">偏差率</span><b>{current.deviation_rate == null ? '—' : `${current.deviation_rate}%`}</b></span>
        </div>
      )}
      <Form form={form} layout="vertical" requiredMark="optional">
        <div className="form-section-title">基本信息</div>
        <Row gutter={16}>
          <Col span={24}><Form.Item name="task_name" label="任务名称"><Input /></Form.Item></Col>
          {kind === 'dev' && (
            <Col span={24}><Form.Item name="content" label="开发内容概述"><Input.TextArea rows={2} /></Form.Item></Col>
          )}
          <Col xs={24} sm={12}><Form.Item name="status" label={cfg.statusLabel}><DictSelect category="process_status" stage={cfg.stage} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="owner" label={cfg.ownerLabel}><PersonPicker style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="impl_system" label="实施系统"><SystemSelect mode={undefined} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="impl_org" label={cfg.orgLabel}><DictSelect category="org" style={{ width: '100%' }} /></Form.Item></Col>
          {kind === 'test' && (
            <Col xs={24} sm={12}><Form.Item name="impl_agency" label="实施机构"><DictSelect category="org" style={{ width: '100%' }} /></Form.Item></Col>
          )}
        </Row>

        <div className="form-section-title">排期（终态必填）</div>
        <Row gutter={16}>
          <Col xs={12} sm={6}><Form.Item name="plan_start" label="计划开始"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} sm={6}><Form.Item name="plan_end" label="计划结束"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} sm={6}><Form.Item name="actual_start" label="实际开始"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={12} sm={6}><Form.Item name="actual_end" label="实际结束"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
        </Row>

        <div className="form-section-title">阶段附件（终态至少 1 个）</div>
        <Row gutter={16}>
          {cfg.attachFields.map((f) => (
            <Col xs={24} sm={12} key={f} style={{ marginBottom: 12 }}>
              <div style={{ marginBottom: 6, fontWeight: 500, fontSize: 13 }}>{f}</div>
              <AttachmentField entityType={cfg.entity} entityId={current?.id} fieldKey={f} />
            </Col>
          ))}
        </Row>
      </Form>

      <HistoryDrawer open={historyOpen} entityType={cfg.entity} entityId={current?.id} onClose={() => setHistoryOpen(false)} />
    </Modal>
  );
}

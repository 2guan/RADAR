/**
 * 文件：components/editors/RequirementEditor.jsx
 * 用途：需求新增/编辑弹窗（可复用：需求分析页与版本概览均使用）。
 *       采用 Row/Col 栅格 + 垂直标签，保证栏位整齐对齐；含附件与历史记录。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, DatePicker, Row, Col, Button, Space, Select, message } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import DictSelect from '../DictSelect.jsx';
import SystemSelect from '../SystemSelect.jsx';
import PersonPicker from '../PersonPicker.jsx';
import AttachmentField from '../AttachmentField.jsx';
import HistoryDrawer from '../HistoryDrawer.jsx';
import { apiGet, apiPost, apiPut } from '../../api/client.js';

export default function RequirementEditor({ open, reqId, defaultReleasePointId, onClose, onSaved }) {
  const [form] = Form.useForm();
  const [current, setCurrent] = useState(null); // 已加载的需求详情（编辑态）
  const [historyOpen, setHistoryOpen] = useState(false);
  const [points, setPoints] = useState([]);     // 投产点选项
  const isEdit = !!reqId;

  useEffect(() => {
    if (!open) return;
    apiGet('/release-points/all').then(setPoints).catch(() => {});
    if (reqId) {
      apiGet(`/requirements/${reqId}`).then((d) => {
        setCurrent(d);
        form.setFieldsValue({ ...d, propose_time: d.propose_time ? dayjs(d.propose_time) : null });
      });
    } else {
      setCurrent(null);
      form.resetFields();
      form.setFieldsValue({ status: '需求登记', release_point_id: defaultReleasePointId });
    }
  }, [open, reqId]);

  const save = async () => {
    const v = await form.validateFields();
    const payload = {
      ...v,
      propose_time: v.propose_time ? v.propose_time.format('YYYY-MM-DD') : null,
      release_point_id: v.release_point_id,
    };
    if (isEdit) {
      await apiPut(`/requirements/${reqId}`, payload);
      message.success('已保存');
    } else {
      const res = await apiPost('/requirements', payload);
      message.success(`已创建需求 ${res.req_code}，可继续维护附件`);
      const d = await apiGet(`/requirements/${res.id}`);
      setCurrent(d); // 转为编辑态以维护附件
    }
    onSaved?.();
  };

  return (
    <Modal
      open={open} width={820} okText="保存" onOk={save} onCancel={onClose} destroyOnHidden
      title={(
        <Space>
          {isEdit || current ? `需求详情 · ${current?.req_code || ''}` : '新增需求'}
          {current && <Button size="small" icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>历史记录</Button>}
        </Space>
      )}
    >
      <Form form={form} layout="vertical" requiredMark="optional">
        <div className="form-section-title">基本信息</div>
        <Row gutter={16}>
          <Col span={24}>
            <Form.Item name="title" label="需求标题" rules={[{ required: true, message: '请输入需求标题' }]}>
              <Input placeholder="请输入需求标题" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="summary" label="需求概述" rules={[{ max: 500, message: '不超过 500 字' }]}>
              <Input.TextArea rows={3} placeholder="500 字以内" showCount maxLength={500} />
            </Form.Item>
          </Col>
        </Row>

        <div className="form-section-title">分类与责任人</div>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="release_point_id" label="计划投产点" rules={[{ required: true, message: '请选择计划投产点' }]}>
              <Select placeholder="选择计划投产点" style={{ width: '100%' }} showSearch optionFilterProp="label"
                options={points.map((p) => ({ value: p.id, label: `${p.release_date}${p.version_type ? ' · ' + p.version_type : ''}` }))} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}><Form.Item name="status" label="需求状态"><DictSelect category="process_status" stage="需求" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="req_type" label="需求类型"><DictSelect category="req_type" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="propose_dept" label="农信提出部门"><DictSelect category="org" style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="proposer" label="农信提出人"><PersonPicker style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="yn_owner" label="云南农信业务负责人"><PersonPicker style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="jk_owner" label="建信金科业务负责人"><PersonPicker style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="propose_time" label="提出时间"><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
        </Row>

        <div className="form-section-title">涉及系统</div>
        <Row gutter={16}>
          <Col span={24}><Form.Item name="main_systems" label="主责系统（终态必填）"><SystemSelect style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={24}><Form.Item name="collab_dev_systems" label="协同改造系统"><SystemSelect style={{ width: '100%' }} /></Form.Item></Col>
          <Col span={24}><Form.Item name="collab_test_systems" label="协同测试系统"><SystemSelect style={{ width: '100%' }} /></Form.Item></Col>
        </Row>

        <div className="form-section-title">需求说明书（附件或路径，终态至少 1 个）</div>
        <AttachmentField entityType="requirement" entityId={current?.id} fieldKey="需求说明书" />
      </Form>

      <HistoryDrawer open={historyOpen} entityType="requirement" entityId={current?.id} onClose={() => setHistoryOpen(false)} />
    </Modal>
  );
}

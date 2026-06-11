/**
 * 文件：components/editors/RequirementEditor.jsx
 * 用途：需求新增/编辑弹窗（可复用：需求分析页与版本概览均使用）。
 *       重置为高效、精致、紧凑、美观的双栏卡片布局，契合版本生命周期详情风格。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, DatePicker, Row, Col, Button, Space, Select, Tag, message } from 'antd';
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
      open={open} 
      width={980} 
      okText="保存" 
      onOk={save} 
      onCancel={onClose} 
      destroyOnClose
      title={(
        <div className="lc-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', paddingRight: 32 }}>
          {isEdit || current ? (
            <>
              <span className="lc-id big" style={{ margin: 0 }}>{current?.req_code || 'REQ'}</span>
              <span className="lc-modal-name" style={{ fontSize: 15, fontWeight: 700 }}>编辑需求</span>
              {current?.req_type && (
                <Tag className="tag-type" style={{ borderRadius: 2, margin: 0, fontSize: 10 }}>{current.req_type}</Tag>
              )}
            </>
          ) : (
            <>
              <span className="lc-id big" style={{ margin: 0, background: 'var(--radar-status-in-progress-soft)', color: 'var(--radar-status-in-progress)' }}>NEW</span>
              <span className="lc-modal-name" style={{ fontSize: 15, fontWeight: 700 }}>新增需求</span>
            </>
          )}
          {current && (
            <Button 
              size="small" 
              icon={<HistoryOutlined />} 
              onClick={() => setHistoryOpen(true)}
              style={{ marginLeft: 'auto', marginRight: 16, borderRadius: 2 }}
            >
              变更历史
            </Button>
          )}
        </div>
      )}
    >
      <Form form={form} layout="vertical" requiredMark="optional" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          {/* 左栏 - 核心内容 */}
          <Col xs={24} md={14}>
            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0 }}>基本信息</div>
              <Form.Item name="title" label="需求标题" rules={[{ required: true, message: '请输入需求标题' }]} style={{ marginBottom: 14 }}>
                <Input placeholder="请输入需求标题" />
              </Form.Item>
              <Form.Item name="summary" label="需求概述" rules={[{ max: 500, message: '不超过 500 字' }]} style={{ marginBottom: 0 }}>
                <Input.TextArea rows={4} placeholder="描述该需求的核心背景与业务诉求（500字以内）" showCount maxLength={500} />
              </Form.Item>
            </div>

            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0 }}>涉及系统</div>
              <Form.Item 
                name="main_systems" 
                label="主责系统（最多选择 2 个，终态必填）" 
                style={{ marginBottom: 14 }}
                rules={[
                  {
                    validator: (_, value) => {
                      if (value && value.length > 2) {
                        return Promise.reject(new Error('主责系统最多只能选择 2 个'));
                      }
                      return Promise.resolve();
                    }
                  }
                ]}
              >
                <SystemSelect maxCount={2} maxTagCount="responsive" style={{ width: '100%' }} placeholder="选择主责系统（最多2个）" />
              </Form.Item>
              
              <Form.Item name="collab_dev_systems" label="协同改造系统" style={{ marginBottom: 14 }}>
                <SystemSelect maxTagCount={undefined} style={{ width: '100%' }} placeholder="选择协同改造系统（可选多个，展示完整）" />
              </Form.Item>
              
              <Form.Item name="collab_test_systems" label="协同测试系统" style={{ marginBottom: 0 }}>
                <SystemSelect maxTagCount={undefined} style={{ width: '100%' }} placeholder="选择协同测试系统（可选多个，展示完整）" />
              </Form.Item>
            </div>
          </Col>

          {/* 右栏 - 属性、责任人、附件 */}
          <Col xs={24} md={10}>
            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0 }}>分类与状态</div>
              <Form.Item name="release_point_id" label="计划投产点" rules={[{ required: true, message: '请选择计划投产点' }]} style={{ marginBottom: 12 }}>
                <Select 
                  placeholder="选择计划投产点" style={{ width: '100%' }} showSearch optionFilterProp="label"
                  options={points.map((p) => ({ value: p.id, label: `${p.release_date}${p.version_type ? ' · ' + p.version_type : ''}` }))} 
                />
              </Form.Item>
              
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item name="status" label="需求状态" style={{ marginBottom: 12 }}>
                    <DictSelect category="process_status" stage="需求" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="req_type" label="需求类型" style={{ marginBottom: 12 }}>
                    <DictSelect category="req_type" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="propose_dept" label="农信提出部门" style={{ marginBottom: 0 }}>
                    <DictSelect category="org" style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="propose_time" label="提出时间" style={{ marginBottom: 0 }}>
                    <DatePicker style={{ width: '100%' }} placeholder="选择日期" />
                  </Form.Item>
                </Col>
              </Row>
            </div>

            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0 }}>相关负责人</div>
              <Form.Item name="proposer" label="农信提出人" style={{ marginBottom: 12 }}>
                <PersonPicker style={{ width: '100%' }} placeholder="选择提出人" />
              </Form.Item>
              <Form.Item name="yn_owner" label="云南农信业务负责人" style={{ marginBottom: 12 }}>
                <PersonPicker style={{ width: '100%' }} placeholder="选择云南农信业务负责人" />
              </Form.Item>
              <Form.Item name="jk_owner" label="建信金科业务负责人" style={{ marginBottom: 0 }}>
                <PersonPicker style={{ width: '100%' }} placeholder="选择建信金科业务负责人" />
              </Form.Item>
            </div>

            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0 }}>需求说明书（附件或路径）</div>
              <AttachmentField entityType="requirement" entityId={current?.id} fieldKey="需求说明书" />
            </div>
          </Col>
        </Row>
      </Form>

      <HistoryDrawer open={historyOpen} entityType="requirement" entityId={current?.id} onClose={() => setHistoryOpen(false)} />
    </Modal>
  );
}

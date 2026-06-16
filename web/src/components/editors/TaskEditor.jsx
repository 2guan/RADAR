/**
 * 文件：components/editors/TaskEditor.jsx
 * 用途：开发/测试任务编辑弹窗（可复用：开发管理、测试管理 SIT/UAT/NFT/SEC、版本概览均使用）。
 *       与需求编辑器同款精致风格：双栏卡片布局、紧凑字号、标题栏内联状态选择器（按主题状态色）、
 *       历史记录改为右上角图标按钮、保存即关闭。
 * 作者：hengguan
 * 说明：kind='dev' 用开发表与开发阶段状态；kind='test' 用测试表与测试阶段状态。
 */

import React, { useEffect, useState } from 'react';
import { Form, Input, DatePicker, Row, Col, Button, Tooltip, message } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import DictSelect from '../DictSelect.jsx';
import SystemSelect from '../SystemSelect.jsx';
import PersonPicker from '../PersonPicker.jsx';
import AttachmentField from '../AttachmentField.jsx';
import HistoryDrawer from '../HistoryDrawer.jsx';
import CodeLink from '../CodeLink.jsx';
import EditorShell from './EditorShell.jsx';
import RequirementEditor from './RequirementEditor.jsx';
import StatusBadge, { getStatusType, statusSelectWidth } from '../StatusBadge.jsx';
import { apiGet, apiPut } from '../../api/client.js';
import { useAppStore } from '../../stores/app.js';
import { useResponsive } from '../../hooks/useResponsive.js';

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

export default function TaskEditor({ open, mode = 'modal', code, kind = 'dev', taskId, onClose, onSaved }) {
  const cfg = CFG[kind];
  const [form] = Form.useForm();
  // 监听任务状态，供标题栏内联选择器响应式回显
  const statusValue = Form.useWatch('status', form);
  const [current, setCurrent] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  // 联动：打开关联需求详情 / 关联开发任务详情
  const [reqOpen, setReqOpen] = useState(false);
  const [relDevId, setRelDevId] = useState(null);
  const { can } = useAppStore();
  const { isMobile } = useResponsive();
  const readonly = !can(cfg.entity, 'edit');
  const linkStyle = { color: 'var(--radar-primary)', cursor: 'pointer' };

  useEffect(() => {
    // 回显数据到表单（弹窗按 id 取，单页按编号取）
    const apply = (d) => {
      setCurrent(d);
      form.setFieldsValue({
        ...d,
        plan_start: d.plan_start ? dayjs(d.plan_start) : null,
        plan_end: d.plan_end ? dayjs(d.plan_end) : null,
        actual_start: d.actual_start ? dayjs(d.actual_start) : null,
        actual_end: d.actual_end ? dayjs(d.actual_end) : null,
      });
    };
    if (mode === 'page') {
      if (code) apiGet(`${cfg.api}/by-code/${encodeURIComponent(code)}`).then(apply);
      return;
    }
    if (!open) {
      form.resetFields();
      return;
    }
    form.resetFields();
    if (taskId) {
      apiGet(`${cfg.api}/${taskId}`).then(apply);
    }
  }, [open, taskId, code, kind, mode]);

  const save = async () => {
    const v = await form.validateFields();
    const id = taskId ?? current?.id;
    const fmt = (x) => (x ? x.format('YYYY-MM-DD') : null);
    await apiPut(`${cfg.api}/${id}`, {
      ...v, plan_start: fmt(v.plan_start), plan_end: fmt(v.plan_end),
      actual_start: fmt(v.actual_start), actual_end: fmt(v.actual_end),
    });
    message.success('已保存');
    onSaved?.();
    onClose?.();   // 保存成功后关闭弹窗 / 返回
  };

  return (
    <EditorShell
      mode={mode}
      open={open}
      width={860}
      okText="保存"
      onOk={save}
      onCancel={onClose}
      okButtonProps={readonly ? { style: { display: 'none' } } : undefined}
      cancelText={readonly ? '关闭' : '取消'}
      isDirty={form.isFieldsTouched()}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, minWidth: 0, width: '100%', paddingRight: 76 }}>
          <CodeLink module={cfg.entity} code={current?.task_code} fallback={cfg.title} />
          {/* 任务状态：标题栏内联编辑，点击即可切换；按主题状态色显示，宽度随内容自适应 */}
          <span className={`status-select status-select-${getStatusType(statusValue)}`}>
            <DictSelect
              category="process_status"
              stage={cfg.stage}
              size="small"
              allowClear={false}
              showSearch={false}
              popupClassName="status-select-dropdown"
              popupMatchSelectWidth={false}
              value={statusValue}
              onChange={(val) => form.setFieldValue('status', val)}
              placeholder={cfg.statusLabel}
              style={{ width: statusSelectWidth(statusValue, cfg.statusLabel), ...(readonly ? { pointerEvents: 'none' } : {}) }}
            />
          </span>
          {current && (
            <Tooltip title="历史记录">
              <Button
                type="text"
                icon={<HistoryOutlined style={{ fontSize: 16 }} />}
                onClick={() => setHistoryOpen(true)}
                aria-label="历史记录"
                style={{ position: 'absolute', top: 12, right: 48, width: 32, height: 32, borderRadius: 2, color: 'var(--radar-text-secondary)' }}
              />
            </Tooltip>
          )}
        </div>
      )}
    >
      {current && (
        <>
          {/* 关联需求：编号 + 标题（测试详情再加需求状态），点击打开需求详情 */}
          <div className="meta-bar" style={{ fontSize: 12, marginBottom: kind === 'test' && current.dev_tasks?.length ? 8 : 12 }}>
            <span className="meta-item" style={{ flexWrap: 'wrap' }}>
              <span className="meta-label">关联需求</span>
              <span style={current.req_code ? linkStyle : undefined} onClick={() => current.req_code && setReqOpen(true)}>
                <b>{current.req_code || '—'}</b>{current.req_title ? `　${current.req_title}` : ''}
              </span>
              {kind === 'test' && current.req_status && <StatusBadge status={current.req_status} />}
            </span>
          </div>

          {/* 测试详情：列出该需求的全部开发任务（编号/所属系统/状态），点击打开开发任务详情 */}
          {kind === 'test' && current.dev_tasks?.length > 0 && (
            <div className="meta-bar" style={{ fontSize: 12, marginBottom: 12, alignItems: 'center' }}>
              <span className="meta-label" style={{ marginRight: 2 }}>关联开发任务</span>
              {current.dev_tasks.map((t) => (
                <span key={t.id} className="meta-item" style={{ ...linkStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setRelDevId(t.id)}>
                  <b>{t.task_code}</b>
                  <span style={{ color: 'var(--radar-text-secondary)' }}>{t.impl_system_name || '—'}</span>
                  <StatusBadge status={t.status} />
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <Form form={form} layout="vertical" requiredMark={false} className="editor-form" style={{ fontSize: 12 }}>
        {/* 状态改由标题栏内联编辑，此处保留隐藏字段以保证保存 */}
        <Form.Item name="status" hidden><Input /></Form.Item>

        <Row gutter={12}>
          {/* ── 左栏：基本信息 + 排期 ── */}
          <Col xs={24} md={14}>
            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>基本信息</div>

              <Form.Item name="task_name" label="任务名称" style={{ marginBottom: 8 }}>
                <Input placeholder="请输入任务名称" size="small" readOnly={readonly} />
              </Form.Item>

              {kind === 'dev' && (
                <Form.Item name="content" label="开发内容概述" style={{ marginBottom: 8 }}>
                  <Input.TextArea rows={2} placeholder="简要描述开发内容" style={{ fontSize: 12 }} readOnly={readonly} />
                </Form.Item>
              )}

              {/* 负责人/实施系统/实施方：手机端各占一行（充满），PC 端双栏不变；测试详情手机端隐藏「实施机构」 */}
              <Row gutter={8}>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item name="owner" label={cfg.ownerLabel} style={{ marginBottom: 8 }}>
                    <PersonPicker style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} size="small" placeholder="选择负责人" />
                  </Form.Item>
                </Col>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item name="impl_system" label="实施系统" style={{ marginBottom: 8 }}>
                    <SystemSelect single size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择实施系统" />
                  </Form.Item>
                </Col>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item name="impl_org" label={cfg.orgLabel} style={{ marginBottom: (kind === 'test' && !isMobile) ? 8 : 0 }}>
                    <DictSelect category="org" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} size="small" />
                  </Form.Item>
                </Col>
                {kind === 'test' && (
                  isMobile ? (
                    // 手机端隐藏「实施机构」，但保留字段以免保存时丢值
                    <Form.Item name="impl_agency" hidden><Input /></Form.Item>
                  ) : (
                    <Col span={12}>
                      <Form.Item name="impl_agency" label="实施机构" style={{ marginBottom: 0 }}>
                        <DictSelect category="org" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} size="small" />
                      </Form.Item>
                    </Col>
                  )
                )}
              </Row>
            </div>

            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>排期<span style={{ fontWeight: 400, color: 'var(--radar-text-secondary)', marginLeft: 6, fontSize: 11 }}>（终态必填）</span></div>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="plan_start" label="计划开始" style={{ marginBottom: 8 }}><DatePicker size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择日期" /></Form.Item></Col>
                <Col span={12}><Form.Item name="plan_end" label="计划结束" style={{ marginBottom: 8 }}><DatePicker size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择日期" /></Form.Item></Col>
                <Col span={12}><Form.Item name="actual_start" label="实际开始" style={{ marginBottom: 0 }}><DatePicker size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择日期" /></Form.Item></Col>
                <Col span={12}><Form.Item name="actual_end" label="实际结束" style={{ marginBottom: 0 }}><DatePicker size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择日期" /></Form.Item></Col>
              </Row>
            </div>
          </Col>

          {/* ── 右栏：阶段附件 ── */}
          <Col xs={24} md={10}>
            {cfg.attachFields.map((f) => (
              <div className="form-section-card" key={f} style={{ marginBottom: 12 }}>
                <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>
                  {f}
                  <span style={{ fontWeight: 400, color: 'var(--radar-text-secondary)', marginLeft: 6, fontSize: 11 }}>
                    （附件或路径）
                  </span>
                </div>
                <AttachmentField entityType={cfg.entity} entityId={current?.id} fieldKey={f} readOnly={readonly} />
              </div>
            ))}
          </Col>
        </Row>
      </Form>

      <HistoryDrawer open={historyOpen} entityType={cfg.entity} entityId={current?.id} onClose={() => setHistoryOpen(false)} />

      {/* 联动弹窗：关联需求详情 */}
      <RequirementEditor open={reqOpen} code={current?.req_code} onClose={() => setReqOpen(false)} />
      {/* 联动弹窗：关联开发任务详情（仅测试详情用） */}
      {kind === 'test' && (
        <TaskEditor open={!!relDevId} kind="dev" taskId={relDevId} onClose={() => setRelDevId(null)} />
      )}
    </EditorShell>
  );
}

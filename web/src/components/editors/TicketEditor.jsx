/**
 * 文件：components/editors/TicketEditor.jsx
 * 用途：需求新增/编辑弹窗（可复用：工单分析页与版本概览均使用）。
 *       双栏卡片布局；字体紧凑；
 *       协同改造/测试系统采用下拉选择 + 外置已选区双模式展示。
 * 作者：hengguan
 * 说明：需求明细抽屉编辑器，支持需求的创建、编辑、归属主责系统、附件关联以及各项开发/测试任务的联动修改。
 */

import React, { useEffect, useRef, useState } from 'react';
import { AutoComplete, Form, Input, DatePicker, Row, Col, Button, Select, Tag, Space, message, Tooltip } from 'antd';
import { HistoryOutlined, CloseOutlined, CheckCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import DictSelect from '../DictSelect.jsx';
import PersonPicker from '../PersonPicker.jsx';
import HistoryDrawer from '../HistoryDrawer.jsx';
import CodeLink from '../CodeLink.jsx';
import EditorShell from './EditorShell.jsx';
import { getStatusType, statusSelectWidth } from '../StatusBadge.jsx';
import { apiGet, apiPost, apiPut } from '../../api/client.js';
import { useAppStore } from '../../stores/app.js';
import { useResponsive } from '../../hooks/useResponsive.js';
import { useRequiredFields } from '../../hooks/useRequiredFields.js';
import { useDefaultProcessStatus } from '../../hooks/useDefaultProcessStatus.js';
import { makeReleasePointOptions } from '../ReleasePointText.jsx';

// ─── 模块级系统列表缓存（与 SystemSelect 共用同一接口，但单独维护以供下方组件使用） ───
let _sysCache = null;

/**
 * 系统选择子区块：标题在左、选择框在右，已选系统逐个展示在下方、可单独删除。
 * single=true 时为单选：已选一个后再选会自动替换（主责系统）；否则不限个数（协同系统）。
 */
function SystemPickerField({ title, hint, value = [], onChange, single, placeholder, readonly }) {
  const [options, setOptions] = useState([]);
  
  const handleChange = (vals) => {
    if (single) {
      onChange?.(vals.slice(-1));
    } else {
      const combined = [...new Set([...(value || []), ...vals])];
      onChange?.(combined);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!_sysCache) _sysCache = await apiGet('/systems/all');
      if (alive) {
        setOptions(
          (_sysCache || []).map((s) => ({
            value: s.sys_code,
            label: `${s.sys_name}（${s.sys_code}）`,
            org: s.org || '',
          }))
        );
      }
    })();
    return () => { alive = false; };
  }, []);

  const remove = (code) => onChange?.((value || []).filter((v) => v !== code));

  const filteredOptions = options.filter(opt => !(value || []).includes(opt.value));

  return (
    <div style={{ marginBottom: 12 }}>
      {/* 标题（左）+ 选择框（右） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--radar-ink)', whiteSpace: 'nowrap' }}>
          {title}
          {hint && (
            <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--radar-text-secondary)', marginLeft: 4 }}>{hint}</span>
          )}
        </span>
        <Select
          mode="multiple"
          value={[]}
          onChange={handleChange}
          options={filteredOptions}
          size="small"
          showSearch
          allowClear={false}
          filterOption={(input, opt) =>
            `${opt.label}${opt.org}`.toLowerCase().includes(input.toLowerCase())
          }
          placeholder={placeholder || '系统检索'}
          style={{ flex: 1, minWidth: 0, fontSize: 12, ...(readonly ? { pointerEvents: 'none' } : {}) }}
          tabIndex={readonly ? -1 : undefined}
        />
      </div>

      {/* 已选区域 */}
      {value && value.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            background: 'var(--radar-primary-soft)',
            border: '1px solid var(--radar-border)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {value.map((code) => {
            const opt = options.find((o) => o.value === code);
            return (
              <Tag
                key={code}
                className="tag-system"
                style={{ borderRadius: 2, margin: 0, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                closeIcon={readonly ? null : <CloseOutlined style={{ fontSize: 10 }} />}
                closable={!readonly}
                onClose={() => remove(code)}
              >
                {opt ? `${opt.label}` : code}
              </Tag>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PersonPickerField({ value = [], onChange, readonly, placeholder }) {
  const handlePickerChange = (vals) => {
    const combined = [...new Set([...(value || []), ...vals])];
    onChange?.(combined);
  };

  const remove = (name) => {
    onChange?.((value || []).filter((v) => v !== name));
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <PersonPicker
          mode="multiple"
          value={[]}
          onChange={handlePickerChange}
          placeholder={placeholder || '选择人员'}
          size="small"
          style={{ flex: 1, minWidth: 0, fontSize: 12, ...(readonly ? { pointerEvents: 'none' } : {}) }}
          tabIndex={readonly ? -1 : undefined}
        />
      </div>

      {value && value.length > 0 && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 10px',
            background: 'var(--radar-primary-soft)',
            border: '1px solid var(--radar-border)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
          }}
        >
          {value.map((name) => (
            <Tag
              key={name}
              className="tag-system"
              style={{ borderRadius: 2, margin: 0, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              closeIcon={readonly ? null : <CloseOutlined style={{ fontSize: 10 }} />}
              closable={!readonly}
              onClose={() => remove(name)}
            >
              {name}
            </Tag>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TicketEditor({ open, mode = 'modal', code, reqId, defaultReleasePointId, onClose, onSaved }) {
  const [form] = Form.useForm();
  // 监听工单状态，供标题栏内联选择器响应式回显
  const statusValue = Form.useWatch('status', form);
  const [current, setCurrent] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [points, setPoints] = useState([]);
  const [isDirty, setIsDirty] = useState(false);
  const { can } = useAppStore();
  const { isMobile } = useResponsive();
  // 既有需求（按 id 或编号加载）即为编辑/查看态；其余为新增
  const isEdit = !!reqId || !!code || mode === 'page';
  const readonly = isEdit ? !can('ticket', 'edit') : !can('ticket', 'create');
  const required = useRequiredFields('ticket', getStatusType(statusValue), readonly);
  const initialStatus = useDefaultProcessStatus('工单', 'initial', '工单登记');
  // 已关联开发/测试任务时，工单编号锁定不可改
  const codeLocked = !!current?.has_tasks;

  // 防抖 timer ref，供编号唯一性校验使用
  const debounceRef = useRef(null);
  const issueLookupDebounceRef = useRef(null);
  const [issueOptions, setIssueOptions] = useState([]);

  const ensureSystems = async () => {
    if (!_sysCache) _sysCache = await apiGet('/systems/all');
    return _sysCache || [];
  };

  const applyIssue = async (issue) => {
    if (!issue || readonly || codeLocked) return;
    const patch = {
      ticket_code: issue.issue_code || '',
      ticket_type: issue.detailed_classification || issue.category || undefined,
      issue_no: issue.work_order_no || '',
      title: issue.summary || '',
      summary: issue.details || '',
    };
    const issueSystem = String(issue.system || '').trim();
    if (issueSystem) {
      const systems = await ensureSystems();
      const matched = systems.find((s) => s.sys_code === issueSystem);
      if (matched) patch.main_systems = [matched.sys_code];
    }
    form.setFieldsValue(patch);
    setIsDirty(true);
  };

  const toIssueOption = (issue) => ({
    value: issue.issue_code,
    issue,
    label: (
      <div style={{ lineHeight: '16px', padding: '2px 0' }}>
        <div style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
          {issue.issue_code}
        </div>
        <div style={{ minHeight: 16, fontFamily: 'SFMono-Regular, Consolas, monospace', color: 'var(--radar-text-secondary)', fontSize: 11, whiteSpace: 'nowrap' }}>
          {issue.work_order_no && (
            <span>
              {issue.work_order_no}
            </span>
          )}
        </div>
        <div style={{ color: 'var(--radar-text-secondary)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {issue.summary || '—'}
        </div>
      </div>
    ),
  });

  const lookupIssues = async (q) => {
    const keyword = String(q || '').trim();
    if (!keyword) {
      setIssueOptions([]);
      return [];
    }
    const list = await apiGet('/tickets/issue-lookup', { q: keyword });
    setIssueOptions((list || []).map(toIssueOption));
    return list || [];
  };

  const onIssueSearch = (q) => {
    if (readonly || codeLocked) return;
    if (issueLookupDebounceRef.current) clearTimeout(issueLookupDebounceRef.current);
    issueLookupDebounceRef.current = setTimeout(() => {
      lookupIssues(q).catch(() => setIssueOptions([]));
    }, 300);
  };

  const onIssueInputBlur = async () => {
    if (readonly || codeLocked) return;
    const keyword = String(form.getFieldValue('ticket_code') || '').trim();
    if (!keyword) return;
    const list = await lookupIssues(keyword).catch(() => []);
    const exact = list.find((item) => item.issue_code === keyword || item.work_order_no === keyword);
    if (exact) await applyIssue(exact);
  };

  useEffect(() => {
    const applyRow = (d) => {
      setCurrent(d);
      form.setFieldsValue({ ...d, propose_time: d.propose_time ? dayjs(d.propose_time) : null });
      setIsDirty(false);
    };
    if (mode !== 'page' && !open) return;
    setIsDirty(false);
    apiGet('/release-points/all').then(setPoints).catch(() => {});
    if (reqId) {
      apiGet(`/tickets/${reqId}`).then(applyRow);
    } else if (code) {
      apiGet(`/tickets/by-code/${encodeURIComponent(code)}`).then(applyRow);
    } else {
      setCurrent(null);
      form.resetFields();
      form.setFieldsValue({ status: initialStatus, ticket_type: '工单急迫需求', is_accounting: '否', release_point_id: defaultReleasePointId });
    }
  }, [open, reqId, code, mode, initialStatus]);

  const save = async () => {
    const v = await form.validateFields();
    const payload = {
      ...v,
      propose_time: v.propose_time ? v.propose_time.format('YYYY-MM-DD') : null,
    };
    if (isEdit) {
      await apiPut(`/tickets/${reqId ?? current?.id}`, payload);
      message.success('已保存');
    } else {
      const res = await apiPost('/tickets', payload);
      message.success(`已创建工单 ${res.ticket_code}`);
    }
    onSaved?.();
    onClose?.();   // 保存成功后关闭弹窗
  };

  /** 防抖异步校验工单编号唯一性 */
  const checkCodeUnique = (code) =>
    new Promise((resolve, reject) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = (code || '').trim();
      if (!trimmed) { resolve(); return; }
      debounceRef.current = setTimeout(async () => {
        try {
          const params = { code: trimmed };
          const excludeId = reqId ?? current?.id;
          if (excludeId) params.excludeId = excludeId;
          const res = await apiGet('/tickets/check-code', params);
          res.exists ? reject('工单编号已存在') : resolve();
        } catch {
          resolve(); // 网络异常不阻断表单
        }
      }, 400);
    });

  return (
    <EditorShell
      mode={mode}
      open={open}
      width={980}
      okText="保存"
      onOk={save}
      onCancel={onClose}
      isDirty={!readonly && isDirty}
      okButtonProps={readonly ? { style: { display: 'none' } } : undefined}
      cancelText={readonly ? '关闭' : '取消'}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, minWidth: 0, width: '100%', paddingRight: 76 }}>
          {isEdit || current ? (
            <CodeLink module="ticket" code={current?.ticket_code} fallback="TKT" />
          ) : (
            <span className="lc-id big" style={{ margin: 0, background: 'var(--radar-status-in-progress-soft)', color: 'var(--radar-status-in-progress)' }}>NEW</span>
          )}
          {/* 工单状态：标题栏内联编辑，点击即可切换；按主题状态色显示，宽度随内容自适应 */}
          <span className={`status-select status-select-${getStatusType(statusValue)}`}>
            <DictSelect
              category="process_status"
              stage="工单"
              size="small"
              allowClear={false}
              showSearch={false}
              popupClassName="status-select-dropdown"
              popupMatchSelectWidth={false}
              value={statusValue}
              onChange={(v) => { form.setFieldValue('status', v); if (!readonly) setIsDirty(true); }}
              placeholder="工单状态"
              style={{ width: statusSelectWidth(statusValue, '工单状态'), ...(readonly ? { pointerEvents: 'none' } : {}) }}
            />
          </span>
          {current && (
            <Tooltip title="变更历史">
              <Button
                type="text"
                icon={<HistoryOutlined style={{ fontSize: 16 }} />}
                onClick={() => setHistoryOpen(true)}
                aria-label="变更历史"
                style={{ position: 'absolute', top: 12, right: 48, width: 32, height: 32, borderRadius: 2, color: 'var(--radar-text-secondary)' }}
              />
            </Tooltip>
          )}
        </div>
      )}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className="editor-form"
        style={{ marginTop: 10, fontSize: 12 }}
        onValuesChange={() => { if (!readonly) setIsDirty(true); }}
      >
        <Row gutter={12}>
          {/* ── 左栏 ── */}
          <Col xs={24} md={14}>

            {/* 基本信息 */}
            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>基本信息</div>

              {/* 工单状态改由标题栏内联编辑，此处保留隐藏字段以保证保存 */}
              <Form.Item name="status" hidden><Input /></Form.Item>

              <Row gutter={8}>
                {/* 工单编号 + 工单类型 */}
                <Col span={12}>
                  <Form.Item
                    name="ticket_code"
                    label={(
                      <span>
                        工单编号
                        {codeLocked && !isMobile && (
                          <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                            （已关联，不可改）
                          </span>
                        )}
                      </span>
                    )}
                    style={{ marginBottom: 8 }}
                    rules={[
                      ...required.rules('ticket_code', '工单编号', { message: '请填写工单编号' }),
                      { pattern: /^\S+$/, message: '编号不能包含空格' },
                      { validator: (_, val) => checkCodeUnique(val) },
                    ]}
                    validateTrigger={['onBlur', 'onChange']}
                  >
                    <AutoComplete
                      options={issueOptions}
                      onSearch={onIssueSearch}
                      onSelect={(_, opt) => applyIssue(opt.issue)}
                      onBlur={onIssueInputBlur}
                      popupMatchSelectWidth={360}
                      placeholder="请输入工单编号"
                      size="small"
                      disabled={readonly || codeLocked}
                      style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', letterSpacing: '0.3px' }}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="ticket_type" label="工单类型" rules={required.rules('ticket_type', '工单类型', { action: '请选择' })} style={{ marginBottom: 8 }}>
                    <DictSelect category="ticket_type" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} size="small" />
                  </Form.Item>
                </Col>
                {/* 计划投产点 + 提出时间 */}
                <Col span={12}>
                  <Form.Item name="release_point_id" label="计划投产点" rules={required.rules('release_point_id', '计划投产点', { action: '请选择' })} style={{ marginBottom: 8 }}>
                    <Select
                      placeholder="选择计划投产点"
                      size="small"
                      style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }}
                      tabIndex={readonly ? -1 : undefined}
                      showSearch
                      optionFilterProp="searchLabel"
                      options={makeReleasePointOptions(points, { includeVersionType: true })}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="propose_time" label="提出时间" rules={required.rules('propose_time', '提出时间', { action: '请选择' })} style={{ marginBottom: 8 }}>
                    <DatePicker size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择日期" />
                  </Form.Item>
                </Col>
                {/* 关联问题/工单编号 + 是否涉账 */}
                <Col span={12}>
                  <Form.Item name="issue_no" label="关联问题/工单编号" rules={required.rules('issue_no', '关联问题/工单编号')} style={{ marginBottom: 8 }}>
                    <Input placeholder="手动输入关联问题/工单编号（选填）" size="small" readOnly={readonly} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="is_accounting" label="是否涉账" initialValue="否" rules={required.rules('is_accounting', '是否涉账', { action: '请选择' })} style={{ marginBottom: 8 }}>
                    <Select
                      size="small"
                      options={[{ value: '否', label: '否' }, { value: '是', label: '是' }]}
                      style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }}
                      tabIndex={readonly ? -1 : undefined}
                    />
                  </Form.Item>
                </Col>
              </Row>

              {/* 工单概述 */}
              <Form.Item name="title" label="工单概述" rules={required.rules('title', '工单概述', { message: '请输入工单概述' })} style={{ marginBottom: 8 }}>
                <Input placeholder="请输入工单概述" size="small" readOnly={readonly} />
              </Form.Item>
              <Form.Item name="summary" label="工单详情" rules={required.rules('summary', '工单详情', { message: '请填写工单详情', extraRules: [{ max: 2000, message: '不超过 2000 字' }] })} style={{ marginBottom: 18 }}>
                <Input.TextArea rows={7} placeholder="描述该工单的核心背景与业务诉求（2000字以内）" showCount={!readonly} maxLength={2000} style={{ fontSize: 12 }} readOnly={readonly} />
              </Form.Item>
            </div>

          </Col>

          {/* ── 右栏 ── */}
          <Col xs={24} md={10}>

            {/* 涉及系统 */}
            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>涉及系统</div>

              {/* 主责系统：标题右侧选择框，单选（再选自动替换），已选展示在下方 */}
              <Form.Item name="main_systems" rules={required.rules('main_systems', '主责系统', { action: '请选择', type: 'array', min: 1 })}>
                <SystemPickerField title="主责系统" single placeholder="主责系统检索" readonly={readonly} />
              </Form.Item>

              {/* 协同改造系统：标题右侧选择框，可多选，已选展示在下方 */}
              <Form.Item name="collab_dev_systems" rules={required.rules('collab_dev_systems', '协同改造系统', { action: '请选择', type: 'array', min: 1 })}>
                <SystemPickerField title="协同改造系统" placeholder="协同改造系统检索" readonly={readonly} />
              </Form.Item>

              {/* 协同测试系统：标题右侧选择框，可多选，已选展示在下方 */}
              <Form.Item name="collab_test_systems" rules={required.rules('collab_test_systems', '协同测试系统', { action: '请选择', type: 'array', min: 1 })}>
                <SystemPickerField title="协同测试系统" placeholder="协同测试系统检索" readonly={readonly} />
              </Form.Item>
            </div>

            {/* 相关负责人 */}
            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>相关负责人</div>
              <Row gutter={8}>
                {/* 提出部门 + 提出人：手机端各占一行（充满），PC 端双栏 */}
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item name="propose_dept" label="提出部门" rules={required.rules('propose_dept', '提出部门', { action: '请选择' })} style={{ marginBottom: 8 }}>
                    <DictSelect category="req_dept" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} size="small" />
                  </Form.Item>
                </Col>
                <Col span={isMobile ? 24 : 12}>
                  <Form.Item name="proposer" label="提出人" rules={required.rules('proposer', '提出人', { action: '请选择', type: 'array', min: 1 })} style={{ marginBottom: 8 }}>
                    <PersonPickerField readonly={readonly} placeholder="选择提出人" />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="yn_owner" label="云南农信工单负责人" rules={required.rules('yn_owner', '云南农信工单负责人', { action: '请选择' })} style={{ marginBottom: 8 }}>
                <PersonPicker style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择云南农信工单负责人" size="small" />
              </Form.Item>
              <Form.Item name="jk_owner" label="建信金科工单负责人" rules={required.rules('jk_owner', '建信金科工单负责人', { action: '请选择' })} style={{ marginBottom: 0 }}>
                <PersonPicker style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择建信金科工单负责人" size="small" />
              </Form.Item>
            </div>
          </Col>
        </Row>
      </Form>

      <HistoryDrawer
        open={historyOpen}
        entityType="ticket"
        entityId={current?.id}
        onClose={() => setHistoryOpen(false)}
      />
    </EditorShell>
  );
}

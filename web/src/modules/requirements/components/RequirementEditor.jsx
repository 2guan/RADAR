/**
 * 文件：web/src/modules/requirements/components/RequirementEditor.jsx
 * 说明：需求明细抽屉编辑器，支持需求的创建、编辑、归属主责系统、附件关联以及各项开发/测试任务的联动修改。
 * 用途：需求新增/编辑弹窗（可复用：需求分析页与版本概览均使用）。
 *       双栏卡片布局；字体紧凑；需求说明书在基本信息下方；
 *       协同改造/测试系统采用下拉选择 + 外置已选区双模式展示。
 * 作者：hengguan
 */

import { useEffect, useRef, useState } from 'react';
import { Form, Input, DatePicker, Row, Col, Button, Select, Tag, message, Tooltip } from 'antd';
import { HistoryOutlined, CloseOutlined, ThunderboltOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { DictSelect, PersonPicker, makeReleasePointOptions } from '../../settings/reference-data/index.js';
import { StageBuiltinField, StageBuiltinFields, StageContentPanel, StageSectionLayout, useDefaultProcessStatus, useRequiredFields } from '../../settings/process-configuration/index.js';
import { HistoryDrawer } from '../../../platform/audit/index.js';
import { CodeLink } from '../../../platform/routing/index.js';
import { EditorShell } from '../../../shared/ui/index.js';
import { getStatusType, statusSelectWidth } from '../../../shared/workflow/index.js';
import { apiGet, apiPost, apiPut } from '../api/index.js';
import { useAppStore } from '../../../platform/state/app.js';
import { useResponsive } from '../../../platform/ui/useResponsive.js';

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

export default function RequirementEditor({ open, mode = 'modal', code, reqId, defaultReleasePointId, onClose, onSaved }) {
  const [form] = Form.useForm();
  const extensionPanelRef = useRef(null);
  const extensionRightPanelRef = useRef(null);
  const extensionFullPanelRef = useRef(null);
  // 监听需求状态，供标题栏内联选择器响应式回显
  const statusValue = Form.useWatch('status', form);
  const [current, setCurrent] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [points, setPoints] = useState([]);
  const [genLoading, setGenLoading] = useState(false); // 生成编号加载态
  const [isDirty, setIsDirty] = useState(false);
  const { can } = useAppStore();
  const { isMobile } = useResponsive();
  // 既有需求（按 id 或编号加载）即为编辑/查看态；其余为新增
  const isEdit = !!reqId || !!code || mode === 'page';
  const readonly = isEdit ? !can('requirement', 'edit') : !can('requirement', 'create');
  const statusEditable = can('requirement', 'status.edit');
  const required = useRequiredFields('requirement', getStatusType(statusValue), readonly);
  const visible = (fieldKey) => required.isVisible(fieldKey);
  const initialStatus = useDefaultProcessStatus('需求', 'initial', '需求登记');
  // 已关联开发/测试任务时，需求编号锁定不可改
  const codeLocked = !!current?.has_tasks;

  // 防抖 timer ref，供编号唯一性校验使用
  const debounceRef = useRef(null);

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
      apiGet(`/requirements/${reqId}`).then(applyRow);
    } else if (code) {
      apiGet(`/requirements/by-code/${encodeURIComponent(code)}`).then(applyRow);
    } else {
      setCurrent(null);
      form.resetFields();
      form.setFieldsValue({ status: initialStatus, is_accounting: '否', release_point_id: defaultReleasePointId });
    }
  }, [open, reqId, code, mode, initialStatus]);

  const save = async () => {
    const v = await form.validateFields();
    const payload = {
      ...v,
      propose_time: v.propose_time ? v.propose_time.format('YYYY-MM-DD') : null,
    };
    if (isEdit) {
      await Promise.all([extensionPanelRef, extensionRightPanelRef, extensionFullPanelRef].map((panel) => panel.current?.save()));
      await apiPut(`/requirements/${reqId ?? current?.id}`, payload);
      message.success('已保存');
    } else {
      const res = await apiPost('/requirements', payload);
      message.success(`已创建需求 ${res.req_code}`);
    }
    onSaved?.();
    onClose?.();   // 保存成功后关闭弹窗
  };

  const changeStatus = async (status) => {
    if (!statusEditable) return;
    if (!readonly) {
      form.setFieldValue('status', status);
      setIsDirty(true);
      return;
    }
    const id = reqId ?? current?.id;
    if (!id) return;
    try {
      await apiPut(`/requirements/${id}`, { status });
      form.setFieldValue('status', status);
      setCurrent((prev) => ({ ...prev, status }));
      message.success('状态已更新');
      onSaved?.();
    } catch (err) {
      message.error(err.message || '更新失败');
    }
  };

  /** 点击「生成编号」按钮 */
  const generateCode = async () => {
    const releasePointId = form.getFieldValue('release_point_id');
    if (!releasePointId) {
      message.warning('请先选择「计划投产点」');
      return;
    }
    setGenLoading(true);
    try {
      const res = await apiGet('/requirements/gen-code', { releasePointId });
      form.setFieldValue('req_code', res.req_code);
      // 触发校验以更新状态
      form.validateFields(['req_code']);
      message.success(`已预览编号：${res.req_code}（保存后正式占用）`);
    } catch (e) {
      message.error('生成失败，请稍后重试');
    } finally {
      setGenLoading(false);
    }
  };

  /** 防抖异步校验需求编号唯一性 */
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
          const res = await apiGet('/requirements/check-code', params);
          res.exists ? reject('需求编号已存在') : resolve();
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
          {(isEdit || current) && visible('req_code') ? (
            <CodeLink module="requirement" code={current?.req_code} fallback="REQ" />
          ) : !isEdit && !current ? (
            <span className="lc-id big" style={{ margin: 0, background: 'var(--radar-status-in-progress-soft)', color: 'var(--radar-status-in-progress)' }}>NEW</span>
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600 }}>需求详情</span>
          )}
          {/* 状态即使不展示也保留隐藏字段参与保存。 */}
          {visible('status') && (
            <span className={`status-select status-select-${getStatusType(statusValue)}`}>
              <DictSelect
                category="process_status"
                stage="需求"
                size="small"
                allowClear={false}
                showSearch={false}
                popupClassName="status-select-dropdown"
                popupMatchSelectWidth={false}
                value={statusValue}
                onChange={changeStatus}
                placeholder="需求状态"
                style={{ width: statusSelectWidth(statusValue, '需求状态'), ...(!statusEditable ? { pointerEvents: 'none' } : {}) }}
                tabIndex={statusEditable ? undefined : -1}
              />
            </span>
          )}
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
        <Row gutter={12} className="stage-detail-layout-requirement">
          <StageSectionLayout scopeKey="requirement" defaults={{
            basic: { layout_mode: 'left', sort: 0 }, systems: { layout_mode: 'right', sort: 10 }, owners: { layout_mode: 'right', sort: 20 },
          }} />
          {/* 需求状态改由标题栏内联编辑，此处保留隐藏字段以保证保存。 */}
          <Form.Item name="status" hidden><Input /></Form.Item>
          <StageBuiltinFields scopeKey="requirement" defaults={{
            basic: { title: '基本信息', layout_mode: 'left', sort: 0 },
            systems: { title: '涉及系统', layout_mode: 'right', sort: 10 },
            owners: { title: '相关负责人', layout_mode: 'right', sort: 20 },
          }}>
                {/* 需求编号 + 需求类型 */}
                <StageBuiltinField fieldKey="req_code" defaultSection="basic">
                    <Form.Item
                      name="req_code"
                      label={(
                        <span>
                          需求编号
                          {codeLocked && !isMobile && (
                            <span style={{ marginLeft: 6, fontWeight: 400, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                              （已关联，不可改）
                            </span>
                          )}
                        </span>
                      )}
                      style={{ marginBottom: 8 }}
                      rules={[
                        ...required.rules('req_code', '需求编号', { message: '请填写需求编号' }),
                        { pattern: /^\S+$/, message: '编号不能包含空格' },
                        { validator: (_, val) => checkCodeUnique(val) },
                      ]}
                      validateTrigger={['onBlur', 'onChange']}
                    >
                      <Input
                        placeholder="手填或点击「生成」"
                        size="small"
                        readOnly={readonly || codeLocked}
                        style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', letterSpacing: '0.3px' }}
                        suffix={(codeLocked || readonly) ? null : (
                          <Tooltip title="根据所选投产点预览编号；保存成功后才正式占用">
                            <Button
                              type="link"
                              size="small"
                              icon={<ThunderboltOutlined />}
                              loading={genLoading}
                              onClick={generateCode}
                              style={{ padding: 0, height: 'auto', fontSize: 13, color: 'var(--radar-primary)' }}
                            >
                              生成
                            </Button>
                          </Tooltip>
                        )}
                      />
                    </Form.Item>
                </StageBuiltinField>
                <StageBuiltinField fieldKey="req_type" defaultSection="basic">
                    <Form.Item name="req_type" label="需求类型" rules={required.rules('req_type', '需求类型', { action: '请选择' })} style={{ marginBottom: 8 }}>
                      <DictSelect category="req_type" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} size="small" />
                    </Form.Item>
                </StageBuiltinField>
                {/* 计划投产点 + 提出时间 */}
                <StageBuiltinField fieldKey="release_point_id" defaultSection="basic">
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
                </StageBuiltinField>
                <StageBuiltinField fieldKey="propose_time" defaultSection="basic">
                    <Form.Item name="propose_time" label="提出时间" rules={required.rules('propose_time', '提出时间', { action: '请选择' })} style={{ marginBottom: 8 }}>
                      <DatePicker size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择日期" />
                    </Form.Item>
                </StageBuiltinField>
                {/* 关联问题/工单编号 + 是否涉账 */}
                <StageBuiltinField fieldKey="issue_no" defaultSection="basic">
                    <Form.Item name="issue_no" label="关联问题/工单编号" rules={required.rules('issue_no', '关联问题/工单编号')} style={{ marginBottom: 8 }}>
                      <Input placeholder="手动输入关联问题/工单编号（选填）" size="small" readOnly={readonly} />
                    </Form.Item>
                </StageBuiltinField>
                <StageBuiltinField fieldKey="is_accounting" defaultSection="basic">
                    <Form.Item name="is_accounting" label="是否涉账" initialValue="否" rules={required.rules('is_accounting', '是否涉账', { action: '请选择' })} style={{ marginBottom: 8 }}>
                      <Select
                        size="small"
                        options={[{ value: '否', label: '否' }, { value: '是', label: '是' }]}
                        style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }}
                        tabIndex={readonly ? -1 : undefined}
                      />
                    </Form.Item>
                </StageBuiltinField>

              {/* 需求标题 */}
              <StageBuiltinField fieldKey="title" defaultSection="basic" defaultColumnSpan={24}>
                <Form.Item name="title" label="需求标题" rules={required.rules('title', '需求标题', { message: '请输入需求标题' })} style={{ marginBottom: 8 }}>
                  <Input placeholder="请输入需求标题" size="small" readOnly={readonly} />
                </Form.Item>
              </StageBuiltinField>
              <StageBuiltinField fieldKey="summary" defaultSection="basic" defaultColumnSpan={24}>
                <Form.Item name="summary" label="需求概述" rules={required.rules('summary', '需求概述', { message: '请填写需求概述', extraRules: [{ max: 2000, message: '不超过 2000 字' }] })} style={{ marginBottom: 18 }}>
                  <Input.TextArea rows={7} placeholder="描述该需求的核心背景与业务诉求（2000字以内）" showCount={!readonly} maxLength={2000} style={{ fontSize: 12 }} readOnly={readonly} />
                </Form.Item>
              </StageBuiltinField>

              {/* 主责系统：标题右侧选择框，单选（再选自动替换），已选展示在下方 */}
              <StageBuiltinField fieldKey="main_systems" defaultSection="systems" defaultColumnSpan={24}>
                <Form.Item name="main_systems" rules={required.rules('main_systems', '主责系统', { action: '请选择', type: 'array', min: 1 })}>
                  <SystemPickerField title="主责系统" single placeholder="主责系统检索" readonly={readonly} />
                </Form.Item>
              </StageBuiltinField>

              {/* 协同改造系统：标题右侧选择框，可多选，已选展示在下方 */}
              <StageBuiltinField fieldKey="collab_dev_systems" defaultSection="systems" defaultColumnSpan={24}>
                <Form.Item name="collab_dev_systems" rules={required.rules('collab_dev_systems', '协同改造系统', { action: '请选择', type: 'array', min: 1 })}>
                  <SystemPickerField title="协同改造系统" placeholder="协同改造系统检索" readonly={readonly} />
                </Form.Item>
              </StageBuiltinField>

              {/* 协同测试系统：标题右侧选择框，可多选，已选展示在下方 */}
              <StageBuiltinField fieldKey="collab_test_systems" defaultSection="systems" defaultColumnSpan={24}>
                <Form.Item name="collab_test_systems" rules={required.rules('collab_test_systems', '协同测试系统', { action: '请选择', type: 'array', min: 1 })}>
                  <SystemPickerField title="协同测试系统" placeholder="协同测试系统检索" readonly={readonly} />
                </Form.Item>
              </StageBuiltinField>

                {/* 提出部门 + 提出人：手机端各占一行（充满），PC 端双栏 */}
                <StageBuiltinField fieldKey="propose_dept" defaultSection="owners">
                    <Form.Item name="propose_dept" label="提出部门" rules={required.rules('propose_dept', '提出部门', { action: '请选择' })} style={{ marginBottom: 8 }}>
                      <DictSelect category="req_dept" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} size="small" />
                    </Form.Item>
                </StageBuiltinField>
                <StageBuiltinField fieldKey="proposer" defaultSection="owners">
                    <Form.Item name="proposer" label="提出人" rules={required.rules('proposer', '提出人', { action: '请选择', type: 'array', min: 1 })} style={{ marginBottom: 8 }}>
                      <PersonPickerField readonly={readonly} placeholder="选择提出人" />
                    </Form.Item>
                </StageBuiltinField>
              <StageBuiltinField fieldKey="yn_owner" defaultSection="owners" defaultColumnSpan={24}>
                <Form.Item name="yn_owner" label="云南农信业务负责人" rules={required.rules('yn_owner', '云南农信业务负责人', { action: '请选择' })} style={{ marginBottom: 8 }}>
                  <PersonPicker style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择云南农信业务负责人" size="small" />
                </Form.Item>
              </StageBuiltinField>
              <StageBuiltinField fieldKey="jk_owner" defaultSection="owners" defaultColumnSpan={24}>
                <Form.Item name="jk_owner" label="建信金科业务负责人" rules={required.rules('jk_owner', '建信金科业务负责人', { action: '请选择' })} style={{ marginBottom: 0 }}>
                  <PersonPicker style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} placeholder="选择建信金科业务负责人" size="small" />
                </Form.Item>
              </StageBuiltinField>
          </StageBuiltinFields>
          {/* 交付件与扩展信息均由公共配置渲染，移动交付件布局后立即跟随生效。 */}
          <StageContentPanel ref={extensionPanelRef} scopeKey="requirement" entityType="requirement" entityId={current?.id} readOnly={readonly} onDirtyChange={() => setIsDirty(true)} />
          <StageContentPanel ref={extensionRightPanelRef} scopeKey="requirement" entityType="requirement" entityId={current?.id} readOnly={readonly} position="right" onDirtyChange={() => setIsDirty(true)} />
          <StageContentPanel ref={extensionFullPanelRef} scopeKey="requirement" entityType="requirement" entityId={current?.id} readOnly={readonly} position="full" onDirtyChange={() => setIsDirty(true)} />
        </Row>
      </Form>

      <HistoryDrawer
        open={historyOpen}
        entityType="requirement"
        entityId={current?.id}
        onClose={() => setHistoryOpen(false)}
      />
    </EditorShell>
  );
}

/**
 * 文件：components/editors/ReleaseApplyEditor.jsx
 * 用途：投产申请（版本变更申请）新增/编辑弹窗。新增时上方 TAB 选择需求/工单（可多选），
 *       已选逐条列出；下方填写变更编号（可自动生成）、变更系统（按所选需求/工单推荐）、
 *       变更内容、影响范围、实施机构（按系统所属机构返显，可编辑）、制品类型、新版本号等。
 * 作者：hengguan
 * 说明：评审状态由所关联需求的投产审批评审状态派生（后端计算，前端只读展示）。
 */

import React, { useEffect, useRef, useState } from 'react';
import { Form, Input, Row, Col, Button, Select, Tabs, Tag, Space, message, Tooltip } from 'antd';
import { HistoryOutlined, CloseOutlined, ThunderboltOutlined, PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import DictSelect from '../DictSelect.jsx';
import SystemSelect from '../SystemSelect.jsx';
import StatusBadge from '../StatusBadge.jsx';
import HistoryDrawer from '../HistoryDrawer.jsx';
import CodeLink from '../CodeLink.jsx';
import EditorShell from './EditorShell.jsx';
import { apiGet, apiPost, apiPut } from '../../api/client.js';
import { useAppStore } from '../../stores/app.js';
import { useResponsive } from '../../hooks/useResponsive.js';

export default function ReleaseApplyEditor({ open, mode = 'modal', code, applyId, defaultReleasePointId, defaultReqCodes, defaultTicketCodes, defaultType = 'req', onClose, onSaved }) {
  const [form] = Form.useForm();
  // 监听计划投产点，用于与所选需求的投产点做一致性校验提示
  const releasePointIdValue = Form.useWatch('release_point_id', form);
  const [current, setCurrent] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const { can } = useAppStore();
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const { isMobile } = useResponsive();
  // 既有申请（按 id 或变更编号加载）即为编辑/查看态；其余为新增
  const isEdit = !!applyId || !!code || mode === 'page';
  const readonly = isEdit ? !can('release_apply', 'edit') : !can('release_apply', 'create');

  // 自动生成变更编号并填充
  const autoGenCode = (pointId) => {
    if (isEdit) return;
    apiGet('/release-apply/gen-code', pointId ? { releasePointId: pointId } : {})
      .then((res) => {
        form.setFieldValue('change_code', res.change_code);
        form.validateFields(['change_code']);
      })
      .catch(() => {});
  };

  // 关联需求/工单选择
  const [points, setPoints] = useState([]);
  const [reqs, setReqs] = useState([]);       // 需求列表 [{req_code,title,main_systems,collab_dev_systems}]
  const [tickets, setTickets] = useState([]); // 工单列表 [{ticket_code,title,main_systems,collab_dev_systems}]
  const [systems, setSystems] = useState([]); // 系统 [{sys_code,sys_name,org,out_dept,deploy_dept}]
  const [selReqs, setSelReqs] = useState([]); // 已选需求编号
  const [selTickets, setSelTickets] = useState([]); // 已选工单编号
  const [refTab, setRefTab] = useState('req');
  const [isDirty, setIsDirty] = useState(false);

  const debounceRef = useRef(null);

  useEffect(() => {
    if (mode !== 'page' && !open) return;
    setIsDirty(false);
    apiGet('/release-points/all').then(setPoints).catch(() => {});
    apiGet('/systems/all').then(setSystems).catch(() => {});
    // 加载全部需求/工单（不限投产窗口），以便跨窗口关联与投产点一致性校验
    apiPost('/requirements/list', { pageSize: 0, releasePointIds: [] }).then((d) => setReqs(d?.list || [])).catch(() => {});
    apiPost('/tickets/list', { pageSize: 0, releasePointIds: [] }).then((d) => setTickets(d?.list || [])).catch(() => {});

    if (applyId) {
      apiGet(`/release-apply/${applyId}`).then((d) => {
        setCurrent(d);
        form.setFieldsValue(d);
      });
    } else if (code) {
      apiGet(`/release-apply/by-code/${encodeURIComponent(code)}`).then((d) => { setCurrent(d); form.setFieldsValue(d); });
    } else {
      setCurrent(null);
      setSelReqs(Array.isArray(defaultReqCodes) ? [...defaultReqCodes] : []);
      setSelTickets(Array.isArray(defaultTicketCodes) ? [...defaultTicketCodes] : []);
      setRefTab(defaultType === 'ticket' ? 'ticket' : 'req');
      form.resetFields();
      form.setFieldsValue({
        delivery_units: [{ artifact_type: undefined, delivery_unit: undefined, new_version: undefined, ferry_status: '未摆渡' }],
        release_point_id: defaultReleasePointId,
      });
      autoGenCode(defaultReleasePointId);
    }
  }, [open, applyId, code, mode, defaultType, JSON.stringify(defaultReqCodes), JSON.stringify(defaultTicketCodes), defaultReleasePointId]);

  // 编辑态：把已存 ref_codes 拆分为需求/工单；历史问题引用不再展示
  useEffect(() => {
    if (!current || !current.ref_codes) return;
    const reqCodes = new Set(reqs.map((r) => r.req_code));
    const ticketCodes = new Set(tickets.map((t) => t.ticket_code));
    const sr = [];
    const st = [];
    for (const code of current.ref_codes) {
      if (ticketCodes.has(code)) st.push(code);
      else if (reqCodes.has(code)) sr.push(code);
    }
    setSelReqs(sr);
    setSelTickets(st);
  }, [current, reqs, tickets]);

  const sysMap = {};
  for (const s of systems) sysMap[s.sys_code] = s;

  // 变更系统推荐：需求/工单取主责系统+协同改造系统
  const recommendedSystems = (() => {
    const set = new Set();
    for (const code of selReqs) {
      const r = reqs.find((x) => x.req_code === code);
      if (!r) continue;
      (r.main_systems || []).forEach((c) => set.add(c));
      (r.collab_dev_systems || []).forEach((c) => set.add(c));
    }
    for (const code of selTickets) {
      const t = tickets.find((x) => x.ticket_code === code);
      if (!t) continue;
      (t.main_systems || []).forEach((c) => set.add(c));
      (t.collab_dev_systems || []).forEach((c) => set.add(c));
    }
    return [...set];
  })();

  const reqOptions = reqs.map((r) => ({ value: r.req_code, label: `${r.req_code}　${r.title}` }));
  const ticketOptions = tickets.map((t) => ({
    value: t.ticket_code,
    label: `${t.ticket_code}　${t.title}${t.release_date ? `　${t.release_date}` : ''}`,
  }));
  // ── 计划投产点与所选需求/工单的一致性校验（仅提示，不阻断提交） ──
  const selectedReqObjs = selReqs.map((c) => reqs.find((r) => r.req_code === c)).filter(Boolean);
  const selectedTicketObjs = selTickets.map((c) => tickets.find((t) => t.ticket_code === c)).filter(Boolean);
  const selectedWorkItems = [...selectedReqObjs, ...selectedTicketObjs];
  // 取第一个需求/工单的计划投产点
  const firstReqPointId = selectedWorkItems[0]?.release_point_id ?? null;
  // 所选多个需求/工单是否分属不同投产点
  const reqPointIds = [...new Set(selectedWorkItems.map((r) => r.release_point_id).filter((v) => v != null))];
  const multiReqDiffer = reqPointIds.length > 1;
  // 当前填写的计划投产点与首个需求/工单不一致
  const pointMismatch = selectedWorkItems.length > 0 && firstReqPointId != null
    && releasePointIdValue != null && Number(releasePointIdValue) !== Number(firstReqPointId);

  /** 选择需求：联动把计划投产点设为首个需求的计划投产点（仅新增态有下拉，可再手改） */
  const onSelReqsChange = (vals) => {
    setSelReqs(vals);
    if (!readonly) setIsDirty(true);
    const first = reqs.find((r) => r.req_code === vals[0]);
    if (first && first.release_point_id != null) {
      form.setFieldValue('release_point_id', first.release_point_id);
      autoGenCode(first.release_point_id);
    }
  };

  /** 选择工单：联动把计划投产点设为首个工单的计划投产点（与需求规则一致） */
  const onSelTicketsChange = (vals) => {
    setSelTickets(vals);
    if (!readonly) setIsDirty(true);
    const first = tickets.find((t) => t.ticket_code === vals[0]);
    if (first && first.release_point_id != null) {
      form.setFieldValue('release_point_id', first.release_point_id);
      autoGenCode(first.release_point_id);
    }
  };

  /** 选择变更系统后按系统所属机构返显实施机构（可再编辑） */
  const applySystem = (val) => {
    form.setFieldValue('change_system', val);
    const sys = sysMap[val];
    if (sys?.org) form.setFieldValue('impl_org', sys.org);
    form.setFieldValue('out_dept', sys?.out_dept || null);
    form.setFieldValue('deploy_dept', sys?.deploy_dept || null);
  };

  /** 表单值变化：变更系统改变时返显实施机构，同时标记脏状态 */
  const onValuesChange = (changed) => {
    if (!readonly) setIsDirty(true);
    if (Object.prototype.hasOwnProperty.call(changed, 'change_system')) {
      const sys = sysMap[changed.change_system];
      if (sys?.org) form.setFieldValue('impl_org', sys.org);
      form.setFieldValue('out_dept', sys?.out_dept || null);
      form.setFieldValue('deploy_dept', sys?.deploy_dept || null);
    }
    if (Object.prototype.hasOwnProperty.call(changed, 'release_point_id')) {
      if (changed.release_point_id) {
        autoGenCode(changed.release_point_id);
      }
    }
  };

  const save = async () => {
    if (!readonly && selReqs.length + selTickets.length === 0) {
      message.error('请至少关联 1 个需求或工单');
      return;
    }
    const v = await form.validateFields();
    const ref_codes = [...new Set([...selReqs, ...selTickets])];
    const payload = { ...v, ref_codes };
    if (isEdit) {
      await apiPut(`/release-apply/${applyId ?? current?.id}`, payload);
      message.success('已保存');
    } else {
      const res = await apiPost('/release-apply', payload);
      message.success(`已创建投产申请 ${res.change_code}`);
    }
    onSaved?.();
    onClose?.();
  };

  const generateCode = async () => {
    setGenLoading(true);
    try {
      const releasePointId = form.getFieldValue('release_point_id');
      const res = await apiGet('/release-apply/gen-code', releasePointId ? { releasePointId } : {});
      form.setFieldValue('change_code', res.change_code);
      form.validateFields(['change_code']);
      message.success(`已生成编号：${res.change_code}`);
    } catch {
      message.error('生成失败，请稍后重试');
    } finally {
      setGenLoading(false);
    }
  };

  const checkCodeUnique = (code) =>
    new Promise((resolve, reject) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const trimmed = (code || '').trim();
      if (!trimmed) { resolve(); return; }
      debounceRef.current = setTimeout(async () => {
        try {
          const params = { code: trimmed };
          const excludeId = applyId ?? current?.id;
          if (excludeId) params.excludeId = excludeId;
          const res = await apiGet('/release-apply/check-code', params);
          res.exists ? reject('变更编号已存在') : resolve();
        } catch { resolve(); }
      }, 400);
    });

  /** 移除一个已选需求/工单 */
  const removeRef = (code, type) => {
    if (type === 'req') setSelReqs((p) => p.filter((x) => x !== code));
    else setSelTickets((p) => p.filter((x) => x !== code));
    if (!readonly) setIsDirty(true);
  };

  // 已选需求/工单合并展示区（带底纹）。编辑态不可修改（无关闭按钮）。
  const closableRef = !readonly && !isEdit;
  const CombinedSelected = () => {
    const items = [
      ...selReqs.map((c) => ({ code: c, type: 'req', label: reqs.find((r) => r.req_code === c)?.title || '' })),
      ...selTickets.map((c) => ({ code: c, type: 'ticket', label: tickets.find((t) => t.ticket_code === c)?.title || '' })),
    ];
    return (
      <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--radar-primary-soft)', border: '1px solid var(--radar-border)', borderRadius: 2, minHeight: 38, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {items.length === 0 ? (
          <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>暂无关联需求/工单</span>
        ) : items.map((it) => (
          <Tag key={`${it.type}-${it.code}`} className="tag-system" style={{ borderRadius: 2, margin: 0, fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            closable={closableRef} closeIcon={closableRef ? <CloseOutlined style={{ fontSize: 10 }} /> : null} onClose={() => removeRef(it.code, it.type)}>
            <span style={{ opacity: 0.65 }}>{it.type === 'req' ? '需求' : '工单'}</span>
            <strong>{it.code}</strong>{it.label ? `　${it.label.slice(0, 14)}` : ''}
          </Tag>
        ))}
      </div>
    );
  };

  return (
    <EditorShell
      mode={mode}
      open={open}
      width={980}
      okText="提交申请"
      onOk={save}
      onCancel={onClose}
      isDirty={!readonly && isDirty}
      okButtonProps={readonly ? { style: { display: 'none' } } : undefined}
      cancelText={readonly ? '关闭' : '取消'}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, minWidth: 0, width: '100%', paddingRight: 76 }}>
          {isEdit || current ? (
            <CodeLink module="release_apply" code={current?.change_code} fallback="CHG" />
          ) : (
            <span className="lc-id big" style={{ margin: 0, background: 'var(--radar-status-in-progress-soft)', color: 'var(--radar-status-in-progress)' }}>NEW</span>
          )}
          {current?.review_status && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>评审状态</span>
              <StatusBadge status={current.review_status} />
            </span>
          )}
          {current && (
            <Tooltip title="变更历史">
              <Button type="text" icon={<HistoryOutlined style={{ fontSize: 16 }} />} onClick={() => setHistoryOpen(true)} aria-label="变更历史"
                style={{ position: 'absolute', top: 12, right: 48, width: 32, height: 32, borderRadius: 2, color: 'var(--radar-text-secondary)' }} />
            </Tooltip>
          )}
        </div>
      )}
    >
      <Form form={form} layout="vertical" requiredMark={false} className="editor-form" onValuesChange={onValuesChange} style={{ marginTop: 10, fontSize: 12 }}>
        <Row gutter={12}>
          {/* ── 左栏：关联需求/工单 + 变更内容 ── */}
          <Col xs={24} md={12}>
            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>
                关联需求/工单
                {!isEdit && <span style={{ fontWeight: 400, color: 'var(--radar-text-secondary)', marginLeft: 6, fontSize: 11 }}>（可多选）</span>}
              </div>
              {/* 新增时显示 TAB 下拉选择；编辑时不可修改，仅展示已选 */}
              {!isEdit && (
                <Tabs
                  size="small"
                  activeKey={refTab}
                  onChange={setRefTab}
                  items={[
                    {
                      key: 'req', label: `需求${selReqs.length ? `（${selReqs.length}）` : ''}`,
                      children: (
                        <Select
                          mode="multiple" value={selReqs} onChange={onSelReqsChange} options={reqOptions}
                          size="small" showSearch allowClear={false} optionFilterProp="label" placeholder="按需求编号或标题检索"
                          style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} maxTagCount={0}
                          tabIndex={readonly ? -1 : undefined}
                        />
                      ),
                    },
                    {
                      key: 'ticket', label: `工单${selTickets.length ? `（${selTickets.length}）` : ''}`,
                      children: (
                        <Select
                          mode="multiple" value={selTickets} onChange={onSelTicketsChange} options={ticketOptions}
                          size="small" showSearch allowClear={false} optionFilterProp="label" placeholder="按工单编号或概述检索"
                          style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} maxTagCount={0}
                          tabIndex={readonly ? -1 : undefined}
                        />
                      ),
                    },
                  ]}
                />
              )}
              {/* 已选需求、工单合并展示在带底纹的区域 */}
              <CombinedSelected />
            </div>

            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>变更内容</div>
              <Form.Item name="change_content" label="变更内容" rules={[{ required: !readonly, message: '请输入变更内容' }]} style={{ marginBottom: 8 }}>
                <Input.TextArea rows={4} placeholder="详细描述本次变更内容" style={{ fontSize: 12 }} readOnly={readonly} />
              </Form.Item>
              <Form.Item name="impact_scope" label="影响范围" style={{ marginBottom: 0 }}>
                <Input.TextArea rows={3} placeholder="描述本次变更的影响范围（非必填）" style={{ fontSize: 12 }} readOnly={readonly} />
              </Form.Item>
            </div>
          </Col>

          {/* ── 右栏：变更明细 ── */}
          <Col xs={24} md={12}>
            <div className="form-section-card">
              <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>变更明细</div>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item name="change_code" label="变更编号"
                    rules={[{ pattern: /^\S+$/, message: '编号不能包含空格' }, { validator: (_, val) => checkCodeUnique(val) }]}
                    validateTrigger={['onBlur', 'onChange']} style={{ marginBottom: 8 }}>
                    <Input placeholder="手填或点击「生成」" size="small" readOnly={readonly || isEdit}
                      style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', letterSpacing: '0.3px' }}
                      suffix={(readonly || isEdit) ? null : (
                        <Tooltip title="按编号规则自动生成">
                          <Button type="link" size="small" icon={<ThunderboltOutlined />} loading={genLoading} onClick={generateCode}
                            style={{ padding: 0, height: 'auto', fontSize: 13, color: 'var(--radar-primary)' }}>生成</Button>
                        </Tooltip>
                      )} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="release_point_id" label="计划投产点" rules={[{ required: !readonly, message: '请选择计划投产点' }]} style={{ marginBottom: (multiReqDiffer || pointMismatch) ? 2 : 8 }}>
                    <Select placeholder="选择计划投产点" size="small" allowClear showSearch optionFilterProp="label"
                      style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined}
                      options={points.map((p) => ({ value: p.id, label: `${p.release_date}${p.version_type ? ' · ' + p.version_type : ''}` }))} />
                  </Form.Item>
                  {/* 投产点一致性提示（仅提示，不阻断保存） */}
                  {multiReqDiffer && (
                    <div style={{ color: 'var(--radar-error, #ff4d4f)', fontSize: 11, lineHeight: 1.4, marginBottom: 4 }}>选择的多个需求/工单不在同一投产点</div>
                  )}
                  {pointMismatch && (
                    <div style={{ color: 'var(--radar-error, #ff4d4f)', fontSize: 11, lineHeight: 1.4, marginBottom: 4 }}>选择投产点与需求/工单计划投产点不一致</div>
                  )}
                </Col>
              </Row>

              <Form.Item name="change_system" label="变更系统" rules={[{ required: !readonly, message: '请选择变更系统' }]} style={{ marginBottom: 4 }}>
                <SystemSelect single size="small" placeholder="输入系统编号或名称检索"
                  style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} />
              </Form.Item>
              {!readonly && recommendedSystems.length > 0 && (
                <div style={{ marginBottom: 8, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>快捷选择：</span>
                  {recommendedSystems.map((code) => (
                    <Tag key={code} style={{ borderRadius: 2, margin: 0, cursor: 'pointer', fontSize: 11, background: 'transparent', border: '1px solid var(--radar-border)', color: 'var(--radar-text-secondary)' }}
                      onClick={() => applySystem(code)}>
                      {code}{sysMap[code] ? ` - ${sysMap[code].sys_name}` : ''}
                    </Tag>
                  ))}
                </div>
              )}

              <Form.Item name="impl_org" label="实施机构" style={{ marginBottom: 8 }}>
                <DictSelect category="org" size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} />
              </Form.Item>

              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item name="out_dept" label="变更负责部门（输出口径）" style={{ marginBottom: 0 }}>
                    <DictSelect category="org" size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="deploy_dept" label="变更负责部门（部署口径）" style={{ marginBottom: 0 }}>
                    <DictSelect category="org" size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} />
                  </Form.Item>
                </Col>
              </Row>
            </div>
          </Col>
        </Row>

        {/* ── 交付制品（独立整宽模块，PC 端一组一行，可添加多组） ── */}
        <div className="form-section-card">
          <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>
            交付制品
            <span style={{ fontWeight: 400, color: 'var(--radar-text-secondary)', marginLeft: 6, fontSize: 11 }}>（一组制品类型/交付单元名称/新版本号/摆渡状态，可添加多组）</span>
          </div>
          <Form.List name="delivery_units">
            {(fields, { add, remove }) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {fields.map((field, idx) => (
                  <div key={field.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', paddingBottom: idx < fields.length - 1 ? 8 : 0, borderBottom: idx < fields.length - 1 ? '1px dashed var(--radar-border)' : 'none' }}>
                    <div style={{ width: 18, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--radar-text-secondary)', paddingBottom: 6, flexShrink: 0 }}>{idx + 1}</div>
                    <Form.Item name={[field.name, 'artifact_type']} label={idx === 0 ? '制品类型' : undefined} rules={[{ required: !readonly, message: '请选择制品类型' }]} style={{ marginBottom: 0, flex: '1 1 130px', minWidth: 120 }}>
                      <DictSelect category="artifact_type" size="small" style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'delivery_unit']} label={idx === 0 ? '交付单元名称（介质库路径/文件名）' : undefined} rules={[{ required: !readonly, message: '请填写交付单元名称' }]} style={{ marginBottom: 0, flex: '2 1 220px', minWidth: 180 }}>
                      <Input size="small" placeholder="介质库路径 / 文件名" readOnly={readonly} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'new_version']} label={idx === 0 ? '新版本号' : undefined} rules={[{ required: !readonly, message: '请填写新版本号' }]} style={{ marginBottom: 0, flex: '1 1 110px', minWidth: 100 }}>
                      <Input size="small" placeholder="如 V1.2.0" readOnly={readonly} />
                    </Form.Item>
                    {/* 摆渡状态：仅编辑时显示；新增默认「未摆渡」（由后端默认值写入） */}
                    {isEdit && (
                      <Form.Item name={[field.name, 'ferry_status']} label={idx === 0 ? '摆渡状态' : undefined} style={{ marginBottom: 0, flex: '1 1 120px', minWidth: 110 }}>
                        <DictSelect category="ferry_status" size="small" allowClear={false} style={{ width: '100%', ...(readonly ? { pointerEvents: 'none' } : {}) }} tabIndex={readonly ? -1 : undefined} />
                      </Form.Item>
                    )}
                    {!readonly && fields.length > 1 && (
                      <Button type="text" size="small" danger icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} style={{ marginBottom: 2, flexShrink: 0 }} />
                    )}
                  </div>
                ))}
                {!readonly && (
                  <Button type="dashed" size="small" icon={<PlusOutlined />} block style={{ marginTop: 2 }}
                    onClick={() => add({ artifact_type: undefined, delivery_unit: undefined, new_version: undefined, ferry_status: '未摆渡' })}>
                    添加交付制品
                  </Button>
                )}
              </div>
            )}
          </Form.List>
        </div>
      </Form>

      <HistoryDrawer open={historyOpen} entityType="release_apply" entityId={current?.id} onClose={() => setHistoryOpen(false)} />
    </EditorShell>
  );
}

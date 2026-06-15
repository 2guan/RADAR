/**
 * 文件：components/editors/ReleaseDetail.jsx
 * 用途：投产审批详情弹窗（可复用：投产审批页与版本概览）。展示实体（需求/问题）基本信息、评审会签、
 *       投产信息、关联制品情况（引用了本需求/问题的投产申请制品）。
 * 作者：hengguan
 * 说明：审批对象为需求或问题，由后端 entityType 区分；首次打开惰性创建投产任务与会签项。
 *       「各系统投产登记」已改为「关联制品情况」，按卡片只读展示投产申请的制品信息。
 */

import React, { useEffect, useState } from 'react';
import { Modal, Card, Space, Button, Input, message, Empty, Row, Col, Radio, Tooltip, Tag } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import HistoryDrawer from '../HistoryDrawer.jsx';
import StatusBadge, { getStatusType, statusSelectWidth } from '../StatusBadge.jsx';
import DictSelect from '../DictSelect.jsx';
import PersonPicker from '../PersonPicker.jsx';
import { apiGet, apiPost, apiPut } from '../../api/client.js';
import { useAppStore } from '../../stores/app.js';

const getWeakestDevStatus = (statuses) => {
  if (!statuses || statuses.length === 0) return '未开始';
  const order = { '开发承接': 1, '开发设计': 2, '开发实施': 3, '单元测试': 4, '开发完成': 5 };
  let weakest = null;
  let minRank = Infinity;
  for (const s of statuses) {
    const rank = order[s] ?? 999;
    if (rank < minRank) { minRank = rank; weakest = s; }
  }
  return weakest || '未开始';
};

/** 阶段进度小卡片 */
function StageChip({ label, children }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--radar-surface)', border: '1px solid var(--radar-border)', borderRadius: 2, padding: '4px 8px' }}>
      <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)', fontWeight: 500 }}>{label}</span>
      {children}
    </div>
  );
}

export default function ReleaseDetail({ open, code, reqCode, onClose, onChanged }) {
  const entityCode = code ?? reqCode;
  const { user, can } = useAppStore();
  const [detail, setDetail] = useState(null);
  const [owner, setOwner] = useState(null);

  // 会签弹窗状态
  const [signOpen, setSignOpen] = useState(false);
  const [currentSignoff, setCurrentSignoff] = useState(null);
  const [signResult, setSignResult] = useState('已签署');
  const [signConclusion, setSignConclusion] = useState('');

  const [historyOpen, setHistoryOpen] = useState(false);

  const reload = async () => {
    if (!entityCode) return;
    try {
      const res = await apiGet(`/release/${entityCode}`);
      setDetail(res);
      if (res?.releaseTask) setOwner(res.releaseTask.owner);
    } catch (e) {
      message.error(e.message || '加载详情失败');
    }
  };

  useEffect(() => {
    if (open && entityCode) reload();
    if (!open) setDetail(null);
  }, [open, entityCode]);

  const canSign = (so) => can('release', 'release.signoff')
    && (user?.isSuper || (user?.roles || []).some((r) => r.name === so.role_name));

  const handleOpenSign = (so) => {
    setCurrentSignoff(so);
    setSignResult(so.result === '已驳回' ? '已驳回' : '已签署');
    setSignConclusion(so.conclusion || '');
    setSignOpen(true);
  };

  const handleOwnerChange = async (val) => {
    setOwner(val);
    try {
      await apiPut(`/release/${entityCode}`, { owner: val });
      message.success('已更新投产负责人');
      reload();
      onChanged?.();
    } catch (e) {
      message.error(e.message || '更新失败');
    }
  };

  const SignoffCard = ({ so }) => {
    const clickable = canSign(so);
    return (
      <Card size="small" hoverable={clickable} styles={{ body: { padding: '6px 8px' } }}
        style={{ cursor: clickable ? 'pointer' : 'default', borderColor: 'var(--radar-border)', height: '100%', boxShadow: 'none' }}
        onClick={() => { if (clickable) handleOpenSign(so); }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <strong style={{ fontSize: 12, color: 'var(--radar-ink)' }}>{so.role_name}</strong>
          <StatusBadge status={so.result} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
          <div><span style={{ display: 'inline-block', width: 55 }}>签署人：</span><span style={{ color: 'var(--radar-ink)' }}>{so.signer_name || '—'}</span></div>
          <div><span style={{ display: 'inline-block', width: 55 }}>签署时间：</span><span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{so.sign_time || '—'}</span></div>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ display: 'inline-block', width: 55, flexShrink: 0 }}>签署意见：</span><span style={{ color: 'var(--radar-ink)', wordBreak: 'break-all' }}>{so.conclusion || '—'}</span></div>
        </div>
      </Card>
    );
  };

  // 关联制品卡片（只读）：含各部署单元的摆渡状态
  const ArtifactCard = ({ a }) => {
    const units = Array.isArray(a.units) ? a.units : [];
    return (
      <Card size="small" styles={{ body: { padding: '8px 10px' } }}
        style={{ borderColor: 'var(--radar-border)', boxShadow: 'none', marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--radar-ink)', fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{a.change_code}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
          <div>系统：<span style={{ color: 'var(--radar-ink)' }}>{a.change_system_name || '—'}</span></div>
          <div>实施机构：<span style={{ color: 'var(--radar-ink)' }}>{a.impl_org || '—'}</span></div>
          <div style={{ wordBreak: 'break-all' }}>变更内容：<span style={{ color: 'var(--radar-ink)' }}>{a.change_content || '—'}</span></div>
        </div>
        {/* 各部署单元（制品类型 / 新版本号 / 交付单元名称 + 摆渡状态） */}
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {units.length === 0 ? (
            <div style={{ fontSize: 11, color: '#bbb' }}>无交付制品</div>
          ) : units.map((u, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: 'var(--radar-bg)', border: '1px solid var(--radar-border)', borderRadius: 2, padding: '4px 6px' }}>
              {u.artifact_type && <Tag className="status-tag tag-system" style={{ margin: 0, borderRadius: 2 }}>{u.artifact_type}</Tag>}
              {u.new_version && <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: 11, color: 'var(--radar-ink)' }}>{u.new_version}</span>}
              {u.delivery_unit && <span title={u.delivery_unit} style={{ fontSize: 11, color: 'var(--radar-text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.delivery_unit}</span>}
              <span style={{ marginLeft: 'auto' }}><StatusBadge status={u.ferry_status || '未摆渡'} /></span>
            </div>
          ))}
        </div>
      </Card>
    );
  };

  const entityType = detail?.entityType;
  const entity = detail?.entity;
  const ts = detail?.taskStatuses;
  const statusValue = detail?.releaseTask?.status;
  const reviewStatus = detail?.releaseTask?.review_status;
  const editable = can('release', 'edit');

  return (
    <Modal
      open={open}
      width={980}
      footer={null}
      onCancel={onClose}
      destroyOnHidden
      styles={{ body: { fontSize: 12 } }}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, minWidth: 0, width: '100%', paddingRight: 76 }}>
          <span className="lc-id big" style={{ margin: 0 }}>{entityCode || '—'}</span>
          {detail?.releaseTask && (
            <span className={`status-select status-select-${getStatusType(statusValue)}`}>
              <DictSelect
                category="release_status" size="small" allowClear={false} showSearch={false}
                popupClassName="status-select-dropdown" popupMatchSelectWidth={false}
                value={statusValue}
                onChange={async (v) => {
                  try { await apiPut(`/release/${entityCode}`, { status: v }); message.success('已更新投产状态'); reload(); onChanged?.(); }
                  catch (e) { message.error(e.message || '更新失败'); }
                }}
                placeholder="投产状态"
                style={{ width: statusSelectWidth(statusValue, '投产状态'), ...(!editable ? { pointerEvents: 'none' } : {}) }}
              />
            </span>
          )}
          {detail?.releaseTask && (
            <Tooltip title="变更历史">
              <Button type="text" icon={<HistoryOutlined style={{ fontSize: 16 }} />} onClick={() => setHistoryOpen(true)} aria-label="变更历史"
                style={{ position: 'absolute', top: 12, right: 48, width: 32, height: 32, borderRadius: 2, color: 'var(--radar-text-secondary)' }} />
            </Tooltip>
          )}
        </div>
      )}
    >
      {!detail ? (
        <div style={{ padding: '40px 0' }}><Empty /></div>
      ) : (
        <div className="editor-form" style={{ marginTop: 10 }}>
          <Row gutter={12}>
            {/* ── 左栏 ── */}
            <Col xs={24} md={14}>
              {/* 基本信息 */}
              <div className="form-section-card">
                <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>基本信息</div>

                {entityType === 'requirement' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <strong style={{ fontSize: 13, color: 'var(--radar-ink)', display: 'block', marginBottom: 2 }}>{entity.title}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>计划投产点：</span>
                        <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', color: 'var(--radar-ink)', fontSize: 11 }}>{entity.release_date || '—'}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--radar-ink)', background: 'var(--radar-bg)', padding: '6px 10px', borderRadius: 2, maxHeight: 80, overflowY: 'auto', border: '1px solid var(--radar-border)', whiteSpace: 'pre-wrap', lineHeight: '16px' }}>
                      {entity.summary || '无概述内容'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      <StageChip label="需求"><StatusBadge status={entity.status} /></StageChip>
                      <StageChip label="开发"><StatusBadge status={getWeakestDevStatus(ts?.dev)} /></StageChip>
                      <StageChip label="应用组装">
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(!ts?.sit || ts.sit.length === 0) ? <StatusBadge status="未开始" /> : ts.sit.map((s, i) => <StatusBadge key={i} status={s} />)}
                        </div>
                      </StageChip>
                      <StageChip label="用户测试">
                        <div style={{ display: 'flex', gap: 4 }}>
                          {(!ts?.uat || ts.uat.length === 0) ? <StatusBadge status="未开始" /> : ts.uat.map((s, i) => <StatusBadge key={i} status={s} />)}
                        </div>
                      </StageChip>
                      {ts?.nft && ts.nft.length > 0 && (
                        <StageChip label="非功能测试"><div style={{ display: 'flex', gap: 4 }}>{ts.nft.map((s, i) => <StatusBadge key={i} status={s} />)}</div></StageChip>
                      )}
                      {ts?.sec && ts.sec.length > 0 && (
                        <StageChip label="安全测试"><div style={{ display: 'flex', gap: 4 }}>{ts.sec.map((s, i) => <StatusBadge key={i} status={s} />)}</div></StageChip>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>问题状态：</span>
                        {entity.status ? <StatusBadge status={entity.status} /> : <span style={{ fontSize: 11 }}>—</span>}
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>计划投产点：</span>
                        <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', color: 'var(--radar-ink)', fontSize: 11 }}>{entity.release_date || '—'}</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--radar-ink)', marginBottom: 2 }}>问题概述</div>
                      <div style={{ fontSize: 11, color: 'var(--radar-ink)', background: 'var(--radar-bg)', padding: '6px 10px', borderRadius: 2, border: '1px solid var(--radar-border)', whiteSpace: 'pre-wrap', lineHeight: '16px' }}>
                        {entity.summary || '无概述内容'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--radar-ink)', marginBottom: 2 }}>问题详情</div>
                      <div style={{ fontSize: 11, color: 'var(--radar-ink)', background: 'var(--radar-bg)', padding: '6px 10px', borderRadius: 2, border: '1px solid var(--radar-border)', whiteSpace: 'pre-wrap', lineHeight: '16px', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {entity.details || '无详情内容'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 评审会签 */}
              <div className="form-section-card">
                <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>评审会签</span>
                  <span className={`status-select status-select-${getStatusType(reviewStatus)}`}>
                    <DictSelect
                      category="review_status" size="small" allowClear={false} showSearch={false}
                      popupClassName="status-select-dropdown" popupMatchSelectWidth={false}
                      value={reviewStatus}
                      onChange={async (v) => {
                        try { await apiPut(`/release/${entityCode}`, { review_status: v }); message.success('已更新评审状态'); reload(); onChanged?.(); }
                        catch (e) { message.error(e.message || '更新失败'); }
                      }}
                      placeholder="评审状态"
                      style={{ width: statusSelectWidth(reviewStatus, '评审状态'), ...(!editable ? { pointerEvents: 'none' } : {}) }}
                    />
                  </span>
                </div>
                <Row gutter={[8, 8]}>
                  {(detail.signoffs || []).map((so) => (
                    <Col key={so.id} xs={24} sm={12}><SignoffCard so={so} /></Col>
                  ))}
                  {(!detail.signoffs || detail.signoffs.length === 0) && (
                    <Col span={24}><div style={{ padding: '12px 0', textAlign: 'center', color: '#bbb', fontSize: 11 }}>未配置会签角色</div></Col>
                  )}
                </Row>
              </div>
            </Col>

            {/* ── 右栏 ── */}
            <Col xs={24} md={10}>
              {/* 投产信息 */}
              <div className="form-section-card">
                <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>投产信息</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--radar-ink)', width: 80 }}>投产负责人</span>
                    <PersonPicker style={{ flex: 1, ...(!editable ? { pointerEvents: 'none' } : {}) }} placeholder="选择投产负责人" size="small" value={owner} onChange={handleOwnerChange} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                    <span style={{ width: 80 }}>发起人：</span><span>{detail.releaseTask?.registrar || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                    <span style={{ width: 80 }}>发起时间：</span><span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{detail.releaseTask?.register_time || '—'}</span>
                  </div>
                </div>
              </div>

              {/* 关联制品情况 */}
              <div className="form-section-card">
                <div className="form-section-title" style={{ marginTop: 0, marginBottom: 4 }}>关联制品情况</div>
                <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 8 }}>
                  引用了本{entityType === 'issue' ? '问题' : '需求'}的投产申请制品
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 360, overflowY: 'auto', gap: 2 }}>
                  {(!detail.artifacts || detail.artifacts.length === 0) ? (
                    <div style={{ padding: '16px 0', textAlign: 'center', color: '#bbb' }}>暂无关联制品</div>
                  ) : (
                    detail.artifacts.map((a) => <ArtifactCard key={a.id} a={a} />)
                  )}
                </div>
              </div>
            </Col>
          </Row>
        </div>
      )}

      {/* 会签签署弹窗 */}
      <Modal
        open={signOpen}
        title={`签署会签 · ${currentSignoff?.role_name}`}
        onCancel={() => setSignOpen(false)}
        onOk={async () => {
          if (!currentSignoff) return;
          try {
            await apiPost(`/release/signoff/${currentSignoff.id}`, { result: signResult, conclusion: signConclusion });
            message.success('签署完成');
            setSignOpen(false);
            reload();
            onChanged?.();
          } catch (e) {
            message.error(e.message || '操作失败');
          }
        }}
        width={400} destroyOnHidden okText="确认" cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, width: 80 }}>签署结论：</span>
            <Radio.Group value={signResult} onChange={(e) => setSignResult(e.target.value)} size="small">
              <Radio value="已签署">同意</Radio>
              <Radio value="已驳回">拒绝</Radio>
            </Radio.Group>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>签署意见：</span>
            <Input.TextArea placeholder="请输入签署意见 / 结论" value={signConclusion} onChange={(e) => setSignConclusion(e.target.value)} rows={3} style={{ fontSize: 12 }} />
          </div>
        </div>
      </Modal>

      <HistoryDrawer open={historyOpen} entityType="release" entityId={detail?.releaseTask?.id} onClose={() => setHistoryOpen(false)} />
    </Modal>
  );
}

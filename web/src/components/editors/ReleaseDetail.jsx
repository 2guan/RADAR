/**
 * 文件：components/editors/ReleaseDetail.jsx
 * 用途：投产详情弹窗（可复用：投产管理页与版本概览）。展示并编辑投产负责人、评审会签
 *       （仅具备对应会签角色的人员或超管可签署/驳回）、各系统投产登记。
 * 作者：hengguan
 * 说明：支持双栏布局，风格参考需求分析详情弹窗。投产状态支持在标题栏直接修改。
 *       会签区域和系统登记区域均采用卡片式布局，点击卡片直接签署/修改或编辑登记状态。
 */

import React, { useEffect, useState } from 'react';
import {
  Modal, Card, Table, Space, Button, Input, Select, DatePicker, message, Empty, Row, Col, Descriptions, Radio, Tooltip
} from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import HistoryDrawer from '../HistoryDrawer.jsx';
import dayjs from 'dayjs';
import StatusBadge, { getStatusType } from '../StatusBadge.jsx';
import DictSelect from '../DictSelect.jsx';
import PersonPicker from '../PersonPicker.jsx';
import { apiGet, apiPost, apiPut } from '../../api/client.js';
import { useAppStore } from '../../stores/app.js';

const getWeakestDevStatus = (statuses) => {
  if (!statuses || statuses.length === 0) return '未开始';
  const order = {
    '开发承接': 1,
    '开发设计': 2,
    '开发实施': 3,
    '单元测试': 4,
    '开发完成': 5
  };
  let weakest = null;
  let minRank = Infinity;
  for (const s of statuses) {
    const rank = order[s] ?? 999;
    if (rank < minRank) {
      minRank = rank;
      weakest = s;
    }
  }
  return weakest || '未开始';
};

export default function ReleaseDetail({ open, reqCode, onClose, onChanged }) {
  const { user, can } = useAppStore();
  const [detail, setDetail] = useState(null);
  const [owner, setOwner] = useState(null);
  const [sysMap, setSysMap] = useState(new Map());

  // 统一签署弹窗状态
  const [signOpen, setSignOpen] = useState(false);
  const [currentSignoff, setCurrentSignoff] = useState(null);
  const [signResult, setSignResult] = useState('已签署'); // '已签署' (同意) or '已驳回' (拒绝)
  const [signConclusion, setSignConclusion] = useState('');

  // 系统登记弹窗状态
  const [sysEditOpen, setSysEditOpen] = useState(false);
  const [currentSys, setCurrentSys] = useState(null);
  const [sysTime, setSysTime] = useState(null);
  const [sysStatus, setSysStatus] = useState('待投产');

  const [historyOpen, setHistoryOpen] = useState(false);

  const reload = async () => {
    if (!reqCode) return;
    try {
      const res = await apiGet(`/release/${reqCode}`);
      setDetail(res);
      if (res?.releaseTask) {
        setOwner(res.releaseTask.owner);
      }
    } catch (e) {
      message.error(e.message || '加载详情失败');
    }
  };

  useEffect(() => {
    if (open && reqCode) reload();
  }, [open, reqCode]);

  // 加载系统编号对应的系统名称
  useEffect(() => {
    apiGet('/systems/all').then(res => {
      const m = new Map(res.map(s => [s.sys_code, s.sys_name]));
      setSysMap(m);
    }).catch(() => {});
  }, []);

  // 当前用户是否可对某会签角色签署：超管或拥有该角色
  const canSign = (so) => can('release', 'release.signoff')
    && (user?.isSuper || (user?.roles || []).some((r) => r.name === so.role_name));

  const handleOpenSign = (so) => {
    setCurrentSignoff(so);
    setSignResult(so.result === '已驳回' ? '已驳回' : '已签署');
    setSignConclusion(so.conclusion || '');
    setSignOpen(true);
  };

  const handleOpenSystemEdit = (rs) => {
    setCurrentSys(rs);
    setSysTime(rs.actual_release_time ? dayjs(rs.actual_release_time) : null);
    setSysStatus(rs.status);
    setSysEditOpen(true);
  };

  const handleOwnerChange = async (val) => {
    setOwner(val);
    try {
      await apiPut(`/release/${reqCode}`, { owner: val });
      message.success('已更新投产负责人');
      reload();
      onChanged?.();
    } catch (e) {
      message.error(e.message || '更新失败');
    }
  };

  const SystemCard = ({ rs }) => {
    const sysName = sysMap.get(rs.system_code) || rs.system_code;
    const editable = can('release', 'release.register');
    return (
      <Card
        size="small"
        hoverable={editable}
        styles={{ body: { padding: '6px 8px' } }}
        style={{
          cursor: editable ? 'pointer' : 'default',
          borderColor: 'var(--radar-border)',
          boxShadow: 'none',
          marginBottom: 6,
        }}
        onClick={() => {
          if (editable) handleOpenSystemEdit(rs);
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--radar-ink)' }}>
              {rs.system_code}
            </div>
            <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>
              机构：{rs.impl_org || '—'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              系统名称：{sysName}
            </div>
            {rs.actual_release_time && (
              <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                实际投产：<span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{rs.actual_release_time}</span>
              </div>
            )}
          </div>
          <div style={{ flexShrink: 0, marginLeft: 8 }}>
            <StatusBadge status={rs.status} />
          </div>
        </div>
      </Card>
    );
  };

  const SignoffCard = ({ so }) => {
    const clickable = canSign(so);
    return (
      <Card
        size="small"
        hoverable={clickable}
        styles={{ body: { padding: '6px 8px' } }}
        style={{
          cursor: clickable ? 'pointer' : 'default',
          borderColor: 'var(--radar-border)',
          height: '100%',
          boxShadow: 'none',
        }}
        onClick={() => {
          if (clickable) handleOpenSign(so);
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <strong style={{ fontSize: 12, color: 'var(--radar-ink)' }}>{so.role_name}</strong>
          <StatusBadge status={so.result} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
          <div>
            <span style={{ display: 'inline-block', width: 55 }}>签署人：</span>
            <span style={{ color: 'var(--radar-ink)' }}>{so.signer_name || '—'}</span>
          </div>
          <div>
            <span style={{ display: 'inline-block', width: 55 }}>签署时间：</span>
            <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{so.sign_time || '—'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            <span style={{ display: 'inline-block', width: 55, flexShrink: 0 }}>签署意见：</span>
            <span style={{ color: 'var(--radar-ink)', wordBreak: 'break-all' }}>{so.conclusion || '—'}</span>
          </div>
        </div>
      </Card>
    );
  };

  const statusValue = detail?.releaseTask?.status;

  return (
    <Modal
      open={open}
      width={980}
      footer={null}
      onCancel={onClose}
      destroyOnClose
      styles={{ body: { fontSize: 12 } }}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, minWidth: 0, width: '100%', paddingRight: 76 }}>
          <span className="lc-id big" style={{ margin: 0 }}>{reqCode || 'REQ'}</span>
          {detail?.releaseTask && (
            <span className={`status-select status-select-${getStatusType(statusValue)}`}>
              <DictSelect
                category="release_status"
                size="small"
                allowClear={false}
                showSearch={false}
                popupClassName="status-select-dropdown"
                value={statusValue}
                onChange={async (v) => {
                  try {
                    await apiPut(`/release/${reqCode}`, { status: v });
                    message.success('已更新投产状态');
                    reload();
                    onChanged?.();
                  } catch (e) {
                    message.error(e.message || '更新失败');
                  }
                }}
                placeholder="投产状态"
                style={{ width: (statusValue ? Array.from(String(statusValue)).length : 4) * 13 + 15, ...(!can('release', 'edit') ? { pointerEvents: 'none' } : {}) }}
              />
            </span>
          )}
          {detail?.releaseTask && (
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
      {!detail ? (
        <div style={{ padding: '40px 0' }}><Empty /></div>
      ) : !detail.releaseTask ? (
        <div style={{ padding: '40px 0' }}><Empty description="该需求尚未发起投产评审" /></div>
      ) : (
        <div className="editor-form" style={{ marginTop: 10 }}>
          <Row gutter={12}>
            {/* ── 左栏 ── */}
            <Col xs={24} md={14}>
              {/* 基本信息 */}
              <div className="form-section-card">
                <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>基本信息</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <strong style={{ fontSize: 13, color: 'var(--radar-ink)', display: 'block', marginBottom: 2 }}>{detail.requirement.title}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>计划投产点：</span>
                      <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', color: 'var(--radar-ink)', fontSize: 11 }}>
                        {detail.requirement.release_date || '—'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--radar-ink)', background: 'var(--radar-bg)', padding: '6px 10px', borderRadius: 2, maxHeight: 80, overflowY: 'auto', border: '1px solid var(--radar-border)', whiteSpace: 'pre-wrap', lineHeight: '16px' }}>
                      {detail.requirement.summary || '无概述内容'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--radar-surface)',
                      border: '1px solid var(--radar-border)',
                      borderRadius: 2,
                      padding: '4px 8px',
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)', fontWeight: 500 }}>需求</span>
                      <StatusBadge status={detail.requirement.status} />
                    </div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--radar-surface)',
                      border: '1px solid var(--radar-border)',
                      borderRadius: 2,
                      padding: '4px 8px',
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)', fontWeight: 500 }}>开发</span>
                      <StatusBadge status={getWeakestDevStatus(detail.taskStatuses?.dev)} />
                    </div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--radar-surface)',
                      border: '1px solid var(--radar-border)',
                      borderRadius: 2,
                      padding: '4px 8px',
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)', fontWeight: 500 }}>应用组装</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(!detail.taskStatuses?.sit || detail.taskStatuses.sit.length === 0) ? (
                          <StatusBadge status="未开始" />
                        ) : (
                          detail.taskStatuses.sit.map((s, idx) => <StatusBadge key={idx} status={s} />)
                        )}
                      </div>
                    </div>
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      background: 'var(--radar-surface)',
                      border: '1px solid var(--radar-border)',
                      borderRadius: 2,
                      padding: '4px 8px',
                    }}>
                      <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)', fontWeight: 500 }}>用户测试</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(!detail.taskStatuses?.uat || detail.taskStatuses.uat.length === 0) ? (
                          <StatusBadge status="未开始" />
                        ) : (
                          detail.taskStatuses.uat.map((s, idx) => <StatusBadge key={idx} status={s} />)
                        )}
                      </div>
                    </div>
                    {detail.taskStatuses?.nft && detail.taskStatuses.nft.length > 0 && (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'var(--radar-surface)',
                        border: '1px solid var(--radar-border)',
                        borderRadius: 2,
                        padding: '4px 8px',
                      }}>
                        <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)', fontWeight: 500 }}>非功能测试</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {detail.taskStatuses.nft.map((s, idx) => <StatusBadge key={idx} status={s} />)}
                        </div>
                      </div>
                    )}
                    {detail.taskStatuses?.sec && detail.taskStatuses.sec.length > 0 && (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        background: 'var(--radar-surface)',
                        border: '1px solid var(--radar-border)',
                        borderRadius: 2,
                        padding: '4px 8px',
                      }}>
                        <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)', fontWeight: 500 }}>安全测试</span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {detail.taskStatuses.sec.map((s, idx) => <StatusBadge key={idx} status={s} />)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 评审会签 */}
              <div className="form-section-card">
                <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>评审会签</div>
                <Row gutter={[8, 8]}>
                  {detail.signoffs.map((so) => (
                    <Col key={so.id} xs={24} sm={12}>
                      <SignoffCard so={so} />
                    </Col>
                  ))}
                </Row>
              </div>
            </Col>

            {/* ── 右栏 ── */}
            <Col xs={24} md={10}>
              {/* 投产负责人/基本登记信息 */}
              <div className="form-section-card">
                <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>投产信息</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--radar-ink)', width: 80 }}>投产负责人</span>
                    <PersonPicker
                      style={{ flex: 1, ...(!can('release', 'edit') ? { pointerEvents: 'none' } : {}) }}
                      placeholder="选择投产负责人"
                      size="small"
                      value={owner}
                      onChange={handleOwnerChange}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                    <span style={{ width: 80 }}>发起人：</span>
                    <span>{detail.releaseTask.registrar || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                    <span style={{ width: 80 }}>发起时间：</span>
                    <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{detail.releaseTask.register_time || '—'}</span>
                  </div>
                </div>
              </div>

              {/* 各系统投产登记 */}
              <div className="form-section-card">
                <div className="form-section-title" style={{ marginTop: 0, marginBottom: 4 }}>各系统投产登记</div>
                <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 8 }}>
                  全部系统已投产后，需求投产状态自动置为已投产
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 350, overflowY: 'auto', gap: 2 }}>
                  {detail.systems.length === 0 ? (
                    <div style={{ padding: '16px 0', textAlign: 'center', color: '#bbb' }}>无改造系统</div>
                  ) : (
                    detail.systems.map((rs) => <SystemCard key={rs.id} rs={rs} />)
                  )}
                </div>
              </div>
            </Col>
          </Row>
        </div>
      )}

      {/* 统一签署会签弹窗 */}
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
        width={400}
        destroyOnClose
        okText="确认"
        cancelText="取消"
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
            <Input.TextArea
              placeholder="请输入签署意见 / 结论"
              value={signConclusion}
              onChange={(e) => setSignConclusion(e.target.value)}
              rows={3}
              style={{ fontSize: 12 }}
            />
          </div>
        </div>
      </Modal>

      {/* 系统投产登记弹窗 */}
      <Modal
        open={sysEditOpen}
        title={`登记系统投产 · ${currentSys?.system_code}`}
        onCancel={() => setSysEditOpen(false)}
        onOk={async () => {
          if (!currentSys) return;
          try {
            await apiPut(`/release/system/${currentSys.id}`, {
              actual_release_time: sysTime ? sysTime.format('YYYY-MM-DD') : null,
              status: sysStatus
            });
            message.success('系统投产状态已登记');
            setSysEditOpen(false);
            reload();
            onChanged?.();
          } catch (e) {
            message.error(e.message || '操作失败');
          }
        }}
        width={400}
        destroyOnClose
        okText="确认"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, width: 90 }}>投产状态：</span>
            <Select
              size="small"
              value={sysStatus}
              style={{ flex: 1 }}
              onChange={setSysStatus}
              options={['待投产', '已投产', '已取消'].map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, width: 90 }}>实际投产时间：</span>
            <DatePicker
              size="small"
              placeholder="实际投产时间"
              value={sysTime}
              onChange={setSysTime}
              style={{ flex: 1 }}
            />
          </div>
        </div>
      </Modal>

      <HistoryDrawer
        open={historyOpen}
        entityType="release"
        entityId={detail?.releaseTask?.id}
        onClose={() => setHistoryOpen(false)}
      />
    </Modal>
  );
}

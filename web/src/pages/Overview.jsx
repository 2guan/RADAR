/**
 * 文件：pages/Overview.jsx
 * 用途：版本概览页面。按实施机构分组展示当前投产窗口需求卡片（每行最多 2 条），
 *       卡片含编号、所属系统、当前阶段状态与全流程进度条；点击卡片弹出 5 列全生命周期详情，
 *       点击任一阶段卡片打开对应阶段的编辑弹窗（可编辑、保存留痕、回写概览）。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import {
  Card, Row, Col, Tag, Typography, Empty, Modal, Space, Spin, Select, Avatar, Tabs,
} from 'antd';
import { SafetyCertificateOutlined, DeploymentUnitOutlined } from '@ant-design/icons';
import ChainBar from '../components/ChainBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import RequirementEditor from '../components/editors/RequirementEditor.jsx';
import TaskEditor from '../components/editors/TaskEditor.jsx';
import ReleaseDetail from '../components/editors/ReleaseDetail.jsx';
import { apiPost, apiGet } from '../api/client.js';
import { useAppStore } from '../stores/app.js';

const TEST_ATTACH = ['测试方案', '测试报告'];
const DEV_ATTACH = ['概要设计', '详细设计', '代码走查', '单元测试报告'];
const AV_COLORS = ['#2E6BFF', '#22C55E', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899', '#F1683C'];

/** 由姓名稳定地取一个头像颜色 */
function avatarColor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h + ch.charCodeAt(0)) % AV_COLORS.length;
  return AV_COLORS[h];
}

/** 人员小卡片：头像 + 姓名 / 所属机构 / 手机号 */
function PersonCard({ p }) {
  if (!p || !p.name) return <span className="lc-muted">—</span>;
  return (
    <div className="mini-card person">
      <Avatar size={28} style={{ background: avatarColor(p.name), fontSize: 12, flexShrink: 0 }}>{p.name[0]}</Avatar>
      <div className="mini-body">
        <div className="mini-title">{p.name}</div>
        <div className="mini-sub">{[p.org, p.phone].filter(Boolean).join(' · ') || '—'}</div>
      </div>
    </div>
  );
}

/** 系统小卡片：系统名称(编号) / 所属机构 · 业务板块 */
function SystemCard({ s }) {
  if (!s) return <span className="lc-muted">—</span>;
  return (
    <div className="mini-card system">
      <div className="mini-title">{s.sys_name}<span className="mini-code">{s.sys_code}</span></div>
      <div className="mini-sub">{[s.org, s.sector].filter(Boolean).join(' · ') || '—'}</div>
    </div>
  );
}

/** 附件 / 路径列表：标注字段名 + 附件或路径 + 文件名/路径 */
function AttachList({ attachments, field }) {
  const list = (attachments || []).filter((a) => !field || a.field_key === field);
  if (!list.length) return <span className="lc-muted">无</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {list.map((a) => (
        <div key={a.id} className="lc-file">
          <Tag color={a.kind === 'file' ? 'green' : 'cyan'} className="status-tag" style={{ borderRadius: 2, margin: 0 }}>
            {a.kind === 'file' ? '附件' : '路径'}
          </Tag>
          <span className="lc-file-field">{a.field_key}</span>
          <span className="lc-file-name">{a.filename || a.path_text}</span>
        </div>
      ))}
    </div>
  );
}

/** 字段行：标签 + 内容（col 为上下排列） */
function Field({ label, col, children }) {
  return (
    <div className={`lc-field ${col ? 'col' : ''}`}>
      <span className="lc-flabel">{label}</span>
      <div className="lc-fvalue">{children}</div>
    </div>
  );
}

/** 详情卡片外框（直角、可点击编辑；状态独立一行靠右） */
function DetailCard({ status, code, title, onEdit, lg, children }) {
  return (
    <div className={`lc-card ${lg ? 'lc-card-lg' : ''}`} onClick={onEdit}>
      <div className="lc-card-status"><StatusBadge status={status} /></div>
      <span className={`lc-id ${lg ? 'big' : ''}`}>{code}</span>
      {title && <div className={`lc-title ${lg ? 'lg' : ''}`}>{title}</div>}
      {children}
    </div>
  );
}

/** 需求详情卡片（完整字段） */
function ReqDetailCard({ req, onEdit }) {
  return (
    <DetailCard status={req.status} code={req.req_code} title={req.title} onEdit={onEdit} lg>
      <Field label="需求类型"><Tag style={{ borderRadius: 2, margin: 0 }}>{req.req_type || '—'}</Tag></Field>
      <Field label="提出时间">{req.propose_time || '—'}</Field>
      <Field label="需求概述" col><div className="lc-text">{req.summary || '—'}</div></Field>
      <Field label="提出人" col><PersonCard p={req.proposerInfo} /></Field>
      <Field label="云南农信业务负责人" col><PersonCard p={req.ynOwnerInfo} /></Field>
      <Field label="建信金科业务负责人" col><PersonCard p={req.jkOwnerInfo} /></Field>
      <Field label="主责系统" col>
        <div className="mini-grid">{(req.mainSystemsInfo || []).length ? req.mainSystemsInfo.map((s) => <SystemCard key={s.sys_code} s={s} />) : <span className="lc-muted">—</span>}</div>
      </Field>
      <Field label="需求说明书" col><AttachList attachments={req.attachments} field="需求说明书" /></Field>
    </DetailCard>
  );
}

/** 开发 / 测试任务卡片（完整字段） */
function TaskDetailCard({ t, attachFields, onEdit }) {
  return (
    <DetailCard status={t.status} code={t.task_code} title={t.task_name} onEdit={onEdit}>
      <Field label="实施系统" col><SystemCard s={t.systemInfo} /></Field>
      <Field label="负责人" col><PersonCard p={t.ownerInfo} /></Field>
      <Field label="计划时间">{t.plan_start || '—'} ~ {t.plan_end || '—'}</Field>
      <Field label="实际时间">{t.actual_start || '—'} ~ {t.actual_end || '—'}</Field>
      {attachFields.map((f) => <Field key={f} label={f} col><AttachList attachments={t.attachments} field={f} /></Field>)}
    </DetailCard>
  );
}

/** 投产详情卡片 */
function ReleaseDetailCard({ release, onEdit }) {
  if (!release) return <div className="lc-card lc-card-lg" onClick={onEdit}><div className="lc-empty">点击发起 / 查看投产</div></div>;
  return (
    <DetailCard status={release.status} code="投产任务" onEdit={onEdit} lg>
      <Field label="投产负责人" col><PersonCard p={release.ownerInfo} /></Field>
      <div className="lc-section"><SafetyCertificateOutlined /> 评审会签</div>
      {release.signoffs.length ? release.signoffs.map((s) => (
        <div key={s.id} className="lc-kv">
          <span>{s.role_name}{s.signer_name ? ` · ${s.signer_name}` : ''}</span>
          <StatusBadge status={s.result} />
        </div>
      )) : <div className="lc-muted">暂无会签</div>}
      <div className="lc-section"><DeploymentUnitOutlined /> 系统投产</div>
      {release.systems.length ? release.systems.map((s) => (
        <div key={s.id} className="lc-sys-row"><SystemCard s={s.systemInfo} /><StatusBadge status={s.status} /></div>
      )) : <div className="lc-muted">无改造系统</div>}
    </DetailCard>
  );
}

/** 一个阶段页签内的任务网格 */
function TaskGrid({ items, attachFields, onEdit }) {
  if (!items.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />;
  return <div className="lc-tab-grid">{items.map((t) => <TaskDetailCard key={t.id} t={t} attachFields={attachFields} onEdit={() => onEdit(t)} />)}</div>;
}

export default function Overview() {
  const releasePointIds = useAppStore((s) => s.releasePointIds);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailCard, setDetailCard] = useState(null); // 被点击的概览卡片（用于详情标题展示系统信息）

  // 阶段编辑器：{type:'requirement'|'dev'|'test'|'release', id, reqCode}
  const [editor, setEditor] = useState(null);
  const [orgFilter, setOrgFilter] = useState('all');

  const load = () => {
    setLoading(true);
    apiPost('/overview/list', { releasePointIds }).then((d) => setGroups(d.list || [])).finally(() => setLoading(false));
  };
  useEffect(load, [JSON.stringify(releasePointIds)]);

  const loadDetail = async (reqCode) => {
    setDetailLoading(true);
    try { setDetail(await apiGet(`/overview/${reqCode}/detail`)); }
    finally { setDetailLoading(false); }
  };
  const openDetail = async (card) => { setDetailCard(card); setDetailOpen(true); await loadDetail(card.req_code); };

  // 编辑保存后：刷新详情 + 概览
  const onEditorSaved = () => { if (detail) loadDetail(detail.requirement.req_code); load(); };

  const shownGroups = orgFilter === 'all' ? groups : groups.filter((g) => g.org === orgFilter);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <Select
          value={orgFilter} style={{ minWidth: 180 }} onChange={setOrgFilter}
          options={[{ value: 'all', label: '所有机构' }, ...groups.map((g) => ({ value: g.org, label: g.org }))]}
        />
      </div>

      {loading ? <Spin /> : shownGroups.length === 0 ? <Empty description="当前投产窗口暂无需求" /> : shownGroups.map((g) => (
        <Card
          key={g.org} variant="borderless" style={{ marginBottom: 20 }} styles={{ body: { padding: 16 } }}
          title={(
            <Space>
              <span style={{ fontWeight: 700 }}>{g.org}</span>
              <Tag style={{ borderRadius: 2 }}>{g.cards.length} 项需求</Tag>
            </Space>
          )}
        >
          <Row gutter={[16, 16]}>
            {g.cards.map((c) => (
              <Col key={c.req_code} xs={24} md={c.nodes.length >= 7 ? 24 : 12}>
                <div className="ov-req-card clickable" onClick={() => openDetail(c)}>
                  {/* 顶部：左=编号，右=当前状态标签 */}
                  <div className="ov-req-head">
                    <span className="code-pill">{c.req_code}</span>
                    <Tag color="processing" style={{ borderRadius: 2, margin: 0 }}>{c.currentStage}</Tag>
                  </div>

                  {/* 需求标题（编号下方，纯文本不加框） */}
                  <div style={{ fontWeight: 600, fontSize: 15, margin: '8px 0 6px' }}>{c.title}</div>

                  {/* 系统名称 + 所属机构（标签） */}
                  <Space size={6} wrap style={{ marginBottom: 12 }}>
                    <Tag color="processing" style={{ borderRadius: 2, margin: 0 }}>{c.systemName}</Tag>
                    <Tag style={{ borderRadius: 2, margin: 0 }}>{c.systemOrg}</Tag>
                  </Space>

                  {/* 进度条 + 各阶段状态标签 */}
                  <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
                    <ChainBar nodes={c.nodes} />
                  </div>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      ))}

      {/* 全生命周期详情（页签式，避免横向滚动） */}
      <Modal open={detailOpen} width="86%" footer={null} onCancel={() => setDetailOpen(false)} style={{ top: 20 }}
        styles={{ body: { minHeight: 360 } }}
        title={detail && (
          <div className="lc-modal-title">
            <span className="lc-id big">{detail.requirement.req_code}</span>
            <span className="lc-modal-name">{detail.requirement.title}</span>
            {detailCard?.systemName && detailCard.systemName !== '—' && <Tag style={{ borderRadius: 2, margin: 0 }}>{detailCard.systemName}</Tag>}
            <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>（点击卡片可编辑）</Typography.Text>
          </div>
        )}>
        {detailLoading || !detail ? <Spin /> : (
          <Tabs
            items={[
              { key: 'req', label: '需求', children: <ReqDetailCard req={detail.requirement} onEdit={() => setEditor({ type: 'requirement', id: detail.requirement.id })} /> },
              { key: 'dev', label: '开发', children: <TaskGrid items={detail.dev} attachFields={DEV_ATTACH} onEdit={(t) => setEditor({ type: 'dev', id: t.id })} /> },
              { key: 'sit', label: '应用组装测试', children: <TaskGrid items={detail.sit} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} /> },
              ...(detail.nft.length ? [{ key: 'nft', label: '非功能测试', children: <TaskGrid items={detail.nft} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} /> }] : []),
              ...(detail.sec.length ? [{ key: 'sec', label: '安全测试', children: <TaskGrid items={detail.sec} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} /> }] : []),
              { key: 'uat', label: '用户测试', children: <TaskGrid items={detail.uat} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} /> },
              { key: 'rel', label: '投产', children: <ReleaseDetailCard release={detail.release} onEdit={() => setEditor({ type: 'release', reqCode: detail.requirement.req_code })} /> },
            ]}
          />
        )}
      </Modal>

      {/* 阶段编辑器 */}
      <RequirementEditor open={editor?.type === 'requirement'} reqId={editor?.id}
        defaultReleasePointId={releasePointIds.length === 1 ? releasePointIds[0] : undefined}
        onClose={() => setEditor(null)} onSaved={onEditorSaved} />
      <TaskEditor open={editor?.type === 'dev' || editor?.type === 'test'} kind={editor?.type === 'test' ? 'test' : 'dev'}
        taskId={(editor?.type === 'dev' || editor?.type === 'test') ? editor?.id : null}
        onClose={() => setEditor(null)} onSaved={onEditorSaved} />
      <ReleaseDetail open={editor?.type === 'release'} reqCode={editor?.type === 'release' ? editor?.reqCode : null}
        onClose={() => setEditor(null)} onChanged={onEditorSaved} />
    </div>
  );
}

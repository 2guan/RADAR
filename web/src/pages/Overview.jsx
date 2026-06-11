/**
 * 文件：pages/Overview.jsx
 * 用途：版本概览页面。按实施机构分组展示当前投产窗口需求卡片（每行最多 2 条），
 *       卡片含编号、所属系统、当前阶段状态与全流程进度条；点击卡片弹出 5 列全生命周期详情，
 *       点击任一阶段卡片打开对应阶段的编辑弹窗（可编辑、保存留痕、回写概览）。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import {
  Card, Row, Col, Tag, Typography, Empty, Modal, Space, Spin, Select, Avatar, Tabs, Button,
} from 'antd';
import { SafetyCertificateOutlined, DeploymentUnitOutlined, DownloadOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import ChainBar from '../components/ChainBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import RequirementEditor from '../components/editors/RequirementEditor.jsx';
import TaskEditor from '../components/editors/TaskEditor.jsx';
import ReleaseDetail from '../components/editors/ReleaseDetail.jsx';
import { apiPost, apiGet, rawClient } from '../api/client.js';

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

/** 人员小卡片：两行显示，去掉头像，左侧加竖线 (样式由 CSS 控制) */
function PersonCard({ p }) {
  if (!p || !p.name) return <span className="lc-muted">—</span>;
  const line1 = [p.name, p.org].filter(Boolean).join(' · ');
  const line2 = p.phone || '—';
  return (
    <div className="mini-card person">
      <div className="mini-body">
        <div className="mini-title">{line1}</div>
        <div className="mini-sub">{line2}</div>
      </div>
    </div>
  );
}

/** 系统小卡片：两行显示。第一行系统编号、系统名称，第二行所属机构、所属业务板块 */
function SystemCard({ s }) {
  if (!s) return <span className="lc-muted">—</span>;
  const line1 = [s.sys_code, s.sys_name].filter(Boolean).join(' · ');
  const line2 = [s.org, s.sector].filter(Boolean).join(' · ') || '—';
  return (
    <div className="mini-card system">
      <div className="mini-body">
        <div className="mini-title">{line1}</div>
        <div className="mini-sub">{line2}</div>
      </div>
    </div>
  );
}

/** 计划/实际时间段格式化 (如 "08.22-08.30") */
function formatPeriod(start, end) {
  if (!start && !end) return '—';
  const fmt = (d) => {
    if (!d) return '—';
    const parts = d.split('-');
    if (parts.length >= 3) {
      return `${parts[1]}.${parts[2]}`;
    }
    return d;
  };
  return `${fmt(start)}-${fmt(end)}`;
}

/** 统一的附件展示组件：按传入的 fields 列表渲染所有条带 */
function AttachList({ attachments, fields }) {
  const download = async (a) => {
    try {
      const resp = await rawClient.get(`/attachments/${a.id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const link = document.createElement('a');
      link.href = url; link.download = a.filename || 'file';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download failed', e);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', marginTop: 6 }}>
      {fields.map((f) => {
        const list = (attachments || []).filter((a) => a.field_key === f);
        if (list.length === 0) {
          return (
            <div key={f} className="lc-file-strip empty" style={{ opacity: 0.65 }} onClick={(e) => e.stopPropagation()}>
              <div className="lc-file-left">
                <span className="lc-file-field">{f}</span>
                <Tag className="status-tag status-tag-not-started" style={{ borderRadius: 2, margin: 0, fontSize: 10 }}>未提交</Tag>
              </div>
            </div>
          );
        }
        return list.map((a) => (
          <div key={a.id} className="lc-file-strip" onClick={(e) => e.stopPropagation()}>
            <div className="lc-file-left">
              <span className="lc-file-field">{f}</span>
              <Tag className={a.kind === 'file' ? 'tag-file' : 'tag-path'} style={{ borderRadius: 2, margin: 0, fontSize: 10 }}>
                {a.kind === 'file' ? '附件' : '路径'}
              </Tag>
              <span className="lc-file-name" title={a.filename || a.path_text}>
                {a.filename || a.path_text}
              </span>
            </div>
            <div className="lc-file-right">
              {a.kind === 'file' && (
                <Button
                  type="link"
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={(e) => {
                    e.stopPropagation();
                    download(a);
                  }}
                  className="lc-file-download-btn"
                >
                  下载
                </Button>
              )}
            </div>
          </div>
        ));
      })}
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

/** 详情卡片外框（状态绝对定位在右上角，避免挤压） */
function DetailCard({ status, code, title, onEdit, lg, children }) {
  return (
    <div className={`lc-card ${lg ? 'lc-card-lg' : ''}`} onClick={onEdit} style={{ position: 'relative' }}>
      {status && (
        <div className="lc-card-status">
          <StatusBadge status={status} />
        </div>
      )}
      <div>
        <span className={`lc-id ${lg ? 'big' : ''}`}>{code}</span>
      </div>
      {title && <div className={`lc-title ${lg ? 'lg' : ''}`}>{title}</div>}
      {children}
    </div>
  );
}

/** 需求详情卡片（完整字段） */
function ReqDetailCard({ req, onEdit }) {
  return (
    <DetailCard status={req.status} code={req.req_code} title={req.title} onEdit={onEdit} lg>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, fontSize: 11 }}>
        <Tag className="tag-type" style={{ borderRadius: 2, margin: 0, fontSize: 10 }}>{req.req_type || '—'}</Tag>
        <span style={{ color: 'var(--radar-text-secondary)' }}>{req.propose_time || '—'}</span>
      </div>
      <div className="lc-text" style={{ marginBottom: 8, color: 'var(--radar-ink)' }}>
        {req.summary || '—'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '8px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>提出人</span>
          <PersonCard p={req.proposerInfo} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>云南农信负责人</span>
          <PersonCard p={req.ynOwnerInfo} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>建信金科负责人</span>
          <PersonCard p={req.jkOwnerInfo} />
        </div>
      </div>

      <Field label="主责系统" col>
        <div className="mini-grid">
          {(req.mainSystemsInfo || []).length ? (
            req.mainSystemsInfo.map((s) => <SystemCard key={s.sys_code} s={s} />)
          ) : (
            <span className="lc-muted">—</span>
          )}
        </div>
      </Field>

      <Field label="协同改造系统" col>
        <div className="mini-grid">
          {(req.collabDevSystemsInfo || []).length ? (
            req.collabDevSystemsInfo.map((s) => <SystemCard key={s.sys_code} s={s} />)
          ) : (
            <span className="lc-muted">—</span>
          )}
        </div>
      </Field>

      <AttachList attachments={req.attachments} fields={['需求说明书']} />
    </DetailCard>
  );
}

/** 开发 / 测试任务卡片（支持折叠/展开） */
function TaskDetailCard({ t, attachFields, onEdit }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <DetailCard status={t.status} code={t.task_code} onEdit={onEdit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
        {t.systemInfo && <SystemCard s={t.systemInfo} />}
        {t.ownerInfo && <PersonCard p={t.ownerInfo} />}
      </div>

      {expanded && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '6px 0', borderTop: '1px dashed var(--radar-border)', paddingTop: 6 }}>
            <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
              <span>计划时间</span>
              <span style={{ fontWeight: 500, color: 'var(--radar-ink)' }}>{formatPeriod(t.plan_start, t.plan_end)}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
              <span>实际时间</span>
              <span style={{ fontWeight: 500, color: 'var(--radar-ink)' }}>{formatPeriod(t.actual_start, t.actual_end)}</span>
            </div>
          </div>

          <AttachList attachments={t.attachments} fields={attachFields} />
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
        <Button
          type="text"
          size="small"
          icon={expanded ? <UpOutlined style={{ fontSize: 9 }} /> : <DownOutlined style={{ fontSize: 9 }} />}
          onClick={(e) => {
            e.stopPropagation(); // 阻止触发卡片的编辑弹窗
            setExpanded(!expanded);
          }}
          style={{
            height: 14,
            minWidth: 24,
            width: 24,
            color: 'var(--radar-text-secondary)',
            padding: 0,
          }}
        />
      </div>
    </DetailCard>
  );
}

/** 投产详情卡片 */
function ReleaseDetailCard({ release, onEdit }) {
  if (!release) return <div className="lc-card lc-card-lg" onClick={onEdit}><div className="lc-empty">点击发起 / 查看投产</div></div>;
  return (
    <DetailCard status={release.status} code="投产任务" onEdit={onEdit} lg>
      <div style={{ marginBottom: 6 }}>
        <PersonCard p={release.ownerInfo} />
      </div>
      <div className="lc-section" style={{ marginTop: 6 }}><SafetyCertificateOutlined /> 评审会签</div>
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

  const [isTabMode, setIsTabMode] = useState(window.innerWidth < 1200);
  useEffect(() => {
    const handleResize = () => {
      setIsTabMode(window.innerWidth < 1200);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
              <Tag className="tag-type" style={{ borderRadius: 2 }}>{g.cards.length} 项需求</Tag>
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
                    <StatusBadge status={c.currentStage} />
                  </div>

                  {/* 需求标题（编号下方，纯文本不加框） */}
                  <div style={{ fontWeight: 600, fontSize: 15, margin: '8px 0 6px' }}>{c.title}</div>

                  {/* 系统名称 + 所属机构（标签） */}
                  <Space size={6} wrap style={{ marginBottom: 12 }}>
                    <Tag className="status-tag tag-system" style={{ borderRadius: 2, margin: 0 }}>{c.systemName}</Tag>
                    <Tag className="status-tag tag-org" style={{ borderRadius: 2, margin: 0 }}>{c.systemOrg}</Tag>
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

      {/* 全生命周期详情（宽屏5列看板式，窄屏自动切换为页签式以避免横向滚动） */}
      <Modal open={detailOpen} width={isTabMode ? "86%" : "96%"} footer={null} onCancel={() => setDetailOpen(false)} style={{ top: 20, maxWidth: isTabMode ? '1000px' : '1700px' }}
        styles={{ body: { minHeight: 360, overflowX: 'hidden' } }}
        title={detail && (
          <div className="lc-modal-title">
            <span className="lc-id big">{detail.requirement.req_code}</span>
            <span className="lc-modal-name">{detail.requirement.title}</span>
            {detailCard?.systemName && detailCard.systemName !== '—' && <Tag className="tag-system" style={{ borderRadius: 2, margin: 0 }}>{detailCard.systemName}</Tag>}
            <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>（点击卡片可编辑）</Typography.Text>
          </div>
        )}>
        {detailLoading || !detail ? <Spin /> : (
          isTabMode ? (
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
          ) : (
            <div className="lc-columns-container">
              {/* 第一列：需求 */}
              <div className="lc-column">
                <div className="lc-column-header">
                  <span>需求</span>
                </div>
                <ReqDetailCard req={detail.requirement} onEdit={() => setEditor({ type: 'requirement', id: detail.requirement.id })} />
              </div>

              {/* 第二列：开发 */}
              <div className="lc-column">
                <div className="lc-column-header">
                  <span>开发</span>
                  <span className="lc-column-header-count">{detail.dev.length}</span>
                </div>
                <TaskGrid items={detail.dev} attachFields={DEV_ATTACH} onEdit={(t) => setEditor({ type: 'dev', id: t.id })} />
              </div>

              {/* 第三列：应用组装测试、非功能测试、安全测试 */}
              <div className="lc-column">
                <div className="lc-column-header">
                  <span>应用组装测试</span>
                </div>
                <TaskGrid items={detail.sit} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} />

                {detail.nft.length > 0 && (
                  <>
                    <div className="lc-column-header" style={{ marginTop: 16 }}>
                      <span>非功能测试</span>
                    </div>
                    <TaskGrid items={detail.nft} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} />
                  </>
                )}

                {detail.sec.length > 0 && (
                  <>
                    <div className="lc-column-header" style={{ marginTop: 16 }}>
                      <span>安全测试</span>
                    </div>
                    <TaskGrid items={detail.sec} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} />
                  </>
                )}
              </div>

              {/* 第四列：用户测试 */}
              <div className="lc-column">
                <div className="lc-column-header">
                  <span>用户测试</span>
                </div>
                <TaskGrid items={detail.uat} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} />
              </div>

              {/* 第五列：投产 */}
              <div className="lc-column">
                <div className="lc-column-header">
                  <span>投产</span>
                </div>
                <ReleaseDetailCard release={detail.release} onEdit={() => setEditor({ type: 'release', reqCode: detail.requirement.req_code })} />
              </div>
            </div>
          )
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

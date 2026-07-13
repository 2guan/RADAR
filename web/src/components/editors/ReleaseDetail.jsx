/**
 * 文件：components/editors/ReleaseDetail.jsx
 * 用途：投产审批详情弹窗（可复用：投产审批页与版本概览）。展示实体（需求/工单/问题）基本信息、评审会签、
 *       投产信息、关联制品情况（引用了本需求/工单/问题的投产申请制品）。
 * 作者：hengguan
 * 说明：审批对象为需求、工单或问题，由后端 entityType 区分；首次打开惰性创建投产任务与会签项。
 *       「各系统投产登记」已改为「关联制品情况」，按卡片只读展示投产申请的制品信息。
 */

import React, { useEffect, useRef, useState } from 'react';
import { Modal, Card, Space, Button, Input, message, Empty, Row, Col, Radio, Tooltip, Tag, Upload, Popconfirm, Select } from 'antd';
import { HistoryOutlined, UploadOutlined, DeleteOutlined, PlusOutlined, HighlightOutlined, DownloadOutlined } from '@ant-design/icons';
import HistoryDrawer from '../HistoryDrawer.jsx';
import SignaturePad from '../SignaturePad.jsx';
import CodeLink from '../CodeLink.jsx';
import EditorShell from './EditorShell.jsx';
import RequirementEditor from './RequirementEditor.jsx';
import TaskEditor from './TaskEditor.jsx';
import ReleaseApplyEditor from './ReleaseApplyEditor.jsx';
import TicketEditor from './TicketEditor.jsx';
import ImpactAnalysisModal from './ImpactAnalysisModal.jsx';
import CoverageAnalysisModal from './CoverageAnalysisModal.jsx';
import StatusBadge, { getStatusType, statusSelectWidth } from '../StatusBadge.jsx';
import DictSelect from '../DictSelect.jsx';
import PersonPicker from '../PersonPicker.jsx';
import { makeReleasePointOptions, ReleasePointText } from '../ReleasePointText.jsx';
import { apiGet, apiPost, apiPut, apiDelete, rawClient } from '../../api/client.js';
import { useAppStore } from '../../stores/app.js';

/** 签署时间缩略：YYYY-MM-DD HH:MM:SS -> MM.DD HH:MM */
function fmtSignTime(s) {
  if (!s) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s));
  return m ? `${m[2]}.${m[3]} ${m[4]}:${m[5]}` : s;
}

// 各阶段状态推进顺序（用于取「最弱状态」聚合展示）
const DEV_ORDER = { '开发承接': 1, '开发设计': 2, '开发实施': 3, '单元测试': 4, '开发完成': 5 };
const TEST_ORDER = { '测试承接': 1, '测试登记': 1, '测试方案': 2, '测试实施': 3, '测试报告': 4, '测试完成': 5 };

/** 取一组任务的最弱（最不靠后）状态；任务项可为字符串或 {status} 对象 */
const weakestStatus = (list, order) => {
  if (!list || list.length === 0) return '未开始';
  let weakest = null;
  let minRank = Infinity;
  for (const t of list) {
    const st = typeof t === 'string' ? t : t.status;
    const rank = order[st] ?? 999;
    if (rank < minRank) { minRank = rank; weakest = st; }
  }
  return weakest || '未开始';
};

/** 阶段进度小卡片 */
function StageChip({ label, children }) {
  return (
    <div className="release-stage-chip">
      <span className="release-stage-chip-label">{label}</span>
      <span className="release-stage-chip-value">{children}</span>
    </div>
  );
}

export default function ReleaseDetail({ open, mode = 'modal', code, reqCode, releasePointId, onClose, onChanged }) {
  const entityCode = code ?? reqCode;
  const { user, can, theme } = useAppStore();
  const isDark = theme === 'dark';
  const isAdminUser = !!user?.isSuper || (user?.roles || []).some((r) => ['管理员', '超级管理员'].includes(r.code) || ['管理员', '超级管理员'].includes(r.name));
  const [detail, setDetail] = useState(null);
  const [owner, setOwner] = useState(null);
  const [currentReleasePointId, setCurrentReleasePointId] = useState(releasePointId ?? null);
  const [points, setPoints] = useState([]);

  // 会签弹窗状态
  const [signOpen, setSignOpen] = useState(false);
  const [signReadonly, setSignReadonly] = useState(false);
  const [currentSignoff, setCurrentSignoff] = useState(null);
  const [signResult, setSignResult] = useState('已签署');
  const [signConclusion, setSignConclusion] = useState('');

  // 评审签名状态
  const [signatures, setSignatures] = useState([]);     // 我的签名库
  const [selectedSigId, setSelectedSigId] = useState(null);
  const [creatingSig, setCreatingSig] = useState(false); // 是否处于新建签名
  const [savingSig, setSavingSig] = useState(false);
  const [signing, setSigning] = useState(false);
  const padRef = useRef(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [impactOpen, setImpactOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [analysisSummary, setAnalysisSummary] = useState(null);

  const releasePointQuery = () => {
    const id = currentReleasePointId ?? detail?.entity?.apply_release_point_id ?? releasePointId;
    return id ? `?releasePointId=${encodeURIComponent(id)}` : '';
  };

  /** 导出 Word 文档 */
  const handleExportWord = async () => {
    if (!entityCode) return;
    setExporting(true);
    try {
      const resp = await rawClient.get(`/release/export-word/${entityCode}${releasePointQuery()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `版本发布评审单_${entityCode}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      message.error(e.message || '导出失败');
    } finally {
      setExporting(false);
    }
  };

  // 联动弹窗：阶段状态标签 → 对应阶段详情；制品卡片 → 投产申请详情
  const [reqOpen, setReqOpen] = useState(false);
  const [devTaskId, setDevTaskId] = useState(null);
  const [testTaskId, setTestTaskId] = useState(null);
  const [applyCode, setApplyCode] = useState(null);
  const [taskPicker, setTaskPicker] = useState(null); // { kind, label, items } 多条任务时先弹列表
  const stageLinkStyle = { cursor: 'pointer' };

  /** 加载我的签名库，默认选中默认签名 */
  const loadSignatures = async (preferId) => {
    try {
      const list = await apiGet('/signatures');
      setSignatures(list || []);
      const def = (list || []).find((s) => s.is_default) || (list || [])[0];
      setSelectedSigId(preferId || def?.id || null);
      setCreatingSig(!(list || []).length); // 无签名时直接进入新建
    } catch { /* 忽略 */ }
  };

  const reload = async (pointOverride) => {
    if (!entityCode) return;
    try {
      const queryPointId = pointOverride ?? currentReleasePointId ?? releasePointId;
      const pointQuery = queryPointId ? `?releasePointId=${encodeURIComponent(queryPointId)}` : '';
      const res = await apiGet(`/release/${entityCode}${pointQuery}`);
      setDetail(res);
      if (res?.releaseTask) setOwner(res.releaseTask.owner);
      setCurrentReleasePointId(res?.releaseTask?.release_point_id ?? res?.entity?.apply_release_point_id ?? null);
      if (res?.entityType === 'requirement' || res?.entityType === 'ticket') {
        try {
          const [impact, coverage] = await Promise.all([
            apiGet(`/impact-analysis/${encodeURIComponent(entityCode)}`),
            apiGet(`/coverage-analysis/${encodeURIComponent(entityCode)}`),
          ]);
          const rows = coverage.rows || [];
          const impactCount = impact.items?.length || 0;
          const coveredCount = rows.filter((row) => row.result === '已覆盖').length;
          setAnalysisSummary({
            impactCount,
            coverageComplete: impactCount > 0 && coveredCount === impactCount,
          });
        } catch {
          setAnalysisSummary({ impactCount: 0, coverageComplete: false });
        }
      } else {
        setAnalysisSummary(null);
      }
    } catch (e) {
      message.error(e.message || '加载详情失败');
    }
  };

  useEffect(() => {
    setCurrentReleasePointId(releasePointId ?? null);
    if ((mode === 'page' || open) && entityCode) reload();
    if (mode !== 'page' && !open) setDetail(null);
  }, [open, entityCode, mode, releasePointId]);

  useEffect(() => {
    if (mode === 'page' || open) apiGet('/release-points/all').then(setPoints).catch(() => {});
  }, [open, mode]);

  const canSignDecision = (so) => !!so && (user?.isSuper || (user?.roles || []).some((r) => r.name === so.role_name));
  const canSign = (so) => can('release', 'release.signoff')
    && (canSignDecision(so) || isAdminUser)
    && (so?.result !== '不涉及' || isAdminUser);

  const isSignedSignoff = (so) => so?.result && so.result !== '未签署';

  const handleOpenSign = (so, readonly = false) => {
    setCurrentSignoff(so);
    const adminOnly = isAdminUser && !canSignDecision(so);
    const result = adminOnly ? '不涉及' : (so.result === '不涉及' ? '不涉及' : (so.result === '已驳回' ? '已驳回' : '已签署'));
    setSignResult(result);
    const defaultConclusion = result === '不涉及' ? '不涉及' : (result === '已签署' ? '同意投产' : '不同意，[补充具体原因]');
    setSignConclusion(readonly ? (so.conclusion || '') : (so.conclusion || defaultConclusion));
    setSignReadonly(readonly);
    setSignOpen(true);
    if (!readonly && result !== '不涉及') loadSignatures();
  };

  const handleSignResultChange = (val) => {
    setSignResult(val);
    if (val === '已签署' && (!signConclusion || signConclusion === '不同意，[补充具体原因]')) {
      setSignConclusion('同意投产');
    } else if (val === '已驳回' && (!signConclusion || signConclusion === '同意投产')) {
      setSignConclusion('不同意，[补充具体原因]');
    } else if (val === '不涉及' && (!signConclusion || signConclusion === '同意投产' || signConclusion === '不同意，[补充具体原因]')) {
      setSignConclusion('不涉及');
    }
    if (val !== '不涉及' && !signatures.length) {
      loadSignatures();
    }
  };

  /** 保存当前手绘/上传的签名到签名库，并选中 */
  const saveSignature = async () => {
    const dataUrl = padRef.current?.getDataURL?.();
    if (!dataUrl) { message.warning('请先手写或上传签名'); return; }
    setSavingSig(true);
    try {
      const sig = await apiPost('/signatures', { dataUrl });
      message.success('签名已保存');
      await loadSignatures(sig.id);
      setCreatingSig(false);
      padRef.current?.clear?.();
    } catch (e) {
      message.error(e.message || '保存失败');
    } finally {
      setSavingSig(false);
    }
  };

  /** 删除一枚签名 */
  const deleteSignature = async (id) => {
    try {
      await apiDelete(`/signatures/${id}`);
      const next = signatures.filter((s) => s.id !== id);
      await loadSignatures(selectedSigId === id ? undefined : selectedSigId);
      if (!next.length) setCreatingSig(true);
    } catch (e) { message.error(e.message || '删除失败'); }
  };

  /** 上传图片作为签名（读为 DataURL 载入画布，再走保存流程） */
  const onUploadSignature = (file) => {
    const reader = new FileReader();
    reader.onload = () => { setCreatingSig(true); setTimeout(() => padRef.current?.loadImage?.(reader.result), 0); };
    reader.readAsDataURL(file);
    return false; // 阻止 antd 默认上传
  };

  /** 确认签署 */
  const confirmSign = async () => {
    if (!currentSignoff) return;
    if (signResult !== '不涉及' && !selectedSigId) { message.warning('请选择或新建并保存一枚评审签名'); return; }
    setSigning(true);
    try {
      await apiPost(`/release/signoff/${currentSignoff.id}`, {
        result: signResult,
        conclusion: signConclusion,
        signatureId: signResult === '不涉及' ? undefined : selectedSigId,
      });
      message.success(signResult === '不涉及' ? '已设置为不涉及' : '签署完成');
      setSignOpen(false);
      reload();
      onChanged?.();
    } catch (e) {
      message.error(e.message || '操作失败');
    } finally {
      setSigning(false);
    }
  };

  const handleOwnerChange = async (val) => {
    setOwner(val);
    try {
      await apiPut(`/release/${entityCode}${releasePointQuery()}`, { owner: val });
      message.success('已更新投产负责人');
      reload();
      onChanged?.();
    } catch (e) {
      message.error(e.message || '更新失败');
    }
  };

  const handleApplyPointChange = async (val) => {
    const prev = currentReleasePointId;
    setCurrentReleasePointId(val);
    try {
      // 申请投产点是审批实例维度；后端会同步移动关联投产申请，并在目标点已有审批时按较新数据合并。
      await apiPut(`/release/${entityCode}${releasePointQuery()}`, { release_point_id: val });
      message.success('已更新申请投产点');
      await reload(val);
      onChanged?.();
    } catch (e) {
      setCurrentReleasePointId(prev);
      message.error(e.message || '更新失败');
    }
  };

  const SignoffCard = ({ so }) => {
    const editableSign = canSign(so);
    const readonlySign = !editableSign && isSignedSignoff(so);
    const clickable = editableSign || readonlySign;
    const notApplicable = so.result === '不涉及';
    return (
      <Card size="small" hoverable={clickable} styles={{ body: { padding: '6px 8px' } }}
        style={{
          cursor: clickable ? 'pointer' : 'default',
          borderColor: 'var(--radar-border)',
          height: '100%',
          boxShadow: 'none',
          background: notApplicable ? 'var(--radar-bg)' : undefined,
          opacity: notApplicable ? 0.62 : 1,
        }}
        onClick={() => {
          if (editableSign) handleOpenSign(so);
          else if (readonlySign) handleOpenSign(so, true);
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <strong style={{ fontSize: 12, color: 'var(--radar-ink)' }}>{so.role_name}</strong>
          <StatusBadge status={so.result} />
        </div>
        {!notApplicable && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            {/* 左：签署信息 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--radar-text-secondary)', flex: 1, minWidth: 0 }}>
              <div><span style={{ display: 'inline-block', width: 55 }}>签署人：</span><span style={{ color: 'var(--radar-ink)' }}>{so.signer_name || '—'}</span></div>
              <div><span style={{ display: 'inline-block', width: 55 }}>签署时间：</span><span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{fmtSignTime(so.sign_time)}</span></div>
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <span style={{ display: 'inline-block', width: 55, flexShrink: 0 }}>签署意见：</span>
                <span
                  title={so.conclusion || ''}
                  style={{
                    color: 'var(--radar-ink)',
                    display: '-webkit-box',
                    flex: 1,
                    minWidth: 0,
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    lineHeight: '16px',
                    maxHeight: 48,
                  }}
                >
                  {so.conclusion || '—'}
                </span>
              </div>
            </div>
            {/* 右：评审人签名（夜间模式反色，使深色笔迹可见） */}
            <div style={{ width: 84, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              {so.signature_image ? (
                <img src={so.signature_image} alt="签名" style={{ maxWidth: '100%', maxHeight: 32, objectFit: 'contain', filter: isDark ? 'invert(1)' : 'none' }} />
              ) : (
                <span style={{ fontSize: 10, color: '#bbb' }}>未签名</span>
              )}
            </div>
          </div>
        )}
      </Card>
    );
  };

  const ReadonlySignoffView = ({ so }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, fontSize: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, width: 70 }}>签署结论：</span>
        <StatusBadge status={so?.result} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, width: 70 }}>签署人：</span>
        <span style={{ color: 'var(--radar-ink)' }}>{so?.signer_name || '—'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 600, width: 70 }}>签署时间：</span>
        <span style={{ color: 'var(--radar-ink)', fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{fmtSignTime(so?.sign_time)}</span>
      </div>
      {so?.signoff_check_content && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontWeight: 600 }}>会签检查内容：</span>
          <div style={{ padding: '6px 8px', border: '1px solid var(--radar-border)', borderRadius: 2, background: 'var(--radar-primary-soft)', color: 'var(--radar-ink)', lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {so.signoff_check_content}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontWeight: 600 }}>签署意见：</span>
        <div style={{ minHeight: 64, padding: '6px 8px', border: '1px solid var(--radar-border)', borderRadius: 2, background: 'var(--radar-bg)', color: 'var(--radar-ink)', lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {so?.conclusion || '—'}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontWeight: 600 }}>评审签名：</span>
        <div style={{ minHeight: 96, border: '1px solid var(--radar-border)', borderRadius: 2, background: 'var(--radar-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10 }}>
          {so?.signature_image ? (
            <img src={so.signature_image} alt="签名" style={{ maxWidth: '100%', maxHeight: 76, objectFit: 'contain', filter: isDark ? 'invert(1)' : 'none' }} />
          ) : (
            <span style={{ fontSize: 11, color: '#bbb' }}>未签名</span>
          )}
        </div>
      </div>
    </div>
  );

  // 关联制品卡片（只读）：含各部署单元的摆渡状态
  const ArtifactCard = ({ a }) => {
    const units = Array.isArray(a.units) ? a.units : [];
    return (
      <Card size="small" hoverable styles={{ body: { padding: '8px 10px' } }}
        style={{ borderColor: 'var(--radar-border)', boxShadow: 'none', marginBottom: 6, cursor: 'pointer' }}
        onClick={() => a.change_code && setApplyCode(a.change_code)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--radar-primary)', fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{a.change_code}</span>
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
              <span style={{ marginLeft: 'auto' }}><StatusBadge status={u.ferry_status} /></span>
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

  // 打开某条任务详情（按阶段类型分发到开发/测试详情弹窗）
  const openTask = (kind, id) => { if (kind === 'dev') setDevTaskId(id); else setTestTaskId(id); };

  // 阶段聚合标签：始终显示一个最弱状态；点击时——单条直接打开详情，多条先弹任务列表再选
  const stageBadge = (list, order, kind, label) => {
    if (!list || list.length === 0) return <StatusBadge status="未开始" />;
    const onClick = () => {
      if (list.length === 1) openTask(kind, list[0].id);
      else setTaskPicker({ kind, label, items: list });
    };
    return (
      <span style={stageLinkStyle} onClick={onClick}>
        <StatusBadge status={weakestStatus(list, order)} />
      </span>
    );
  };

  return (
    <EditorShell
      mode={mode}
      open={open}
      width={980}
      footer={null}
      onCancel={onClose}
      title={(
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 10, rowGap: 6, minWidth: 0, width: '100%', paddingRight: 76 }}>
          <CodeLink module="release" code={entityCode} />
          {detail?.releaseTask && (
            <span className={`status-select status-select-${getStatusType(statusValue)}`}>
              <DictSelect
                category="release_status" size="small" allowClear={false} showSearch={false}
                popupClassName="status-select-dropdown" popupMatchSelectWidth={false}
                value={statusValue}
                onChange={async (v) => {
                  try { await apiPut(`/release/${entityCode}${releasePointQuery()}`, { status: v }); message.success('已更新投产状态'); reload(); onChanged?.(); }
                  catch (e) { message.error(e.message || '更新失败'); }
                }}
                placeholder="投产状态"
                style={{ width: statusSelectWidth(statusValue, '投产状态'), ...(!editable ? { pointerEvents: 'none' } : {}) }}
              />
            </span>
          )}
          {detail?.releaseTask && (
            <>
              <Tooltip title="导出 Word">
                <Button type="text" icon={<DownloadOutlined style={{ fontSize: 16 }} />} onClick={handleExportWord} loading={exporting} aria-label="导出 Word"
                  style={{ position: 'absolute', top: 12, right: 84, width: 32, height: 32, borderRadius: 2, color: 'var(--radar-text-secondary)' }} />
              </Tooltip>
              <Tooltip title="变更历史">
                <Button type="text" icon={<HistoryOutlined style={{ fontSize: 16 }} />} onClick={() => setHistoryOpen(true)} aria-label="变更历史"
                  style={{ position: 'absolute', top: 12, right: 48, width: 32, height: 32, borderRadius: 2, color: 'var(--radar-text-secondary)' }} />
              </Tooltip>
            </>
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

                {(entityType === 'requirement' || entityType === 'ticket') ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <strong style={{ fontSize: 13, color: 'var(--radar-ink)', display: 'block', marginBottom: 2 }}>{entity.title}</strong>
                      </div>
                      <div>
                        <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>计划投产点：</span>
                        <ReleasePointText value={entity.plan_release_date || entity.release_date} style={{ color: 'var(--radar-ink)', fontSize: 11 }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--radar-ink)', background: 'var(--radar-bg)', padding: '6px 10px', borderRadius: 2, maxHeight: 80, overflowY: 'auto', border: '1px solid var(--radar-border)', whiteSpace: 'pre-wrap', lineHeight: '16px' }}>
                      {entity.summary || '无概述内容'}
                    </div>
                    <div className="release-stage-grid">
                      <StageChip label={entityType === 'ticket' ? '工单' : '需求'}>
                        <span style={stageLinkStyle} onClick={() => setReqOpen(true)}><StatusBadge status={entity.status} /></span>
                      </StageChip>
                      <StageChip label="开发">{stageBadge(ts?.dev, DEV_ORDER, 'dev', '开发')}</StageChip>
                      <StageChip label="应用组装">{stageBadge(ts?.sit, TEST_ORDER, 'test', '应用组装')}</StageChip>
                      <StageChip label="用户测试">{stageBadge(ts?.uat, TEST_ORDER, 'test', '用户测试')}</StageChip>
                      {ts?.nft && ts.nft.length > 0 && (
                        <StageChip label="非功能测试">{stageBadge(ts.nft, TEST_ORDER, 'test', '非功能测试')}</StageChip>
                      )}
                      {ts?.sec && ts.sec.length > 0 && (
                        <StageChip label="安全测试">{stageBadge(ts.sec, TEST_ORDER, 'test', '安全测试')}</StageChip>
                      )}
                      <StageChip label="影响性分析">
                        <Tag className="status-tag tag-system" role="button" tabIndex={0}
                          onClick={() => setImpactOpen(true)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setImpactOpen(true); }}
                          style={{ margin: 0, borderRadius: 2, cursor: 'pointer' }}>
                          {analysisSummary ? `${analysisSummary.impactCount}条` : '—'}
                        </Tag>
                      </StageChip>
                      <StageChip label="测试覆盖">
                        <Tag className={`status-tag ${analysisSummary?.coverageComplete ? 'status-tag-final' : 'status-tag-initial'}`} role="button" tabIndex={0}
                          onClick={() => setCoverageOpen(true)}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setCoverageOpen(true); }}
                          style={{ margin: 0, borderRadius: 2, cursor: 'pointer' }}>
                          {analysisSummary?.coverageComplete ? '已覆盖' : '未覆盖'}
                        </Tag>
                      </StageChip>
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
                        <span style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>申请投产点：</span>
                        <ReleasePointText value={entity.apply_release_date || entity.release_date} style={{ color: 'var(--radar-ink)', fontSize: 11 }} />
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
                        try { await apiPut(`/release/${entityCode}${releasePointQuery()}`, { review_status: v }); message.success('已更新评审状态'); reload(); onChanged?.(); }
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
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--radar-ink)', width: 80 }}>申请投产点</span>
                    <Select
                      size="small"
                      value={currentReleasePointId}
                      onChange={handleApplyPointChange}
                      placeholder="选择申请投产点"
                      showSearch
                      optionFilterProp="searchLabel"
                      options={makeReleasePointOptions(points, { includeVersionType: true })}
                      style={{ flex: 1, ...(editable ? {} : { pointerEvents: 'none' }) }}
                      tabIndex={editable ? undefined : -1}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--radar-ink)', width: 80 }}>投产负责人</span>
                    <PersonPicker style={{ flex: 1, ...(!editable ? { pointerEvents: 'none' } : {}) }} placeholder="选择投产负责人" size="small" value={owner} onChange={handleOwnerChange} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                    <span style={{ width: 80 }}>申请人：</span><span>{detail.releaseApplicant?.display || '—'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--radar-text-secondary)' }}>
                    <span style={{ width: 80 }}>发起时间：</span><span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{detail.releaseApplicant?.register_time || '—'}</span>
                  </div>
                </div>
              </div>

              {/* 关联制品情况 */}
              <div className="form-section-card">
                <div className="form-section-title" style={{ marginTop: 0, marginBottom: 4 }}>关联制品情况</div>
                <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginBottom: 8 }}>
                  引用了本{entityType === 'issue' ? '问题' : (entityType === 'ticket' ? '工单' : '需求')}的投产申请制品
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
        title={`${signReadonly ? '查看会签' : '签署会签'} · ${currentSignoff?.role_name}`}
        onCancel={() => setSignOpen(false)}
        onOk={signReadonly ? undefined : confirmSign}
        confirmLoading={signing}
        width={460} destroyOnHidden okText="确认签署" cancelText="取消"
        footer={signReadonly ? null : undefined}
      >
        {signReadonly ? <ReadonlySignoffView so={currentSignoff} /> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, fontSize: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 600, width: 70 }}>签署结论：</span>
            <Radio.Group value={signResult} onChange={(e) => handleSignResultChange(e.target.value)} size="small">
              {canSignDecision(currentSignoff) && <Radio value="已签署">同意</Radio>}
              {canSignDecision(currentSignoff) && <Radio value="已驳回">拒绝</Radio>}
              {isAdminUser && <Radio value="不涉及">不涉及</Radio>}
            </Radio.Group>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {currentSignoff?.signoff_check_content && (
              <>
                <span style={{ fontSize: 12, fontWeight: 600 }}>会签检查内容：</span>
                <div style={{ padding: '6px 8px', border: '1px solid var(--radar-border)', borderRadius: 2, background: 'var(--radar-primary-soft)', color: 'var(--radar-ink)', lineHeight: '18px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {currentSignoff.signoff_check_content}
                </div>
              </>
            )}
            <span style={{ fontSize: 12, fontWeight: 600 }}>签署意见：</span>
            <Input.TextArea
              placeholder="请输入签署意见 / 结论"
              value={signConclusion}
              onChange={(e) => setSignConclusion(e.target.value)}
              autoSize={{ minRows: 2 }}
              style={{ fontSize: 12 }}
            />
          </div>

          {/* 评审签名：选择已存签名，或新建（手写/上传）并保存 */}
          {signResult !== '不涉及' && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>评审签名：</span>
              {!creatingSig && (
                <Button type="link" size="small" icon={<PlusOutlined />} onClick={() => { setCreatingSig(true); setTimeout(() => padRef.current?.clear?.(), 0); }} style={{ padding: 0, height: 'auto' }}>新建签名</Button>
              )}
            </div>

            {!creatingSig ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {signatures.length === 0 ? (
                  <span style={{ fontSize: 11, color: '#bbb' }}>暂无签名，请点击「新建签名」</span>
                ) : signatures.map((s) => {
                  const active = s.id === selectedSigId;
                  return (
                    <div key={s.id} onClick={() => setSelectedSigId(s.id)}
                      style={{ position: 'relative', width: 120, height: 56, border: `1px solid ${active ? 'var(--radar-primary)' : 'var(--radar-border)'}`, borderRadius: 4, background: active ? 'var(--radar-primary-soft)' : 'var(--radar-surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={s.dataUrl} alt="签名" style={{ maxWidth: '92%', maxHeight: '88%', objectFit: 'contain', filter: isDark ? 'invert(1)' : 'none' }} />
                      {s.is_default && <span style={{ position: 'absolute', top: 2, left: 4, fontSize: 9, color: 'var(--radar-primary)' }}>默认</span>}
                      <Popconfirm title="删除该签名？" onConfirm={(e) => { e?.stopPropagation?.(); deleteSignature(s.id); }} onCancel={(e) => e?.stopPropagation?.()}>
                        <DeleteOutlined onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 2, right: 4, fontSize: 11, color: 'var(--radar-text-secondary)' }} />
                      </Popconfirm>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}><HighlightOutlined /> 在下方手写，或上传签名图片</div>
                <SignaturePad ref={padRef} height={150} invert={isDark} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button size="small" onClick={() => padRef.current?.clear?.()}>清除</Button>
                  <Upload accept="image/png,image/jpeg" showUploadList={false} beforeUpload={onUploadSignature}>
                    <Button size="small" icon={<UploadOutlined />}>上传图片</Button>
                  </Upload>
                  <Button type="primary" size="small" loading={savingSig} onClick={saveSignature}>保存签名</Button>
                  {signatures.length > 0 && <Button size="small" type="text" onClick={() => setCreatingSig(false)}>返回选择</Button>}
                </div>
              </div>
            )}
          </div>}
        </div>}
      </Modal>

      <HistoryDrawer open={historyOpen} entityType="release" entityId={detail?.releaseTask?.id} onClose={() => setHistoryOpen(false)} />

      {/* 多条任务时先弹任务列表，点选某条再打开对应详情（条件渲染，关闭即卸载） */}
      {taskPicker && (
        <Modal
          open
          title={`${taskPicker.label || ''}任务（${taskPicker.items?.length || 0}）`}
          footer={null}
          onCancel={() => setTaskPicker(null)}
          width={460}
          styles={{ body: { fontSize: 12 } }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {(taskPicker.items || []).map((t) => (
              <div
                key={t.id}
                onClick={() => { const k = taskPicker.kind, id = t.id; setTaskPicker(null); openTask(k, id); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid var(--radar-border)', borderRadius: 4, cursor: 'pointer' }}
              >
                <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontWeight: 600, color: 'var(--radar-primary)' }}>{t.task_code}</span>
                {t.impl_system && <span style={{ color: 'var(--radar-text-secondary)' }}>{t.impl_system}</span>}
                <span style={{ marginLeft: 'auto' }}><StatusBadge status={t.status} /></span>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* 联动弹窗：阶段详情（需求/工单 / 开发 / 测试）与投产申请详情 */}
      <RequirementEditor open={reqOpen && entityType === 'requirement'} code={entityType === 'requirement' ? entityCode : undefined} onClose={() => setReqOpen(false)} onSaved={reload} />
      <TicketEditor open={reqOpen && entityType === 'ticket'} code={entityType === 'ticket' ? entityCode : undefined} onClose={() => setReqOpen(false)} onSaved={reload} />
      <TaskEditor open={!!devTaskId} kind="dev" taskId={devTaskId} onClose={() => setDevTaskId(null)} onSaved={reload} />
      <TaskEditor open={!!testTaskId} kind="test" taskId={testTaskId} onClose={() => setTestTaskId(null)} onSaved={reload} />
      <ReleaseApplyEditor open={!!applyCode} code={applyCode} onClose={() => setApplyCode(null)} onSaved={reload} />
      <ImpactAnalysisModal open={impactOpen} reqCode={entityCode} readOnly onClose={() => setImpactOpen(false)} />
      <CoverageAnalysisModal open={coverageOpen} reqCode={entityCode} readOnly onClose={() => setCoverageOpen(false)} />
    </EditorShell>
  );
}

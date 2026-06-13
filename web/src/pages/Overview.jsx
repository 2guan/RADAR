/**
 * 文件：pages/Overview.jsx
 * 用途：版本概览页面。按实施机构分组展示当前投产窗口需求卡片（每行最多 2 条），
 *       卡片含编号、所属系统、当前阶段状态与全流程进度条；点击卡片弹出 5 列全生命周期详情，
 *       点击任一阶段卡片打开对应阶段的编辑弹窗（可编辑、保存留痕、回写概览）。
 * 作者：hengguan
 */
import React, { useEffect, useState, useMemo } from 'react';
import {
  Card, Row, Col, Tag, Typography, Empty, Modal, Space, Spin, Select, Avatar, Tabs, Button, Table, Radio, message, Timeline, Tooltip, List, Checkbox,
} from 'antd';
import { SafetyCertificateOutlined, DeploymentUnitOutlined, DownloadOutlined, DownOutlined, UpOutlined, HistoryOutlined, ExportOutlined } from '@ant-design/icons';
import { useResponsive } from '../hooks/useResponsive.js';
import ChainBar from '../components/ChainBar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import RequirementEditor from '../components/editors/RequirementEditor.jsx';
import TaskEditor from '../components/editors/TaskEditor.jsx';
import ReleaseDetail from '../components/editors/ReleaseDetail.jsx';
import ResizableTitle from '../components/ResizableTitle.jsx';
import { apiPost, apiGet, rawClient } from '../api/client.js';
import FilterPanel from '../components/FilterPanel.jsx';
import { useAppStore } from '../stores/app.js';
import { exportXlsx } from '../utils/io.js';
import Can from '../components/Can.jsx';

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

      <div
        onClick={(e) => {
          e.stopPropagation(); // 阻止触发卡片的编辑弹窗
          setExpanded(!expanded);
        }}
        className="card-expand-bar"
      >
        {expanded ? <UpOutlined style={{ fontSize: 9 }} /> : <DownOutlined style={{ fontSize: 9 }} />}
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

const TEST_TYPE_LABEL = { SIT: '应用组装测试', UAT: '用户测试', NFT: '非功能测试', SEC: '安全测试' };

/** 承接弹窗·移动端：已选需求卡片（单条、预选、不可改） */
function IntakeReqCard({ requirement }) {
  const r = requirement || {};
  return (
    <Card size="small" style={{ borderColor: 'var(--radar-primary)', background: 'var(--radar-primary-soft)' }}>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontWeight: 600 }}>{r.req_code}</span>
          <Radio checked />
        </Space>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{r.title}</div>
        <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>计划投产点：{r.release_date || '—'}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
          {(r.mainSystemsInfo || []).map((sys) => (
            <Tag key={sys.sys_code} className="status-tag tag-system" style={{ borderRadius: 2, margin: 0, fontSize: 10 }}>{sys.sys_name || sys.sys_code}</Tag>
          ))}
        </div>
      </Space>
    </Card>
  );
}

/** 承接弹窗·移动端：拆分任务预览卡片（可勾选，已存在则禁用） */
function IntakePreviewCard({ item, isChecked, onToggle }) {
  return (
    <Card
      size="small"
      style={{ marginBottom: 8, borderColor: isChecked ? 'var(--radar-primary)' : 'var(--radar-border)' }}
      onClick={onToggle}
    >
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Space>
            <Checkbox checked={item.exists ? false : isChecked} disabled={item.exists} onClick={(e) => e.stopPropagation()} onChange={onToggle} />
            <strong style={{ fontSize: 13 }}>{item.sysName}</strong>
            {item.sysCode !== 'overall' && <span style={{ color: 'var(--radar-text-secondary)', fontSize: 11 }}>({item.sysCode})</span>}
          </Space>
          <Tag className={item.exists ? 'status-tag status-tag-final' : 'status-tag status-tag-in-progress'} style={{ margin: 0 }}>{item.status}</Tag>
        </Space>
        <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)', marginTop: 4 }}>
          角色：
          <Tag className="status-tag" style={{
            borderColor: item.role === '主责' ? 'var(--radar-primary)' : (item.role === '整体' ? 'var(--radar-ink)' : 'var(--radar-accent)'),
            color: item.role === '主责' ? 'var(--radar-primary)' : (item.role === '整体' ? 'var(--radar-ink)' : 'var(--radar-accent)'),
            background: item.role === '主责' ? 'var(--radar-primary-soft)' : (item.role === '整体' ? 'var(--radar-bg)' : 'var(--radar-accent-soft)'),
            margin: 0, fontSize: 10, lineHeight: '14px',
          }}>{item.role}</Tag>
        </div>
        <div style={{ fontSize: 11, color: 'var(--radar-text-secondary)' }}>
          计划生成任务编号：<span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>{item.taskCode}</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--radar-ink)' }}>任务名称：{item.taskName}</div>
      </Space>
    </Card>
  );
}

/** 承接弹窗·移动端：预览列表（卡片版），勾选逻辑与表格 rowSelection 等价 */
function IntakePreviewList({ list, selected, setSelected }) {
  return (
    <List
      dataSource={list}
      rowKey="sysCode"
      size="small"
      renderItem={(item) => {
        const isChecked = selected.includes(item.sysCode);
        const toggle = () => {
          if (item.exists) return;
          setSelected(isChecked ? selected.filter((c) => c !== item.sysCode) : [...selected, item.sysCode]);
        };
        return <IntakePreviewCard item={item} isChecked={isChecked} onToggle={toggle} />;
      }}
    />
  );
}

function DevIntakeModal({ open, requirement, onClose, onSaved }) {
  const { isMobile } = useResponsive();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewList, setPreviewList] = useState([]);
  const [selectedNewSystems, setSelectedNewSystems] = useState([]);
  const [saving, setSaving] = useState(false);

  const [reqColWidths, setReqColWidths] = useState({});
  const [prevColWidths, setPrevColWidths] = useState({});

  useEffect(() => {
    if (open && requirement) {
      setLoadingPreview(true);
      apiPost('/dev-tasks/intake-preview', { reqCode: requirement.req_code })
        .then((res) => {
          setPreviewList(res || []);
          const checkable = (res || [])
            .filter((t) => !t.exists)
            .map((t) => t.sysCode);
          setSelectedNewSystems(checkable);
        })
        .catch((err) => {
          message.error(err.message || '加载预览失败');
        })
        .finally(() => {
          setLoadingPreview(false);
        });
    } else {
      setPreviewList([]);
      setSelectedNewSystems([]);
    }
  }, [open, requirement]);

  const doIntake = async () => {
    if (!selectedNewSystems.length) {
      message.warning('请至少勾选一个需要新建的任务');
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost('/dev-tasks/intake', {
        reqCode: requirement.req_code,
        systems: selectedNewSystems,
      });
      message.success(`已成功承接 ${res.length} 个开发任务`);
      onSaved();
      onClose();
    } catch (err) {
      message.error(err.message || '承接失败');
    } finally {
      setSaving(false);
    }
  };

  const reqColumns = [
    {
      title: '需求编号',
      dataIndex: 'req_code',
      key: 'req_code',
      width: 140,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontWeight: 600 }}>
          {val}
        </span>
      ),
    },
    { title: '需求标题', dataIndex: 'title', key: 'title', width: 280, ellipsis: true },
    { title: '计划投产点', dataIndex: 'release_date', key: 'release_date', width: 140 },
    {
      title: '主责系统',
      dataIndex: 'mainSystemsInfo',
      key: 'mainSystemsInfo',
      width: 200,
      render: (val) => {
        const list = val || [];
        if (!list.length) return '—';
        return list.map((sys) => (
          <Tag key={sys.sys_code} className="status-tag tag-system" style={{ borderRadius: 2 }}>
            {sys.sys_name || sys.sys_code}
          </Tag>
        ));
      },
    },
  ];

  const previewColumns = [
    {
      title: '建立状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (val, record) => {
        const isExist = record.exists;
        return (
          <Tag className={isExist ? 'status-tag status-tag-final' : 'status-tag status-tag-in-progress'} style={{ margin: 0 }}>
            {val}
          </Tag>
        );
      },
    },
    {
      title: '实施系统',
      dataIndex: 'sysName',
      key: 'sysName',
      width: 180,
      render: (val, record) => (
        <span style={{ fontWeight: 500 }}>
          {val} <span style={{ color: 'var(--radar-text-secondary)', fontSize: 11, fontWeight: 400 }}>({record.sysCode})</span>
        </span>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 80,
      align: 'center',
      render: (val) => (
        <Tag className="status-tag" style={{
          borderColor: val === '主责' ? 'var(--radar-primary)' : 'var(--radar-accent)',
          color: val === '主责' ? 'var(--radar-primary)' : 'var(--radar-accent)',
          background: val === '主责' ? 'var(--radar-primary-soft)' : 'var(--radar-accent-soft)',
          margin: 0
        }}>
          {val}
        </Tag>
      ),
    },
    {
      title: '计划生成任务编号',
      dataIndex: 'taskCode',
      key: 'taskCode',
      width: 180,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>
          {val}
        </span>
      ),
    },
    {
      title: '开发任务名称',
      dataIndex: 'taskName',
      key: 'taskName',
      width: 280,
      ellipsis: true,
    },
  ];

  const handleReqResize = (key) => (w) => setReqColWidths((prev) => ({ ...prev, [key]: w }));
  const resizableReqColumns = useMemo(() => reqColumns.map((c) => {
    const width = reqColWidths[c.dataIndex || c.key] || c.width;
    return {
      ...c,
      width,
      onHeaderCell: (col) => ({
        width: col.width,
        onResize: handleReqResize(c.dataIndex || c.key),
      }),
    };
  }), [reqColumns, reqColWidths]);

  const handlePrevResize = (key) => (w) => setPrevColWidths((prev) => ({ ...prev, [key]: w }));
  const resizablePreviewColumns = useMemo(() => previewColumns.map((c) => {
    const width = prevColWidths[c.dataIndex || c.key] || c.width;
    return {
      ...c,
      width,
      onHeaderCell: (col) => ({
        width: col.width,
        onResize: handlePrevResize(c.dataIndex || c.key),
      }),
    };
  }), [previewColumns, prevColWidths]);

  return (
    <Modal
      open={open}
      title="开发承接"
      width={920}
      onCancel={onClose}
      onOk={doIntake}
      confirmLoading={saving}
      okText="承接"
      styles={{ body: { padding: '12px 0 0 0' } }}
      destroyOnClose
    >
      {requirement && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-section-card" style={{ marginBottom: 0 }}>
            <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>1. 选择需求</div>
            {isMobile ? (
              <IntakeReqCard requirement={requirement} />
            ) : (
              <Table
                dataSource={[requirement]}
                rowKey="req_code"
                size="small"
                className="super-compact-table"
                pagination={false}
                components={{ header: { cell: ResizableTitle } }}
                columns={resizableReqColumns}
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: [requirement.req_code],
                  getCheckboxProps: () => ({ disabled: true }),
                }}
              />
            )}
          </div>

          <div className="form-section-card" style={{ marginBottom: 0 }}>
            <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>2. 确认拆分开发任务</div>
            <Spin spinning={loadingPreview}>
              {isMobile ? (
                <IntakePreviewList list={previewList} selected={selectedNewSystems} setSelected={setSelectedNewSystems} />
              ) : (
                <Table
                  dataSource={previewList}
                  columns={resizablePreviewColumns}
                  components={{ header: { cell: ResizableTitle } }}
                  rowKey="sysCode"
                  size="small"
                  className="super-compact-table"
                  pagination={false}
                  rowSelection={{
                    selectedRowKeys: selectedNewSystems,
                    onChange: (keys) => setSelectedNewSystems(keys),
                    getCheckboxProps: (record) => ({
                      disabled: record.exists,
                    }),
                  }}
                />
              )}
            </Spin>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TestIntakeModal({ open, requirement, testType, onClose, onSaved }) {
  const { isMobile } = useResponsive();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState({ overall: [], split: [] });
  const [splitMode, setSplitMode] = useState('overall');
  const [selectedNewSystems, setSelectedNewSystems] = useState([]);
  const [saving, setSaving] = useState(false);

  const [reqColWidths, setReqColWidths] = useState({});
  const [prevColWidths, setPrevColWidths] = useState({});

  useEffect(() => {
    if (open && requirement && testType) {
      setLoadingPreview(true);
      apiPost('/test-tasks/intake-preview', { reqCode: requirement.req_code, testType })
        .then((res) => {
          setPreviewData(res || { overall: [], split: [] });
          const currentList = res ? (splitMode === 'overall' ? res.overall : res.split) : [];
          const checkable = (currentList || []).filter(t => !t.exists).map(t => t.sysCode);
          setSelectedNewSystems(checkable);
        })
        .catch((err) => {
          message.error(err.message || '加载预览失败');
        })
        .finally(() => {
          setLoadingPreview(false);
        });
    } else {
      setPreviewData({ overall: [], split: [] });
      setSelectedNewSystems([]);
      setSplitMode('overall');
    }
  }, [open, requirement, testType]);

  const handleSplitModeChange = (mode) => {
    setSplitMode(mode);
    const currentList = mode === 'overall' ? previewData.overall : previewData.split;
    const checkable = (currentList || []).filter(t => !t.exists).map(t => t.sysCode);
    setSelectedNewSystems(checkable);
  };

  const doIntake = async () => {
    if (!selectedNewSystems.length) {
      message.warning('请至少勾选一个需要新建的任务');
      return;
    }
    setSaving(true);
    try {
      const res = await apiPost('/test-tasks/intake', {
        reqCode: requirement.req_code,
        testType,
        systems: selectedNewSystems,
        splitMode,
      });
      message.success(`已成功承接 ${res.length} 个${TEST_TYPE_LABEL[testType]}任务`);
      onSaved();
      onClose();
    } catch (err) {
      message.error(err.message || '承接失败');
    } finally {
      setSaving(false);
    }
  };

  const reqColumns = [
    {
      title: '需求编号',
      dataIndex: 'req_code',
      key: 'req_code',
      width: 140,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontWeight: 600 }}>
          {val}
        </span>
      ),
    },
    { title: '需求标题', dataIndex: 'title', key: 'title', width: 280, ellipsis: true },
    { title: '计划投产点', dataIndex: 'release_date', key: 'release_date', width: 140 },
    {
      title: '主责系统',
      dataIndex: 'mainSystemsInfo',
      key: 'mainSystemsInfo',
      width: 200,
      render: (val) => {
        const list = val || [];
        if (!list.length) return '—';
        return list.map((sys) => (
          <Tag key={sys.sys_code} className="status-tag tag-system" style={{ borderRadius: 2 }}>
            {sys.sys_name || sys.sys_code}
          </Tag>
        ));
      },
    },
  ];

  const previewColumns = [
    {
      title: '建立状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      align: 'center',
      render: (val, record) => {
        const isExist = record.exists;
        return (
          <Tag className={isExist ? 'status-tag status-tag-final' : 'status-tag status-tag-in-progress'} style={{ margin: 0 }}>
            {val}
          </Tag>
        );
      },
    },
    {
      title: '实施系统',
      dataIndex: 'sysName',
      key: 'sysName',
      width: 180,
      render: (val, record) => (
        <span style={{ fontWeight: 500 }}>
          {val} {record.sysCode !== 'overall' && <span style={{ color: 'var(--radar-text-secondary)', fontSize: 11, fontWeight: 400 }}>({record.sysCode})</span>}
        </span>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 80,
      align: 'center',
      render: (val) => (
        <Tag className="status-tag" style={{
          borderColor: val === '主责' ? 'var(--radar-primary)' : (val === '整体' ? 'var(--radar-ink)' : 'var(--radar-accent)'),
          color: val === '主责' ? 'var(--radar-primary)' : (val === '整体' ? 'var(--radar-ink)' : 'var(--radar-accent)'),
          background: val === '主责' ? 'var(--radar-primary-soft)' : (val === '整体' ? 'var(--radar-bg)' : 'var(--radar-accent-soft)'),
          margin: 0
        }}>
          {val}
        </Tag>
      ),
    },
    {
      title: '计划生成任务编号',
      dataIndex: 'taskCode',
      key: 'taskCode',
      width: 180,
      render: (val) => (
        <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace' }}>
          {val}
        </span>
      ),
    },
    {
      title: '测试任务名称',
      dataIndex: 'taskName',
      key: 'taskName',
      width: 280,
      ellipsis: true,
    },
  ];

  const handleReqResize = (key) => (w) => setReqColWidths((prev) => ({ ...prev, [key]: w }));
  const resizableReqColumns = useMemo(() => reqColumns.map((c) => {
    const width = reqColWidths[c.dataIndex || c.key] || c.width;
    return {
      ...c,
      width,
      onHeaderCell: (col) => ({
        width: col.width,
        onResize: handleReqResize(c.dataIndex || c.key),
      }),
    };
  }), [reqColumns, reqColWidths]);

  const handlePrevResize = (key) => (w) => setPrevColWidths((prev) => ({ ...prev, [key]: w }));
  const resizablePreviewColumns = useMemo(() => previewColumns.map((c) => {
    const width = prevColWidths[c.dataIndex || c.key] || c.width;
    return {
      ...c,
      width,
      onHeaderCell: (col) => ({
        width: col.width,
        onResize: handlePrevResize(c.dataIndex || c.key),
      }),
    };
  }), [previewColumns, prevColWidths]);

  const currentPreviewList = splitMode === 'overall' ? previewData.overall : previewData.split;

  return (
    <Modal
      open={open}
      title={`${TEST_TYPE_LABEL[testType] || ''}承接`}
      width={920}
      onCancel={onClose}
      onOk={doIntake}
      confirmLoading={saving}
      okText="承接"
      styles={{ body: { padding: '12px 0 0 0' } }}
      destroyOnClose
    >
      {requirement && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-section-card" style={{ marginBottom: 0 }}>
            <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>1. 选择需求</div>
            {isMobile ? (
              <IntakeReqCard requirement={requirement} />
            ) : (
              <Table
                dataSource={[requirement]}
                rowKey="req_code"
                size="small"
                className="super-compact-table"
                pagination={false}
                components={{ header: { cell: ResizableTitle } }}
                columns={resizableReqColumns}
                rowSelection={{
                  type: 'radio',
                  selectedRowKeys: [requirement.req_code],
                  getCheckboxProps: () => ({ disabled: true }),
                }}
              />
            )}
          </div>

          <div className="form-section-card" style={{ marginBottom: 0 }}>
            <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>2. 选择承接方式</div>
            <Radio.Group value={splitMode} onChange={(e) => handleSplitModeChange(e.target.value)}>
              <Radio value="overall">合并承接</Radio>
              <Radio value="split">拆分承接</Radio>
            </Radio.Group>
          </div>

          <div className="form-section-card" style={{ marginBottom: 0 }}>
            <div className="form-section-title" style={{ marginTop: 0, marginBottom: 8 }}>3. 确认承接测试任务</div>
            <Spin spinning={loadingPreview}>
              {isMobile ? (
                <IntakePreviewList list={currentPreviewList} selected={selectedNewSystems} setSelected={setSelectedNewSystems} />
              ) : (
                <Table
                  dataSource={currentPreviewList}
                  columns={resizablePreviewColumns}
                  components={{ header: { cell: ResizableTitle } }}
                  rowKey="sysCode"
                  size="small"
                  className="super-compact-table"
                  pagination={false}
                  rowSelection={{
                    selectedRowKeys: selectedNewSystems,
                    onChange: (keys) => setSelectedNewSystems(keys),
                    getCheckboxProps: (record) => ({
                      disabled: record.exists,
                    }),
                  }}
                />
              )}
            </Spin>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RequirementHistoryModal({ open, onClose, reqCode }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const ENTITY_TYPE_LABEL = {
    requirement: '需求',
    dev: '开发',
    test: '测试',
    release: '投产',
  };

  useEffect(() => {
    if (!open || !reqCode) return;
    setLoading(true);
    apiGet(`/overview/${reqCode}/audit`)
      .then((rows) => setList(rows || []))
      .catch((err) => {
        message.error(err.message || '获取变更历史失败');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, reqCode]);

  const actionTag = (a) => ({
    create: <Tag color="green">新建</Tag>,
    update: <Tag color="blue">修改</Tag>,
    delete: <Tag color="red">删除</Tag>,
  }[a] || <Tag>{a}</Tag>);

  return (
    <Modal
      title="全流程变更历史编辑记录"
      open={open}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnClose
      styles={{ body: { maxHeight: '60vh', overflowY: 'auto', paddingTop: 12 } }}
    >
      {loading ? <Spin /> : (
        list.length === 0 ? <Empty description="暂无变更记录" /> : (
          <Timeline
            items={list.map((r) => ({
              children: (
                <div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ marginRight: 8, fontWeight: 500, color: 'var(--radar-text-secondary)' }}>
                      [{ENTITY_TYPE_LABEL[r.entity_type] || r.entity_type}]
                    </span>
                    {r.entity_code && (
                      <span style={{ fontFamily: 'SFMono-Regular, Consolas, monospace', fontWeight: 600, marginRight: 8 }}>
                        {r.entity_code}
                      </span>
                    )}
                    {actionTag(r.action)}
                    <Typography.Text strong style={{ marginLeft: 4 }}>{r.field || '记录'}</Typography.Text>
                    <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {r.operator || '—'} · {r.created_at}
                    </Typography.Text>
                  </div>
                  {r.action === 'update' && (
                    <div style={{ fontSize: 13, background: 'var(--radar-bg)', padding: '4px 8px', borderRadius: 4, marginTop: 4 }}>
                      <Typography.Text delete type="secondary">{r.old_value || '空'}</Typography.Text>
                      <span style={{ margin: '0 6px' }}>→</span>
                      <Typography.Text>{r.new_value || '空'}</Typography.Text>
                    </div>
                  )}
                </div>
              ),
            }))}
          />
        )
      )}
    </Modal>
  );
}

/** 一个阶段页签内的任务网格 */
function TaskGrid({ items, attachFields, onEdit, emptyText, onIntake, hasIntakePermission }) {
  if (!items.length) {
    if (hasIntakePermission && onIntake) {
      return (
        <div className="lc-card lc-card-lg" onClick={onIntake}>
          <div className="lc-empty">{emptyText}</div>
        </div>
      );
    }
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无任务" />;
  }
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

  const can = useAppStore((s) => s.can);
  const [devIntakeReq, setDevIntakeReq] = useState(null);
  const [testIntakeReq, setTestIntakeReq] = useState(null); // { req, testType }
  const [showHistory, setShowHistory] = useState(false);

  // 阶段编辑器：{type:'requirement'|'dev'|'test'|'release', id, reqCode}
  const [editor, setEditor] = useState(null);

  const [filterQuery, setFilterQuery] = useState([]);
  
  // 下拉列表选项数据源
  const [points, setPoints] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [taskStatuses, setTaskStatuses] = useState([]);
  const [systems, setSystems] = useState([]);

  useEffect(() => {
    apiGet('/release-points/all').then(setPoints).catch(() => {});
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
    apiGet('/systems/all').then(setSystems).catch(() => {});
    apiGet('/dict/by-category/process_status').then(res => {
      const opts = [];
      const stages = ['需求', '开发', '应用组装', '非功能测试', '安全测试', '用户测试', '投产'];
      stages.forEach(stg => {
        opts.push({ value: `${stg}-未开始`, label: `${stg} - 未开始` });
      });

      (res || []).forEach(item => {
        const stg = item.extra?.stage;
        const statusVal = item.attr_value;
        if (stg === '需求' || stg === '开发' || stg === '投产') {
          opts.push({ value: `${stg}-${statusVal}`, label: `${stg} - ${statusVal}` });
        } else if (stg === '测试') {
          opts.push({ value: `应用组装-${statusVal}`, label: `应用组装 - ${statusVal}` });
          opts.push({ value: `非功能测试-${statusVal}`, label: `非功能测试 - ${statusVal}` });
          opts.push({ value: `安全测试-${statusVal}`, label: `安全测试 - ${statusVal}` });
          opts.push({ value: `用户测试-${statusVal}`, label: `用户测试 - ${statusVal}` });
        }
      });
      setTaskStatuses(opts);
    }).catch(() => {});
  }, []);

  const pointOptions = points.map(p => ({ value: p.id, label: p.release_date }));
  const orgOptions = orgs.map(o => ({ value: o.attr_value, label: o.display_value }));
  const systemOptions = systems.map(s => ({ value: s.sys_code, label: `${s.sys_code} - ${s.sys_name}` }));
  const stageOptions = [
    { value: '需求', label: '需求' },
    { value: '开发', label: '开发' },
    { value: '应用组装', label: '应用组装' },
    { value: '非功能测试', label: '非功能测试' },
    { value: '安全测试', label: '安全测试' },
    { value: '用户测试', label: '用户测试' },
    { value: '投产', label: '投产' },
  ];

  const filterConfigs = [
    { field: 'req_code', label: '需求编号', type: 'input', isPrimary: true, op: 'like', placeholder: '输入需求编号模糊搜索' },
    { field: 'content', label: '需求内容', type: 'input', isPrimary: true, op: 'like', placeholder: '输入需求标题或概述模糊搜索' },
    { field: 'release_point_id', label: '计划投产点', type: 'select', op: 'in', options: pointOptions },
    { field: 'org', label: '实施机构', type: 'select', op: 'in', options: orgOptions },
    { field: 'stage', label: '任务阶段', type: 'select', op: 'in', options: stageOptions },
    { field: 'taskStatus', label: '任务状态', type: 'select', op: 'in', options: taskStatuses },
    { field: 'main_systems', label: '主责系统', type: 'select', op: 'in', options: systemOptions },
    { field: 'collab_systems', label: '协同系统', type: 'select', op: 'in', options: systemOptions },
  ];

  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find(c => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '');
    setFilterQuery(arr);
  };

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
    apiPost('/overview/list', { releasePointIds, filters: filterQuery }).then((d) => setGroups(d.list || [])).finally(() => setLoading(false));
  };
  useEffect(load, [JSON.stringify(releasePointIds), JSON.stringify(filterQuery)]);

  const loadDetail = async (reqCode) => {
    setDetailLoading(true);
    try { setDetail(await apiGet(`/overview/${reqCode}/detail`)); }
    finally { setDetailLoading(false); }
  };
  const openDetail = async (card) => { setDetailCard(card); setDetailOpen(true); await loadDetail(card.req_code); };

  // 编辑保存后：刷新详情 + 概览
  const onEditorSaved = () => { if (detail) loadDetail(detail.requirement.req_code); load(); };

  return (
    <Card
      title="版本概览"
      extra={
        <Can module="overview" action="view">
          <Button icon={<ExportOutlined />} onClick={() => exportXlsx('/overview/export', { releasePointIds, filters: filterQuery }, '版本概览宽表.xlsx')}>
            全部导出
          </Button>
        </Can>
      }
      variant="borderless"
    >
      <FilterPanel configs={filterConfigs} onChange={handleFilterChange} />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
          <Spin size="large" />
        </div>
      ) : groups.length === 0 ? <Empty description="当前投产窗口暂无需求" style={{ marginTop: 24 }} /> : groups.map((g) => (
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
          <div className="lc-modal-title" style={{ paddingRight: 76 }}>
            <span className="lc-id big">{detail.requirement.req_code}</span>
            <span className="lc-modal-name">{detail.requirement.title}</span>
            {detailCard?.systemName && detailCard.systemName !== '—' && <Tag className="tag-system" style={{ borderRadius: 2, margin: 0 }}>{detailCard.systemName}</Tag>}
            <Tooltip title="历史记录">
              <Button
                type="text"
                icon={<HistoryOutlined style={{ fontSize: 16 }} />}
                onClick={() => setShowHistory(true)}
                aria-label="历史记录"
                style={{ position: 'absolute', top: 12, right: 48, width: 32, height: 32, borderRadius: 2, color: 'var(--radar-text-secondary)' }}
              />
            </Tooltip>
          </div>
        )}>
        {detailLoading || !detail ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 360 }}>
            <Spin size="large" />
          </div>
        ) : (
          isTabMode ? (
            <Tabs
              items={[
                { key: 'req', label: '需求', children: <ReqDetailCard req={detail.requirement} onEdit={() => setEditor({ type: 'requirement', id: detail.requirement.id })} /> },
                { key: 'dev', label: '开发', children: <TaskGrid items={detail.dev} attachFields={DEV_ATTACH} onEdit={(t) => setEditor({ type: 'dev', id: t.id })} emptyText="点击承接开发" onIntake={() => setDevIntakeReq(detail.requirement)} hasIntakePermission={can('dev', 'dev.intake')} /> },
                { key: 'sit', label: '应用组装测试', children: <TaskGrid items={detail.sit} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} emptyText="点击承接测试" onIntake={() => setTestIntakeReq({ req: detail.requirement, testType: 'SIT' })} hasIntakePermission={can('test', 'test.intake')} /> },
                ...(detail.nft.length ? [{ key: 'nft', label: '非功能测试', children: <TaskGrid items={detail.nft} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} /> }] : []),
                ...(detail.sec.length ? [{ key: 'sec', label: '安全测试', children: <TaskGrid items={detail.sec} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} /> }] : []),
                { key: 'uat', label: '用户测试', children: <TaskGrid items={detail.uat} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} emptyText="点击承接测试" onIntake={() => setTestIntakeReq({ req: detail.requirement, testType: 'UAT' })} hasIntakePermission={can('test', 'test.intake')} /> },
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
                <TaskGrid items={detail.dev} attachFields={DEV_ATTACH} onEdit={(t) => setEditor({ type: 'dev', id: t.id })} emptyText="点击承接开发" onIntake={() => setDevIntakeReq(detail.requirement)} hasIntakePermission={can('dev', 'dev.intake')} />
              </div>

              {/* 第三列：应用组装测试、非功能测试、安全测试 */}
              <div className="lc-column">
                <div className="lc-column-header">
                  <span>应用组装测试</span>
                </div>
                <TaskGrid items={detail.sit} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} emptyText="点击承接测试" onIntake={() => setTestIntakeReq({ req: detail.requirement, testType: 'SIT' })} hasIntakePermission={can('test', 'test.intake')} />

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
                <TaskGrid items={detail.uat} attachFields={TEST_ATTACH} onEdit={(t) => setEditor({ type: 'test', id: t.id })} emptyText="点击承接测试" onIntake={() => setTestIntakeReq({ req: detail.requirement, testType: 'UAT' })} hasIntakePermission={can('test', 'test.intake')} />
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

      <DevIntakeModal open={!!devIntakeReq} requirement={devIntakeReq} onClose={() => setDevIntakeReq(null)} onSaved={onEditorSaved} />
      <TestIntakeModal open={!!testIntakeReq} requirement={testIntakeReq?.req} testType={testIntakeReq?.testType} onClose={() => setTestIntakeReq(null)} onSaved={onEditorSaved} />
      <RequirementHistoryModal open={showHistory} reqCode={detail?.requirement?.req_code} onClose={() => setShowHistory(false)} />
    </Card>
  );
}

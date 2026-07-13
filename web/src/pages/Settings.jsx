/**
 * 文件：pages/Settings.jsx
 * 用途：系统设置页面。聚合基础配置、参数配置、投产点设置、机构系统配置、人员配置；
 *       所有配置项支持新增/编辑/删除 + 导入/导出/模板下载。
 * 作者：hengguan
 * 说明：字典/系统/投产点/角色复用 CrudManager；投产点新增使用 DatePicker(存 YYYYMMDD)；
 *       角色配置含"会签角色"打标；流程状态含阶段/终态（extra JSON）。
 */

import React, { useState, useEffect } from 'react';
import { Card, Tabs, Button, Tag, message, Form, Input, InputNumber, Switch, DatePicker, Select } from 'antd';
import { StarOutlined, StarFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
import { useResponsive } from '../hooks/useResponsive.js';
import CrudManager from '../components/CrudManager.jsx';
import AppConfigForm from '../components/AppConfigForm.jsx';
import AppearanceSettings from '../components/AppearanceSettings.jsx';
import PermissionMatrix from '../components/PermissionMatrix.jsx';
import RequiredFieldMatrix from '../components/RequiredFieldMatrix.jsx';
import DictSelect from '../components/DictSelect.jsx';
import { MENU } from '../router/menu.js';
import { PRESETS } from '../theme/presets.js';
import { apiPost, apiGet } from '../api/client.js';
import { makeReleasePointOptions, ReleasePointText } from '../components/ReleasePointText.jsx';

const PENDING_RELEASE_DATE = '投产点待定';
const RELEASE_DATE_RE = /^\d{8}$/;
dayjs.extend(customParseFormat);

/** 安全解析 extra（可能是字符串或对象） */
function parseExtra(e) {
  if (!e) return {};
  if (typeof e === 'object') return e;
  try { return JSON.parse(e); } catch { return {}; }
}

/** 通用字典管理器（属性值/显示值/排序） */
function DictManager({ category, title }) {
  const filterConfigs = [
    { field: 'dict_query', label: title, type: 'input', isPrimary: true, placeholder: `${title}检索` },
  ];

  return (
    <CrudManager
      apiBase="/dict" title={title} baseQuery={{ filters: [{ field: 'category', op: 'eq', value: category }] }}
      io={{ enabled: true, params: { category } }}
      filterConfigs={filterConfigs}
      columns={[
        { title: '属性值', dataIndex: 'attr_value', width: 200 },
        { title: '显示值', dataIndex: 'display_value', width: 200 },
        { title: '排序', dataIndex: 'sort', width: 100, sorter: true },
      ]}
      transformOut={(v) => ({ ...v, category })}
      fields={() => (
        <>
          <Form.Item name="attr_value" label="属性值" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="display_value" label="显示值" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </>
      )}
    />
  );
}

/** 流程状态管理器（含阶段与状态类别打标） */
function ProcessStatusManager() {
  const stageOptions = [
    { value: '需求', label: '需求' },
    { value: '开发', label: '开发' },
    { value: '测试', label: '测试' },
    { value: '投产', label: '投产' },
    { value: '评审', label: '评审' },
  ];

  const filterConfigs = [
    { field: 'stage', label: '阶段', type: 'select', op: 'eq', isPrimary: true, options: stageOptions },
    { field: 'dict_query', label: '流程状态', type: 'input', isPrimary: true, placeholder: '流程状态检索' },
    { field: 'state_type', label: '状态类型', type: 'select', op: 'eq', isPrimary: true, options: [
      { value: 'initial', label: '初始态' },
      { value: 'in-progress', label: '进行中' },
      { value: 'final', label: '终态' },
    ]},
  ];

  return (
    <CrudManager
      apiBase="/dict" title="流程状态" baseQuery={{ filters: [{ field: 'category', op: 'eq', value: 'process_status' }] }}
      io={{ enabled: true, params: { category: 'process_status' } }}
      filterConfigs={filterConfigs}
      columns={[
        { title: '阶段', dataIndex: 'extra', key: 'stage', width: 100, render: (e) => parseExtra(e).stage || '—' },
        { title: '属性值', dataIndex: 'attr_value', width: 160 },
        {
          title: '显示值',
          dataIndex: 'display_value',
          width: 160,
          render: (val, row) => {
            const extra = parseExtra(row.extra);
            const stateType = extra.stateType || (extra.isTerminal ? 'final' : 'in-progress');
            return <Tag className={`status-tag status-tag-${stateType}`} style={{ margin: 0 }}>{val}</Tag>;
          }
        },
        { title: '排序', dataIndex: 'sort', width: 80, sorter: true },
        {
          title: '状态类型',
          dataIndex: 'extra',
          key: 'stateType',
          width: 100,
          render: (e) => {
            const extra = parseExtra(e);
            const type = extra.stateType || (extra.isTerminal ? 'final' : 'in-progress');
            const labelMap = { 'initial': '初始态', 'in-progress': '进行中', 'final': '终态' };
            return labelMap[type] || '进行中';
          }
        },
      ]}
      transformIn={(row) => {
        const extra = parseExtra(row.extra);
        return {
          ...row,
          stage: extra.stage,
          stateType: extra.stateType || (extra.isTerminal ? 'final' : 'in-progress')
        };
      }}
      transformOut={(v) => ({
        category: 'process_status', attr_value: v.attr_value, display_value: v.display_value, sort: v.sort,
        extra: JSON.stringify({
          stage: v.stage,
          stateType: v.stateType,
          isTerminal: v.stateType === 'final'
        }),
      })}
      fields={() => (
        <>
          <Form.Item name="stage" label="阶段" rules={[{ required: true }]}>
            <Input placeholder="需求 / 开发 / 测试 / 投产 / 评审" />
          </Form.Item>
          <Form.Item name="attr_value" label="属性值" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="display_value" label="显示值" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="stateType" label="状态类型" rules={[{ required: true }]} initialValue="in-progress">
            <Select options={[
              { value: 'initial', label: '初始态' },
              { value: 'in-progress', label: '进行中' },
              { value: 'final', label: '终态' },
            ]} />
          </Form.Item>
        </>
      )}
    />
  );
}

/** 投产点管理器（新增时日期选择，另有系统内置“投产点待定”；含设为/取消默认） */
function ReleasePointManager() {
  const [points, setPoints] = useState([]);
  useEffect(() => {
    apiGet('/release-points/all').then(res => setPoints(res || [])).catch(() => {});
  }, []);

  const pointOptions = makeReleasePointOptions(points, { valueKey: 'release_date' });

  const filterConfigs = [
    { field: 'release_date', label: '投产日期', type: 'select', op: 'eq', isPrimary: true, options: pointOptions, placeholder: '投产日期检索' },
    { field: 'version_type_query', label: '版本类型', type: 'input', isPrimary: true, placeholder: '版本类型或备注检索' },
  ];

  return (
    <CrudManager
      apiBase="/release-points" title="投产点"
      io={{ enabled: true }}
      filterConfigs={filterConfigs}
      columns={[
        { title: '投产日期', dataIndex: 'release_date', width: 140, sorter: true, render: (v) => <ReleasePointText value={v} /> },
        { title: '版本类型', dataIndex: 'version_type', width: 120 },
        { title: '默认', dataIndex: 'is_default', width: 90, render: (v) => (v ? <Tag color="green">默认</Tag> : '—') },
        { title: '备注', dataIndex: 'remark' },
      ]}
      transformIn={(row) => ({
        ...row,
        release_date: RELEASE_DATE_RE.test(String(row.release_date || ''))
          ? dayjs(row.release_date, 'YYYYMMDD')
          : row.release_date,
      })}
      transformOut={(v, current) => ({
        ...v,
        release_date: current?.release_date === PENDING_RELEASE_DATE
          ? PENDING_RELEASE_DATE
          : (v.release_date ? v.release_date.format('YYYYMMDD') : ''),
      })}
      fields={(form, current) => (
        <>
          {current?.release_date === PENDING_RELEASE_DATE ? (
            <Form.Item name="release_date" label="投产日期" extra="系统内置投产点">
              <Input disabled />
            </Form.Item>
          ) : (
            <Form.Item name="release_date" label="投产日期" rules={[{ required: true, message: '请选择投产日期' }]} extra="存储格式 YYYYMMDD">
              <DatePicker style={{ width: '100%' }} format="YYYYMMDD" placeholder="选择投产日期" />
            </Form.Item>
          )}
          <Form.Item name="version_type" label="投产版本类型">
            <DictSelect category="version_type" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </>
      )}
      rowActions={(row, reload) => (
        row.is_default
          ? <Button type="link" size="small" icon={<StarFilled style={{ color: '#faad14' }} />}
              onClick={async () => { await apiPost(`/release-points/${row.id}/cancel-default`); message.success('已取消默认'); reload(); }}>取消默认</Button>
          : <Button type="link" size="small" icon={<StarOutlined />}
              onClick={async () => { await apiPost(`/release-points/${row.id}/set-default`); message.success('已设为默认'); reload(); }}>设默认</Button>
      )}
    />
  );
}

/** 系统管理器 */
function SystemManager() {
  const [systems, setSystems] = useState([]);
  const [orgs, setOrgs] = useState([]);
  const [sectors, setSectors] = useState([]);

  useEffect(() => {
    apiGet('/systems/all').then(setSystems).catch(() => {});
    apiGet('/dict/by-category/org').then(setOrgs).catch(() => {});
    apiGet('/dict/by-category/sector').then(setSectors).catch(() => {});
  }, []);

  const systemOptions = systems.map(s => ({ value: s.sys_code, label: `${s.sys_code}-${s.sys_name}` }));
  const orgOptions = orgs.map(o => ({ value: o.attr_value, label: o.display_value }));
  const sectorOptions = sectors.map(s => ({ value: s.attr_value, label: s.display_value }));

  const filterConfigs = [
    { field: 'sys_code', label: '系统名称', type: 'select', op: 'in', isPrimary: true, options: systemOptions, placeholder: '系统名称检索' },
    { field: 'org', label: '所属机构', type: 'select', op: 'in', isPrimary: true, options: orgOptions },
    { field: 'sector', label: '所属板块', type: 'select', op: 'in', isPrimary: true, options: sectorOptions },
  ];

  return (
    <CrudManager
      apiBase="/systems" title="系统"
      io={{ enabled: true }}
      filterConfigs={filterConfigs}
      columns={[
        { title: '系统编号', dataIndex: 'sys_code', width: 140 },
        { title: '系统名称', dataIndex: 'sys_name', width: 220 },
        { title: '所属机构', dataIndex: 'org', width: 140 },
        { title: '所属板块', dataIndex: 'sector', width: 120 },
        { title: '变更负责部门（输出口径）', dataIndex: 'out_dept', width: 180, ellipsis: true },
        { title: '变更负责部门（部署口径）', dataIndex: 'deploy_dept', width: 180, ellipsis: true },
        { title: '排序', dataIndex: 'sort', width: 80, sorter: true },
      ]}
      fields={() => (
        <>
          <Form.Item name="sys_code" label="系统编号" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="sys_name" label="系统名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="org" label="所属机构"><DictSelect category="org" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="sector" label="所属板块"><DictSelect category="sector" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="out_dept" label="变更负责部门（输出口径）"><DictSelect category="org" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="deploy_dept" label="变更负责部门（部署口径）"><DictSelect category="org" style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="sort" label="排序" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </>
      )}
    />
  );
}

/** 角色管理器（含会签角色打标与默认主题、默认首页配置） */
function RoleManager() {
  const filterConfigs = [
    { field: 'name_query', label: '角色名称', type: 'input', isPrimary: true, placeholder: '角色名称或标识检索' },
    { field: 'is_signoff_role', label: '会签角色', type: 'select', op: 'eq', isPrimary: true, options: [
      { value: 1, label: '是' },
      { value: 0, label: '否' },
    ]},
  ];

  // 从 MENU 解析支持的首页路由选项
  const homeOptions = [];
  MENU.forEach((item) => {
    if (item.children) {
      item.children.forEach((child) => {
        homeOptions.push({ label: `${item.label} - ${child.label}`, value: child.key });
      });
    } else {
      homeOptions.push({ label: item.label, value: item.key });
    }
  });

  // 主题预设选项列表
  const themeOptions = Object.values(PRESETS).map((p) => ({
    label: p.name,
    value: p.key,
  }));

  const homeLabelMap = homeOptions.reduce((acc, cur) => {
    acc[cur.value] = cur.label;
    return acc;
  }, {
    '仪表盘': '效能仪表盘', // 兼容旧的值
  });

  return (
    <CrudManager
      apiBase="/roles" title="角色"
      io={{ enabled: true }}
      filterConfigs={filterConfigs}
      columns={[
        { title: '角色名称', dataIndex: 'name', width: 150 },
        { title: '角色标识', dataIndex: 'code', width: 150 },
        { 
          title: '默认首页', 
          dataIndex: 'default_home', 
          width: 150,
          render: (v) => homeLabelMap[v] || v || '—',
        },
        { 
          title: '默认主题', 
          dataIndex: 'default_theme', 
          width: 120,
          render: (v) => PRESETS[v]?.name || v || '蔚蓝',
        },
        { 
          title: '会签角色', 
          dataIndex: 'is_signoff_role', 
          width: 100, 
          render: (v) => (v ? <Tag className="status-tag tag-system" style={{ margin: 0 }}>会签</Tag> : '—') 
        },
        { title: '会签检查内容', dataIndex: 'signoff_check_content', width: 180, ellipsis: true, render: (v) => v || '—' },
        { title: '内置', dataIndex: 'is_builtin', width: 80, render: (v) => (v ? <Tag>内置</Tag> : '—') },
      ]}
      transformIn={(row) => ({ ...row, is_signoff_role: !!row.is_signoff_role })}
      transformOut={(v) => ({ ...v, signoff_check_content: v.is_signoff_role ? v.signoff_check_content : null })}
      fields={(form, current) => (
        <>
          <Form.Item name="name" label="角色名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="code" label="角色标识" rules={[{ required: true }]}><Input disabled={!!current} /></Form.Item>
          <Form.Item name="default_home" label="默认首页" initialValue="/dashboard" rules={[{ required: true, message: '请选择默认首页' }]}>
            <Select options={homeOptions} placeholder="选择默认首页" />
          </Form.Item>
          <Form.Item name="default_theme" label="默认主题" initialValue="sky" rules={[{ required: true, message: '请选择默认主题' }]}>
            <Select options={themeOptions} placeholder="选择默认主题" />
          </Form.Item>
          <Form.Item name="is_signoff_role" label="会签角色" valuePropName="checked" extra="打标后该角色将出现在投产管理的评审会签中，且仅该角色人员可签署/驳回">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, next) => prev.is_signoff_role !== next.is_signoff_role}>
            {({ getFieldValue }) => getFieldValue('is_signoff_role') ? (
              <Form.Item name="signoff_check_content" label="会签检查内容" extra="填写该角色在投产审批会签时需要关注的检查要点">
                <Input.TextArea placeholder="请输入会签时的检查要点" autoSize={{ minRows: 3, maxRows: 6 }} />
              </Form.Item>
            ) : null}
          </Form.Item>
        </>
      )}
    />
  );
}

export default function Settings() {
  const { isMobile } = useResponsive();
  // 基础配置子 Tab
  const baseConfig = (
    <Tabs items={[
      {
        key: 'platform', label: '平台信息',
        children: <AppConfigForm mode="platform" items={[
          { key: 'platform.name', label: '平台名称', placeholder: '如 日常需求研发流程管理' },
          { key: 'platform.shortName', label: '平台英文简称', placeholder: '如 RADAR' },
          { key: 'platform.fullName', label: '平台英文全称' },
          { key: 'platform.copyright', label: '版权信息' },
        ]} />,
      },
      {
        key: 'code', label: '编号规则',
        children: <AppConfigForm mode="code" items={[
          { key: 'code.requirement', label: '需求编号规则', extra: '占位符：{投产窗口} {序号}' },
          { key: 'code.dev', label: '开发任务编号规则', extra: '占位符：{需求编号} {序号}' },
          { key: 'code.test.SIT', label: '应用组装测试编号规则' },
          { key: 'code.test.UAT', label: '用户测试编号规则' },
          { key: 'code.test.NFT', label: '非功能测试编号规则' },
          { key: 'code.test.SEC', label: '安全测试编号规则' },
          { key: 'code.release_apply', label: '投产申请变更编号规则', extra: '占位符：{版本年月} {序号}' },
        ]} />,
      },
      {
        key: 'security', label: '安全规则',
        children: <AppConfigForm mode="security" items={[
          { key: 'security.password.complexity', label: '启用密码复杂度校验', type: 'switch', extra: '校验新密码是否同时包含大小写字母、数字及特殊字符' },
          { key: 'security.password.minLength', label: '密码最小长度', type: 'number', min: 4, max: 32, placeholder: '默认 8' },
          { key: 'security.password.expireDays', label: '密码有效期（天）', type: 'number', min: 0, max: 365, placeholder: '默认 90，设为 0 表示永不过期' },
          { key: 'security.lockout.enabled', label: '启用登录失败锁定', type: 'switch', extra: '密码连续输入错误达到上限后锁定账号一段时间' },
          { key: 'security.lockout.maxAttempts', label: '最大密码错误尝试次数', type: 'number', min: 1, max: 10, placeholder: '默认 5' },
          { key: 'security.lockout.durationMinutes', label: '账号锁定时长（分钟）', type: 'number', min: 1, max: 1440, placeholder: '默认 15' },
        ]} />,
      },
    ]} />
  );

  const paramConfig = (
    <Tabs items={[
      { key: 'status', label: '流程状态', children: <ProcessStatusManager /> },
      { key: 'release', label: '投产状态', children: <DictManager category="release_status" title="投产状态" /> },
      { key: 'review', label: '评审状态', children: <DictManager category="review_status" title="评审状态" /> },
      { key: 'reqtype', label: '需求类型', children: <DictManager category="req_type" title="需求类型" /> },
      { key: 'tickettype', label: '工单类型', children: <DictManager category="ticket_type" title="工单类型" /> },
      { key: 'reqdept', label: '需求部门', children: <DictManager category="req_dept" title="需求部门" /> },
      { key: 'artifact', label: '制品类型', children: <DictManager category="artifact_type" title="制品类型" /> },
      { key: 'ferry', label: '摆渡状态', children: <DictManager category="ferry_status" title="摆渡状态" /> },
    ]} />
  );

  const rpConfig = (
    <Tabs items={[
      { key: 'point', label: '投产点设置', children: <ReleasePointManager /> },
      { key: 'version', label: '版本类型设置', children: <DictManager category="version_type" title="版本类型" /> },
    ]} />
  );

  const orgSysConfig = (
    <Tabs items={[
      { key: 'org', label: '实施机构', children: <DictManager category="org" title="实施机构" /> },
      { key: 'sector', label: '业务板块', children: <DictManager category="sector" title="业务板块" /> },
      { key: 'system', label: '所属系统', children: <SystemManager /> },
    ]} />
  );

  const personConfig = (
    <Tabs items={[
      { key: 'role', label: '角色配置', children: <RoleManager /> },
      { key: 'perm', label: '权限矩阵', children: <PermissionMatrix /> },
      { key: 'org', label: '组织机构', children: <DictManager category="org" title="组织机构" /> },
    ]} />
  );

  return (
    <Card title="系统设置" variant="borderless">
      <Tabs
        tabPosition={isMobile ? 'top' : 'left'}
        items={[
          { key: 'base', label: '基础配置', children: baseConfig },
          { key: 'required', label: '检查内容设置', children: <RequiredFieldMatrix /> },
          { key: 'appearance', label: '外观主题', children: <AppearanceSettings /> },
          { key: 'param', label: '参数配置', children: paramConfig },
          { key: 'rp', label: '投产点设置', children: rpConfig },
          { key: 'orgsys', label: '机构系统配置', children: orgSysConfig },
          { key: 'person', label: '人员配置', children: personConfig },
        ]}
      />
    </Card>
  );
}

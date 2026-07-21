/**
 * 文件：components/RequiredFieldMatrix.jsx
 * 用途：系统设置中的检查内容矩阵配置。
 * 作者：hengguan
 */

import React, { useEffect, useState } from 'react';
import { Button, Checkbox, message, Select, Space, Table, Tabs } from 'antd';
import { apiGet, apiPut } from '../api/client.js';
import { resetRequiredFieldsCache } from '../hooks/useRequiredFields.js';

const STATE_COLUMNS = [
  { key: 'initial', label: '初始态必填' },
  { key: 'inProgress', label: '进行中必填' },
  { key: 'final', label: '终态必填' },
];

function normalizeCell(cell = {}) {
  const visible = typeof cell.visible === 'boolean'
    ? cell.visible
    : (cell.visible ? Object.values(cell.visible).some(Boolean) : true);
  const next = {
    visible,
    required: cell.required ? {
      initial: !!cell.required.initial,
      inProgress: !!cell.required.inProgress,
      final: !!cell.required.final,
    } : {
      initial: !!cell.initial,
      inProgress: !!cell.inProgress,
      final: !!cell.final,
    },
  };
  if (cell.mode) next.mode = cell.mode;
  if (next.required.initial) {
    next.required.inProgress = true;
    next.required.final = true;
  }
  for (const state of STATE_COLUMNS) {
    if (!next.visible) next.required[state.key] = false;
  }
  return next;
}

export default function RequiredFieldMatrix() {
  const [modules, setModules] = useState([]);
  const [attachmentModes, setAttachmentModes] = useState([]);
  const [config, setConfig] = useState({});
  const [activeKey, setActiveKey] = useState('requirement');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await apiGet('/settings/required-fields');
    setModules(res.modules || []);
    setAttachmentModes(res.attachmentModes || []);
    setConfig(res.config || {});
    if (res.modules?.[0]?.key) setActiveKey((old) => old || res.modules[0].key);
  };

  useEffect(() => { load().catch(() => {}); }, []);

  const toggleVisible = (moduleKey, fieldKey, checked) => {
    setConfig((prev) => {
      const next = { ...prev };
      const moduleConfig = { ...(next[moduleKey] || {}) };
      const cell = normalizeCell(moduleConfig[fieldKey]);
      cell.visible = checked;
      moduleConfig[fieldKey] = normalizeCell(cell);
      next[moduleKey] = moduleConfig;
      return next;
    });
  };

  const toggleRequired = (moduleKey, fieldKey, stateKey, checked) => {
    setConfig((prev) => {
      const next = { ...prev };
      const moduleConfig = { ...(next[moduleKey] || {}) };
      const cell = normalizeCell(moduleConfig[fieldKey]);
      cell.required[stateKey] = checked;
      moduleConfig[fieldKey] = normalizeCell(cell);
      next[moduleKey] = moduleConfig;
      return next;
    });
  };

  const setAttachmentMode = (moduleKey, fieldKey, stateKey, mode) => {
    setConfig((prev) => {
      const next = { ...prev };
      const moduleConfig = { ...(next[moduleKey] || {}) };
      const cell = normalizeCell(moduleConfig[fieldKey]);
      cell.mode = {
        initial: moduleConfig[fieldKey]?.mode?.initial || 'both',
        inProgress: moduleConfig[fieldKey]?.mode?.inProgress || 'both',
        final: moduleConfig[fieldKey]?.mode?.final || 'both',
        [stateKey]: mode,
      };
      moduleConfig[fieldKey] = cell;
      next[moduleKey] = moduleConfig;
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await apiPut('/settings/required-fields', { config });
      setConfig(saved || config);
      resetRequiredFieldsCache();
      message.success('检查内容配置已保存');
    } finally {
      setSaving(false);
    }
  };

  const renderModule = (mod) => {
    const rows = [
      ...(mod.fields || []).map((field) => ({ ...field, rowType: 'field', rowKey: field.key, label: field.label })),
      ...(mod.attachmentFields || []).flatMap((name) => {
        const fieldKey = `attachment:${name}`;
        return [
          { key: `${fieldKey}:field`, rowKey: fieldKey, rowType: 'field', label: name },
          { key: `${fieldKey}:mode`, rowKey: fieldKey, rowType: 'mode', label: `${name} · 提交方式` },
        ];
      }),
    ];

    const columns = [
      {
        title: '字段', dataIndex: 'label', fixed: 'left', width: 160, ellipsis: true,
        render: (label) => <span title={label}>{label}</span>,
      },
      {
        title: '显示',
        key: 'visible',
        align: 'center',
        width: 90,
        render: (_, field) => {
          if (field.rowType === 'mode') return null;
          const cell = normalizeCell(config?.[mod.key]?.[field.rowKey]);
          return (
            <Checkbox
              checked={cell.visible}
              onChange={(e) => toggleVisible(mod.key, field.rowKey, e.target.checked)}
            />
          );
        },
      },
      ...STATE_COLUMNS.map((state) => ({
        title: state.label,
        key: state.key,
        align: 'center',
        width: 110,
        render: (_, field) => {
          const cell = normalizeCell(config?.[mod.key]?.[field.rowKey]);
          if (field.rowType === 'mode') {
            return (
              <Select
                size="small"
                value={config?.[mod.key]?.[field.rowKey]?.mode?.[state.key] || 'both'}
                options={attachmentModes.map((m) => ({ value: m.key, label: m.label }))}
                onChange={(value) => setAttachmentMode(mod.key, field.rowKey, state.key, value)}
                disabled={!cell.visible}
                style={{ width: 96 }}
              />
            );
          }
          const disabled = !cell.visible || (cell.required.initial && (state.key === 'inProgress' || state.key === 'final'));
          return (
            <Checkbox
              checked={cell.required[state.key]}
              disabled={disabled}
              onChange={(e) => toggleRequired(mod.key, field.rowKey, state.key, e.target.checked)}
            />
          );
        },
      })),
    ];

    return (
      <div className="compact-table">
        <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'flex-end' }}>
          <Button type="primary" onClick={save} loading={saving} style={{ width: 120 }}>保存配置</Button>
        </Space>
        <Table
          rowKey="key"
          size="small"
          pagination={false}
          columns={columns}
          dataSource={rows}
          scroll={{ x: 'max-content' }}
        />
      </div>
    );
  };

  return (
    <Tabs
      activeKey={activeKey}
      onChange={setActiveKey}
      items={modules.map((mod) => ({
        key: mod.key,
        label: mod.label,
        children: renderModule(mod),
      }))}
    />
  );
}

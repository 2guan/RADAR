/**
 * 文件：components/RequiredFieldMatrix.jsx
 * 用途：系统设置中的字段必填项矩阵配置。
 */

import React, { useEffect, useState } from 'react';
import { Button, Checkbox, message, Select, Space, Table, Tabs } from 'antd';
import { apiGet, apiPut } from '../api/client.js';
import { resetRequiredFieldsCache } from '../hooks/useRequiredFields.js';

const STATE_COLUMNS = [
  { key: 'initial', label: '初始态' },
  { key: 'inProgress', label: '进行中' },
  { key: 'final', label: '终态' },
];

function normalizeCell(cell = {}) {
  const next = {
    initial: !!cell.initial,
    inProgress: !!cell.inProgress,
    final: !!cell.final,
  };
  if (cell.mode) next.mode = cell.mode;
  if (next.initial) {
    next.inProgress = true;
    next.final = true;
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

  const toggle = (moduleKey, fieldKey, stateKey, checked) => {
    setConfig((prev) => {
      const next = { ...prev };
      const moduleConfig = { ...(next[moduleKey] || {}) };
      const cell = normalizeCell(moduleConfig[fieldKey]);
      cell[stateKey] = checked;
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
      message.success('必填项配置已保存');
    } finally {
      setSaving(false);
    }
  };

  const renderModule = (mod) => {
    const rows = [
      ...(mod.fields || []).map((field) => ({ ...field, rowType: 'required', rowKey: field.key, label: field.label })),
      ...(mod.attachmentFields || []).flatMap((name) => {
        const fieldKey = `attachment:${name}`;
        return [
          { key: `${fieldKey}:required`, rowKey: fieldKey, rowType: 'required', label: `${name} · 是否必填` },
          { key: `${fieldKey}:mode`, rowKey: fieldKey, rowType: 'mode', label: `${name} · 提交方式` },
        ];
      }),
    ];

    const columns = [
      { title: '字段', dataIndex: 'label', fixed: 'left', width: 220 },
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
                style={{ width: 96 }}
              />
            );
          }
          const disabled = cell.initial && (state.key === 'inProgress' || state.key === 'final');
          return (
            <Checkbox
              checked={cell[state.key]}
              disabled={disabled}
              onChange={(e) => toggle(mod.key, field.rowKey, state.key, e.target.checked)}
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

/**
 * 文件：components/CrudManager.jsx
 * 用途：通用配置管理器。基于统一的 list/create/update/delete 接口，渲染"列表 + 新增 + 编辑 + 删除"，
 *       供系统设置中的字典、系统、投产点、角色等配置项复用。
 * 作者：hengguan
 * 说明：fields(form) 渲染表单项；transformOut 在提交前加工 payload（如补 category）。
 */

import React, { useRef, useState } from 'react';
import { Button, Space, Modal, Form, Popconfirm, message } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined,
} from '@ant-design/icons';
import DataTable from './DataTable.jsx';
import FilterPanel from './FilterPanel.jsx';
import ImportModal from './ImportModal.jsx';
import Can from './Can.jsx';
import { apiPost, apiPut, apiDelete } from '../api/client.js';
import { exportXlsx } from '../utils/io.js';

export default function CrudManager({
  apiBase, columns, fields, title, baseQuery = {},
  transformIn = (x) => x, transformOut = (x) => x, rowKey = 'id', extraToolbar, rowActions,
  io, // { enabled, params } 开启导入/导出/模板；params 透传给三个接口（如 {category}）
  filterConfigs, // 新增：高级筛选配置项
}) {
  const tableRef = useRef();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState([]);

  const fetcher = (q) => apiPost(`${apiBase}/list`, q);

  const openEdit = (row) => {
    setCurrent(row);
    form.resetFields();
    if (row) form.setFieldsValue(transformIn(row));
    setOpen(true);
  };

  const onSave = async () => {
    const v = await form.validateFields();
    const payload = transformOut(v, current);
    if (current) await apiPut(`${apiBase}/${current[rowKey]}`, payload);
    else await apiPost(apiBase, payload);
    message.success('已保存');
    setOpen(false);
    tableRef.current?.reload();
  };

  const onDelete = async (row) => {
    await apiDelete(`${apiBase}/${row[rowKey]}`);
    message.success('已删除');
    tableRef.current?.reload();
  };

  const handleFilterChange = (vals) => {
    const arr = Object.entries(vals)
      .map(([field, value]) => {
        const conf = filterConfigs.find(c => c.field === field);
        return { field, value, op: conf?.op || 'eq' };
      })
      .filter((item) => item.value !== undefined && item.value !== null && item.value !== '' && !(Array.isArray(item.value) && item.value.length === 0));
    setFilterQuery(arr);
  };

  const fullColumns = [
    ...columns,
    {
      title: '操作', key: 'op', width: 120, fixed: 'right',
      render: (_, row) => (
        <Space size={0}>
          {rowActions?.(row, () => tableRef.current?.reload())}
          <Can module="settings" action="edit"><Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(row)} /></Can>
          <Can module="settings" action="delete"><Popconfirm title="确认删除？（初始值也可删除）" onConfirm={() => onDelete(row)}><Button type="link" size="small" danger icon={<DeleteOutlined />} /></Popconfirm></Can>
        </Space>
      ),
    },
  ];

  // 移动端卡片：由列定义自动生成"字段名 ： 值"行，末行展示操作按钮，避免表格横向滚动
  const mobileCard = (row) => {
    const opCol = fullColumns.find((c) => c.key === 'op');
    const dataCols = fullColumns.filter((c) => c.key !== 'op' && (c.dataIndex || c.render));
    return (
      <div>
        {dataCols.map((c) => {
          const raw = c.dataIndex ? row[c.dataIndex] : undefined;
          const val = c.render ? c.render(raw, row) : raw;
          return (
            <div key={c.key || c.dataIndex} className="crud-card-row">
              <span className="crud-card-label">{c.title}</span>
              <span className="crud-card-value">{val == null || val === '' ? '—' : val}</span>
            </div>
          );
        })}
        {opCol && <div className="crud-card-ops">{opCol.render(null, row)}</div>}
      </div>
    );
  };

  const hasFilter = !!filterConfigs;
  const addButton = (
    <Can key="add" module="settings" action="create">
      <Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>新增</Button>
    </Can>
  );

  const filterPanelActions = [
    addButton,
    ...(io?.enabled ? [
      <Can key="imp" module="settings" action="import">
        <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)} style={{ width: 88 }}>导入</Button>
      </Can>,
      <Can key="exp" module="settings" action="export">
        <Button icon={<ExportOutlined />} onClick={() => exportXlsx(`${apiBase}/export`, { ...baseQuery, ...(io.params || {}), filters: [...(baseQuery.filters || []), ...filterQuery] }, `${title}.xlsx`)} style={{ width: 88 }}>导出</Button>
      </Can>
    ] : [])
  ];

  const tableToolbar = [
    ...(!hasFilter ? [addButton] : []),
    ...(extraToolbar ? [extraToolbar] : [])
  ];

  return (
    <>
      {filterConfigs && (
        <FilterPanel
          configs={filterConfigs}
          onChange={handleFilterChange}
          actions={filterPanelActions}
        />
      )}
      <DataTable
        ref={tableRef}
        columns={fullColumns}
        fetcher={fetcher}
        baseQuery={{ ...baseQuery, filters: [...(baseQuery.filters || []), ...filterQuery] }}
        rowKey={rowKey}
        showSearch={false}
        mobileCard={mobileCard}
        toolbar={tableToolbar}
      />

      {io?.enabled && (
        <ImportModal
          open={importOpen}
          onCancel={() => setImportOpen(false)}
          onSuccess={() => tableRef.current?.reload()}
          importUrl={`${apiBase}/import`}
          templateUrl={`${apiBase}/template`}
          templateFilename={`${title}导入模板.xlsx`}
          extraFields={io.params}
        />
      )}

      <Modal open={open} title={current ? `编辑${title}` : `新增${title}`} onCancel={() => setOpen(false)} onOk={onSave} okText="保存">
        <Form form={form} layout="vertical">{fields(form, current)}</Form>
      </Modal>
    </>
  );
}


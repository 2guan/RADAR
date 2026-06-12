/**
 * 文件：components/CrudManager.jsx
 * 用途：通用配置管理器。基于统一的 list/create/update/delete 接口，渲染"列表 + 新增 + 编辑 + 删除"，
 *       供系统设置中的字典、系统、投产点、角色等配置项复用。
 * 作者：hengguan
 * 说明：fields(form) 渲染表单项；transformOut 在提交前加工 payload（如补 category）。
 */

import React, { useRef, useState } from 'react';
import { Button, Space, Modal, Form, Popconfirm, message, Dropdown, Upload } from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, ImportOutlined, ExportOutlined, DownloadOutlined, DownOutlined,
} from '@ant-design/icons';
import DataTable from './DataTable.jsx';
import Can from './Can.jsx';
import { apiPost, apiPut, apiDelete } from '../api/client.js';
import { exportXlsx, importXlsx, downloadGet } from '../utils/io.js';

export default function CrudManager({
  apiBase, columns, fields, title, baseQuery = {},
  transformIn = (x) => x, transformOut = (x) => x, rowKey = 'id', extraToolbar, rowActions,
  io, // { enabled, params } 开启导入/导出/模板；params 透传给三个接口（如 {category}）
}) {
  const tableRef = useRef();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(null);

  const fetcher = (q) => apiPost(`${apiBase}/list`, { ...q, ...baseQuery });

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

  // 导入（三种冲突模式）
  const ioSlug = apiBase.replace(/[^a-z]/gi, '');
  const doImport = (file, mode) => {
    importXlsx(`${apiBase}/import`, file, mode, io?.params || {})
      .then((r) => { message.success(`导入完成：新增${r.inserted} 更新${r.updated} 跳过${r.skipped}`); tableRef.current?.reload(); })
      .catch(() => {});
    return false;
  };

  const ioToolbar = io?.enabled ? [
    <Can key="tpl" module="settings" action="import">
      <Button icon={<DownloadOutlined />} onClick={() => downloadGet(`${apiBase}/template`, io.params || {}, `${title}模板.xlsx`)}>模板</Button>
    </Can>,
    <Can key="imp" module="settings" action="import">
      <Dropdown menu={{ items: [
        { key: 'skip', label: '重复跳过' }, { key: 'overwrite', label: '覆盖更新' }, { key: 'rollback', label: '出错回滚' },
      ], onClick: ({ key }) => document.getElementById(`${ioSlug}-imp-${key}`)?.click() }}>
        <Button icon={<ImportOutlined />}>导入 <DownOutlined /></Button>
      </Dropdown>
    </Can>,
    <Can key="exp" module="settings" action="export">
      <Button icon={<ExportOutlined />} onClick={() => exportXlsx(`${apiBase}/export`, { ...baseQuery, ...(io.params || {}) }, `${title}.xlsx`)}>导出</Button>
    </Can>,
  ] : [];

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

  return (
    <>
      <DataTable
        ref={tableRef} columns={fullColumns} fetcher={fetcher} baseQuery={baseQuery} rowKey={rowKey}
        mobileCard={mobileCard}
        toolbar={[
          <Can key="add" module="settings" action="create"><Button type="primary" icon={<PlusOutlined />} onClick={() => openEdit(null)}>新增</Button></Can>,
          ...ioToolbar,
          extraToolbar,
        ]}
      />
      {/* 隐藏的导入触发器 */}
      {io?.enabled && ['skip', 'overwrite', 'rollback'].map((m) => (
        <Upload key={m} showUploadList={false} beforeUpload={(f) => doImport(f, m)} accept=".xlsx,.csv">
          <span id={`${ioSlug}-imp-${m}`} />
        </Upload>
      ))}
      <Modal open={open} title={current ? `编辑${title}` : `新增${title}`} onCancel={() => setOpen(false)} onOk={onSave} okText="保存">
        <Form form={form} layout="vertical">{fields(form, current)}</Form>
      </Modal>
    </>
  );
}

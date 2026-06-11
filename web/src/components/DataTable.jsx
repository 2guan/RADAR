/**
 * 文件：components/DataTable.jsx
 * 用途：通用数据表格。统一封装关键字搜索、分页、列头排序、列宽拖拽、刷新，
 *       并在移动端自动从表格切换为卡片列表。通过 ref 暴露 reload()。
 * 作者：hengguan
 * 说明：fetcher(query) 需返回 {list,total}；query 含 page/pageSize/keyword/sort/filters。
 */

import React, {
  forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { Table, Input, Button, Space, Card, List, Empty } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useResponsive } from '../hooks/useResponsive.js';
import ResizableTitle from './ResizableTitle.jsx';

const DataTable = forwardRef(function DataTable(props, ref) {
  const {
    columns: rawColumns, fetcher, rowKey = 'id', toolbar, extraFilters,
    onRowClick, mobileCard, searchPlaceholder = '关键字搜索（输入即搜）', baseQuery = {},
  } = props;
  const { isMobile } = useResponsive();

  const [data, setData] = useState({ list: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState([]);
  const [colWidths, setColWidths] = useState({});
  const baseRef = useRef(baseQuery);
  baseRef.current = baseQuery;

  // 拉取数据
  const load = async () => {
    setLoading(true);
    try {
      const res = await fetcher({ ...baseRef.current, page, pageSize, keyword, sort });
      setData(res || { list: [], total: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, pageSize, JSON.stringify(sort), JSON.stringify(baseQuery)]);

  // 暴露 reload
  useImperativeHandle(ref, () => ({
    reload: () => { setPage(1); load(); },
    getQuery: () => ({ ...baseRef.current, keyword, sort }),
  }));

  // 搜索（防抖）
  const debounceRef = useRef();
  const onKeyword = (v) => {
    setKeyword(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); load(); }, 350);
  };

  // 列宽拖拽
  const handleResize = (key) => (w) => setColWidths((prev) => ({ ...prev, [key]: w }));
  const columns = useMemo(() => rawColumns.map((c) => {
    const width = colWidths[c.dataIndex || c.key] || c.width;
    return {
      ...c,
      width,
      onHeaderCell: (col) => ({
        width: col.width,
        onResize: handleResize(c.dataIndex || c.key),
      }),
    };
  }), [rawColumns, colWidths]);

  // 排序变化
  const onTableChange = (pag, _filters, sorter) => {
    const arr = (Array.isArray(sorter) ? sorter : [sorter])
      .filter((s) => s.order)
      .map((s) => ({ field: s.field, order: s.order === 'descend' ? 'desc' : 'asc' }));
    setSort(arr);
  };

  const header = (
    <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
      <Space wrap>
        <Input
          allowClear prefix={<SearchOutlined />} placeholder={searchPlaceholder}
          value={keyword} onChange={(e) => onKeyword(e.target.value)} style={{ width: 240 }}
        />
        {extraFilters}
        <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
      </Space>
      <Space wrap>{toolbar}</Space>
    </Space>
  );

  // 移动端卡片
  if (isMobile && mobileCard) {
    return (
      <div>
        {header}
        <List
          loading={loading}
          locale={{ emptyText: <Empty description="暂无数据" /> }}
          dataSource={data.list}
          renderItem={(item) => (
            <Card
              size="small" style={{ marginBottom: 10 }} className={onRowClick ? 'clickable' : ''}
              onClick={() => onRowClick?.(item)}
            >
              {mobileCard(item)}
            </Card>
          )}
          pagination={{
            current: page, pageSize, total: data.total, size: 'small',
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
        />
      </div>
    );
  }

  return (
    <div className="compact-table">
      {header}
      <Table
        rowKey={rowKey}
        loading={loading}
        columns={columns}
        dataSource={data.list}
        size="small"
        scroll={{ x: 'max-content' }}
        components={{ header: { cell: ResizableTitle } }}
        onChange={onTableChange}
        onRow={(record) => ({
          onClick: () => onRowClick?.(record),
          style: onRowClick ? { cursor: 'pointer' } : undefined,
        })}
        pagination={{
          current: page, pageSize, total: data.total, showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
      />
    </div>
  );
});

export default DataTable;

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
    onRowClick, mobileCard, searchPlaceholder = '关键字检索', baseQuery = {},
    showSearch = true, tableScroll = { x: 'max-content' }, tableLayout,
    defaultSort = [],
  } = props;
  const { isMobile } = useResponsive();

  const [data, setData] = useState({ list: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState(defaultSort);
  const [nonce, setNonce] = useState(0);
  const [colWidths, setColWidths] = useState({});
  const baseRef = useRef(baseQuery);
  baseRef.current = baseQuery;
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  // 请求序号：仅采纳最新一次响应，丢弃过期返回，避免乱序覆盖
  const seqRef = useRef(0);

  // 拉取数据（统一由 effect 驱动，避免重复触发）
  const load = async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const res = await fetcher({ ...baseRef.current, page, pageSize, keyword: keywordRef.current, sort });
      if (seq === seqRef.current) setData(res || { list: [], total: 0 });
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  };

  useEffect(() => { load(); }, [page, pageSize, JSON.stringify(sort), JSON.stringify(baseQuery), nonce]);

  // 当外部筛选条件 (baseQuery) 发生改变时，自动重置页码回到第一页
  // 从而避免用户当前在第二页及以后时，由于筛选后总条数变少而导致页面空白的 bug
  const prevBaseQueryRef = useRef();
  useEffect(() => {
    const currentBaseQueryStr = JSON.stringify(baseQuery);
    if (prevBaseQueryRef.current !== undefined && prevBaseQueryRef.current !== currentBaseQueryStr) {
      setPage(1);
    }
    prevBaseQueryRef.current = currentBaseQueryStr;
  }, [JSON.stringify(baseQuery)]);

  // 暴露 reload：回到首页并触发一次（nonce 保证即便已在首页也会刷新）
  useImperativeHandle(ref, () => ({
    reload: () => { setPage(1); setNonce((n) => n + 1); },
    getQuery: () => ({ ...baseRef.current, keyword, sort }),
  }));

  // 搜索（防抖）：仅更新状态并触发一次 effect
  const debounceRef = useRef();
  const onKeyword = (v) => {
    setKeyword(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { setPage(1); setNonce((n) => n + 1); }, 350);
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

  const searchInput = showSearch ? (
    <Input
      allowClear prefix={<SearchOutlined />} placeholder={searchPlaceholder}
      value={keyword} onChange={(e) => onKeyword(e.target.value)}
      style={{ width: isMobile ? '100%' : 240 }}
    />
  ) : null;
  // 移动端：搜索框独占一行，过滤器/刷新/操作按钮在下一行换行排布，避免横向溢出
  const header = isMobile ? (
    <div style={{ marginBottom: 12 }}>
      {showSearch && <div style={{ marginBottom: 8 }}>{searchInput}</div>}
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space wrap>
          {extraFilters}
          {showSearch && <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}
        </Space>
        <Space wrap>{toolbar}</Space>
      </Space>
    </div>
  ) : (
    <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
      <Space wrap>
        {showSearch && searchInput}
        {extraFilters}
        {showSearch && <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}
      </Space>
      <Space wrap>{toolbar}</Space>
    </Space>
  );

  const hasHeader = showSearch || extraFilters || (toolbar && (Array.isArray(toolbar) ? toolbar.length > 0 : true));

  // 移动端卡片
  if (isMobile && mobileCard) {
    return (
      <div>
        {hasHeader && header}
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
      {hasHeader && header}
      <Table
        rowKey={rowKey}
        loading={loading}
        columns={columns}
        dataSource={data.list}
        size="small"
        scroll={tableScroll}
        tableLayout={tableLayout}
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

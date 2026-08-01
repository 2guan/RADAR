/**
 * 文件：web/src/shared/ui/DataTable.jsx
 * 说明：统一列表搜索、分页、排序、列宽拖拽、个人列偏好和移动端卡片。
 * 用途：通用数据表格；个人偏好仅在传入 listPreferenceKey 的业务列表启用。
 * 作者：hengguan
 */

import {
  forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
} from 'react';
import { Table, Input, Button, Space, Card, List, Empty, Modal, Checkbox } from 'antd';
import { ReloadOutlined, SearchOutlined, ReloadOutlined as ResetOutlined, SettingOutlined, DragOutlined, CaretUpOutlined, CaretDownOutlined } from '@ant-design/icons';
import { apiDelete, apiGet, apiPut } from '../../platform/api.js';
import { useResponsive } from '../../platform/ui/useResponsive.js';
import ResizableTitle from './ResizableTitle.jsx';

const LONG_TEXT_KEY = /(?:title|summary|content|system|task_name|name)$/i;
const columnKey = (column) => String(column.key || column.dataIndex || '');
const isLockedColumn = (column) => column.personalizable === false || column.fixedLayout || columnKey(column) === 'op';

function uniqueColumns(columns) {
  const seen = new Set();
  return (columns || []).filter((column) => {
    const key = columnKey(column);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function makeDefaultLayout(columns, defaultColumnKeys) {
  const candidates = columns.filter((column) => !isLockedColumn(column));
  const keys = new Set(candidates.map(columnKey));
  const requested = Array.isArray(defaultColumnKeys) && defaultColumnKeys.length
    ? defaultColumnKeys.filter((key) => keys.has(key))
    : candidates.map(columnKey);
  return { visibleKeys: [...new Set(requested)], orderedKeys: [...new Set(requested)], widthByKey: {} };
}

function normalizeLayout(layout, columns, defaults) {
  const candidates = columns.filter((column) => !isLockedColumn(column));
  const allowed = new Set(candidates.map(columnKey));
  const visible = Array.isArray(layout?.visibleKeys) ? layout.visibleKeys.filter((key) => allowed.has(key)) : [];
  const ordered = Array.isArray(layout?.orderedKeys) ? layout.orderedKeys.filter((key) => visible.includes(key)) : [];
  const missing = visible.filter((key) => !ordered.includes(key));
  const widthByKey = Object.fromEntries(Object.entries(layout?.widthByKey || {}).filter(([key, width]) => allowed.has(key) && Number.isFinite(Number(width))));
  // 新增字段只在用户没有个人布局时进入默认列；已有个性化布局不强制打扰用户。
  if (!visible.length) return defaults;
  return { visibleKeys: visible, orderedKeys: [...ordered, ...missing], widthByKey };
}

const DataTable = forwardRef(function DataTable(props, ref) {
  const {
    columns: rawColumns, fetcher, rowKey = 'id', toolbar, extraFilters,
    onRowClick, mobileCard, searchPlaceholder = '关键字检索', baseQuery = {},
    showSearch = true, tableScroll = { x: 'max-content' }, tableLayout,
    defaultSort = [], listPreferenceKey, defaultColumnKeys = [],
  } = props;
  const { isMobile } = useResponsive();

  const [data, setData] = useState({ list: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState(defaultSort);
  const [nonce, setNonce] = useState(0);
  const [layout, setLayout] = useState({ visibleKeys: [], orderedKeys: [], widthByKey: {} });
  const [hasCustomLayout, setHasCustomLayout] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const baseRef = useRef(baseQuery);
  const keywordRef = useRef(keyword);
  const seqRef = useRef(0);
  const saveTimerRef = useRef();
  baseRef.current = baseQuery;
  keywordRef.current = keyword;

  const baseColumns = useMemo(() => uniqueColumns(rawColumns), [rawColumns]);
  const defaults = useMemo(() => makeDefaultLayout(baseColumns, defaultColumnKeys), [baseColumns, defaultColumnKeys]);
  const defaultSignature = JSON.stringify(defaults);

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
  useEffect(() => () => clearTimeout(saveTimerRef.current), []);

  useEffect(() => {
    let alive = true;
    if (!listPreferenceKey) {
      setHasCustomLayout(false);
      setLayout(defaults);
      return () => { alive = false; };
    }
    apiGet(`/user-list-preferences/${encodeURIComponent(listPreferenceKey)}`).then((saved) => {
      if (!alive) return;
      setHasCustomLayout(!!saved);
      setLayout(saved ? normalizeLayout(saved, baseColumns, defaults) : defaults);
    }).catch(() => {
      if (!alive) return;
      setHasCustomLayout(false);
      setLayout(defaults);
    });
    return () => { alive = false; };
  }, [listPreferenceKey]);

  useEffect(() => {
    if (!hasCustomLayout) setLayout(defaults);
  }, [defaultSignature, hasCustomLayout]);

  const persistLayout = useCallback((next) => {
    if (!listPreferenceKey) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const saved = await apiPut(`/user-list-preferences/${encodeURIComponent(listPreferenceKey)}`, next);
        setHasCustomLayout(true);
        setLayout((current) => (current === next ? normalizeLayout(saved, baseColumns, defaults) : current));
      } catch {
        // HTTP client 已显示服务端错误；保留当前界面，用户可以继续调整后重试。
      }
    }, 450);
  }, [listPreferenceKey, baseColumns, defaults]);

  const updateLayout = useCallback((updater) => {
    setLayout((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      persistLayout(next);
      return next;
    });
  }, [persistLayout]);

  const handleResize = useCallback((key) => (width) => {
    updateLayout((current) => ({ ...current, widthByKey: { ...current.widthByKey, [key]: Math.round(width) } }));
  }, [updateLayout]);

  const columns = useMemo(() => {
    const byKey = new Map(baseColumns.map((column) => [columnKey(column), column]));
    const activeLayout = layout.visibleKeys.length ? layout : defaults;
    const visible = new Set(activeLayout.visibleKeys);
    const ordered = activeLayout.orderedKeys.filter((key) => visible.has(key) && byKey.has(key));
    const visibleColumns = ordered.map((key) => byKey.get(key));
    const fixedColumns = baseColumns.filter(isLockedColumn);
    const resolved = [...visibleColumns, ...fixedColumns.filter((column) => !visibleColumns.includes(column))];
    return resolved.map((column) => {
      const key = columnKey(column);
      const headerCell = column.onHeaderCell;
      const width = activeLayout.widthByKey[key] || column.width;
      const isLocked = isLockedColumn(column);
      const defaultAlign = column.align || (column.longText || LONG_TEXT_KEY.test(key) ? 'left' : 'center');
      const sortKey = column.sortKey || column.dataIndex || key;
      const activeSort = sort.find((item) => item.field === sortKey);
      const sortOrder = activeSort?.order === 'desc' ? 'descend' : (activeSort?.order === 'asc' ? 'ascend' : null);
      return {
        ...column,
        title: key === 'op' && listPreferenceKey ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            <span>{column.title || '操作'}</span>
            <Button
              type="text" size="small" icon={<SettingOutlined />} aria-label="设置列表列"
              title="设置列表列"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); setSettingsOpen(true); }}
              style={{ minWidth: 22, height: 22, padding: 0 }}
            />
          </span>
        ) : column.title,
        align: defaultAlign,
        width,
        sorter: isLocked ? false : (column.sorter ?? true),
        sortOrder,
        sortDirections: ['ascend', 'descend', null],
        // 默认不占用表头空间；仅在用户实际排序后显示方向，保持高密度列表干净。
        sortIcon: ({ sortOrder: currentOrder }) => (currentOrder === 'ascend' ? <CaretUpOutlined /> : (currentOrder === 'descend' ? <CaretDownOutlined /> : null)),
        onHeaderCell: (col) => {
          const existing = headerCell?.(col) || {};
          return {
            ...existing,
            width: col.width,
            onResize: isLocked ? undefined : handleResize(key),
            style: { ...existing.style, textAlign: 'center' },
          };
        },
      };
    });
  }, [baseColumns, layout, defaults, handleResize, listPreferenceKey, sort]);

  const prevBaseQueryRef = useRef();
  useEffect(() => {
    const currentBaseQueryStr = JSON.stringify(baseQuery);
    if (prevBaseQueryRef.current !== undefined && prevBaseQueryRef.current !== currentBaseQueryStr) setPage(1);
    prevBaseQueryRef.current = currentBaseQueryStr;
  }, [JSON.stringify(baseQuery)]);

  useImperativeHandle(ref, () => ({
    reload: () => { setPage(1); setNonce((n) => n + 1); },
    getQuery: () => ({ ...baseRef.current, keyword, sort }),
    openColumnSettings: () => setSettingsOpen(true),
  }));

  const onKeyword = (value) => {
    setKeyword(value);
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { setPage(1); setNonce((n) => n + 1); }, 350);
  };

  const onTableChange = (pagination, _filters, sorter) => {
    const arr = (Array.isArray(sorter) ? sorter : [sorter])
      .filter((item) => item.order)
      .map((item) => ({ field: item.column?.sortKey || item.field, order: item.order === 'descend' ? 'desc' : 'asc' }));
    setSort(arr);
    if (pagination?.current && pagination.current !== page) setPage(pagination.current);
  };

  const searchInput = showSearch ? <Input allowClear prefix={<SearchOutlined />} placeholder={searchPlaceholder} value={keyword} onChange={(event) => onKeyword(event.target.value)} style={{ width: isMobile ? '100%' : 240 }} /> : null;
  const header = isMobile ? (
    <div style={{ marginBottom: 12 }}>
      {showSearch && <div style={{ marginBottom: 8 }}>{searchInput}</div>}
      <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}><Space wrap>{extraFilters}{showSearch && <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}</Space><Space wrap>{toolbar}</Space></Space>
    </div>
  ) : (
    <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}><Space wrap>{showSearch && searchInput}{extraFilters}{showSearch && <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>}</Space><Space wrap>{toolbar}</Space></Space>
  );
  const hasHeader = showSearch || extraFilters || (toolbar && (Array.isArray(toolbar) ? toolbar.length > 0 : true));
  const candidates = baseColumns.filter((column) => !isLockedColumn(column));
  const labelByKey = new Map(candidates.map((column) => [columnKey(column), column.title]));

  const toggleColumn = (key, checked) => updateLayout((current) => {
    const visibleKeys = checked ? [...current.visibleKeys, key] : current.visibleKeys.filter((item) => item !== key);
    if (!visibleKeys.length) return current;
    return { ...current, visibleKeys, orderedKeys: checked ? [...current.orderedKeys, key] : current.orderedKeys.filter((item) => item !== key) };
  });
  const moveColumn = (from, to) => updateLayout((current) => {
    if (!from || from === to) return current;
    const orderedKeys = current.orderedKeys.filter((key) => key !== from);
    orderedKeys.splice(Math.max(0, orderedKeys.indexOf(to)), 0, from);
    return { ...current, orderedKeys };
  });
  const resetLayout = async () => {
    clearTimeout(saveTimerRef.current);
    try {
      if (listPreferenceKey) await apiDelete(`/user-list-preferences/${encodeURIComponent(listPreferenceKey)}`);
      setHasCustomLayout(false);
      setLayout(defaults);
      setSettingsOpen(false);
    } catch {
      // HTTP client 已显示服务端错误。
    }
  };

  if (isMobile && mobileCard) {
    return <div>{hasHeader && header}<List loading={loading} locale={{ emptyText: <Empty description="暂无数据" /> }} dataSource={data.list} renderItem={(item) => <Card size="small" style={{ marginBottom: 10 }} className={onRowClick ? 'clickable' : ''} onClick={() => onRowClick?.(item)}>{mobileCard(item)}</Card>} pagination={{ current: page, pageSize, total: data.total, size: 'small', onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); } }} /></div>;
  }

  return (
    <div className="compact-table">
      {hasHeader && header}
      <Table rowKey={rowKey} loading={loading} columns={columns} dataSource={data.list} size="small" scroll={tableScroll || undefined} tableLayout={tableLayout} components={{ header: { cell: ResizableTitle } }} onChange={onTableChange} onRow={(record) => ({ onClick: () => onRowClick?.(record), style: onRowClick ? { cursor: 'pointer' } : undefined })} pagination={{ current: page, pageSize, total: data.total, showSizeChanger: true, showTotal: (total) => `共 ${total} 条`, onChange: (nextPage, nextSize) => { setPage(nextPage); setPageSize(nextSize); } }} />
      {listPreferenceKey && <Modal title="列表列设置" open={settingsOpen} onCancel={() => setSettingsOpen(false)} width={860} footer={<Space><Button icon={<ResetOutlined />} onClick={resetLayout}>恢复默认值</Button><Button type="primary" onClick={() => setSettingsOpen(false)}>完成</Button></Space>} styles={{ body: { background: 'var(--radar-bg)', padding: 16 } }}>
        <div style={{ padding: '12px 14px', marginBottom: 12, border: '1px solid var(--radar-border-light)', background: 'var(--radar-surface)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>个人列表视图</div>
          <div style={{ color: 'var(--radar-text-secondary)', fontSize: 12 }}>仅影响当前登录用户。拖动已显示字段可调整顺序，拖拽列宽会自动保存。</div>
        </div>
        <section style={{ padding: 14, border: '1px solid var(--radar-border-light)', background: 'var(--radar-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}><strong>已显示字段</strong><span style={{ color: 'var(--radar-text-secondary)', fontSize: 12 }}>每行两个字段</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            {layout.orderedKeys.filter((key) => labelByKey.has(key)).map((key, index) => <div key={key} draggable onDragStart={() => setDragKey(key)} onDragOver={(event) => event.preventDefault()} onDrop={() => { moveColumn(dragKey, key); setDragKey(null); }} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '9px 10px', border: '1px solid var(--radar-border)', background: 'var(--radar-bg)', cursor: 'grab' }}>
              <DragOutlined style={{ color: 'var(--radar-text-secondary)' }} />
              <span style={{ color: 'var(--radar-text-secondary)', fontSize: 12, minWidth: 18 }}>{index + 1}</span>
              <Checkbox checked={layout.visibleKeys.includes(key)} onChange={(event) => toggleColumn(key, event.target.checked)} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{labelByKey.get(key)}</Checkbox>
            </div>)}
          </div>
        </section>
        <section style={{ padding: 14, marginTop: 12, border: '1px solid var(--radar-border-light)', background: 'var(--radar-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}><strong>可添加字段</strong><span style={{ color: 'var(--radar-text-secondary)', fontSize: 12 }}>每行三个字段</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            {candidates.filter((column) => !layout.orderedKeys.includes(columnKey(column))).map((column) => <label key={columnKey(column)} style={{ display: 'flex', alignItems: 'center', minWidth: 0, padding: '9px 10px', border: '1px solid var(--radar-border)', background: 'var(--radar-bg)', cursor: 'pointer' }}><Checkbox checked={false} onChange={(event) => toggleColumn(columnKey(column), event.target.checked)} style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{column.title}</Checkbox></label>)}
          </div>
        </section>
      </Modal>}
    </div>
  );
});

export default DataTable;

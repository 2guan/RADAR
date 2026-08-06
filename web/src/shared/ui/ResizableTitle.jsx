/**
 * 文件：web/src/shared/ui/ResizableTitle.jsx
 * 说明：实现可拖拽列宽的表格列头组件，基于 react-resizable 封装，提升复杂表格的可读性与交互性。
 * 用途：可拖拽调整宽度的表头单元格。基于原生指针事件实现列宽拖拽，无需额外依赖。
 * 作者：hengguan
 */

import { useRef } from 'react';

const MIN_COLUMN_WIDTH = 50;
const MAX_COLUMN_WIDTH = 800;

function normalizeColumnWidth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return MIN_COLUMN_WIDTH;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(numeric)));
}

export default function ResizableTitle(props) {
  const { onResize, width, ...rest } = props;
  const startX = useRef(0);
  const startW = useRef(0);
  const thRef = useRef(null);

  if (!onResize) return <th {...rest} />;

  const onPointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    startX.current = e.clientX;
    startW.current = normalizeColumnWidth(width || (thRef.current ? thRef.current.getBoundingClientRect().width : 0));
    const onMove = (ev) => {
      // 与个人列表偏好服务端校验保持同一边界，避免拖拽时提交 0–49 或小数宽度而报错。
      const next = normalizeColumnWidth(startW.current + (ev.clientX - startX.current));
      onResize(next);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  return (
    <th {...rest} ref={thRef} style={{ ...rest.style, position: 'relative' }}>
      {rest.children}
      <span
        onPointerDown={onPointerDown}
        style={{
          // 紧贴单元格右边缘内侧，不使用负 right 偏移：
          // 负偏移会让最后一列的拖拽手柄溢出表格 4px，在 Windows（占位滚动条）下
          // 触发整页/表格的横向滚动条，即便列表本可一屏显示。
          position: 'absolute', right: 0, top: 0, height: '100%', width: 8,
          cursor: 'col-resize', userSelect: 'none', touchAction: 'none', zIndex: 1,
        }}
      />
    </th>
  );
}

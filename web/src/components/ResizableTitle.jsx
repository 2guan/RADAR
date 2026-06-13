/**
 * 文件：components/ResizableTitle.jsx
 * 用途：可拖拽调整宽度的表头单元格。基于原生指针事件实现列宽拖拽，无需额外依赖。
 * 作者：hengguan
 * 说明：实现可拖拽列宽的表格列头组件，基于 react-resizable 封装，提升复杂表格的可读性与交互性。
 */

import React, { useRef } from 'react';

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
    startW.current = width || (thRef.current ? thRef.current.getBoundingClientRect().width : 0);
    const onMove = (ev) => {
      const next = Math.max(60, startW.current + (ev.clientX - startX.current));
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

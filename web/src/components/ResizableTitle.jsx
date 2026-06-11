/**
 * 文件：components/ResizableTitle.jsx
 * 用途：可拖拽调整宽度的表头单元格。基于原生指针事件实现列宽拖拽，无需额外依赖。
 * 作者：hengguan
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
          position: 'absolute', right: -4, top: 0, height: '100%', width: 8,
          cursor: 'col-resize', userSelect: 'none', touchAction: 'none', zIndex: 1,
        }}
      />
    </th>
  );
}

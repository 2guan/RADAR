/**
 * 文件：components/SignaturePad.jsx
 * 用途：网页端手写签名板。基于原生 canvas + 指针/触摸事件实现，无第三方依赖
 *       （等价于业界 signature_pad 的核心做法）。支持清除、判空、导出 PNG DataURL、载入图片。
 * 作者：hengguan
 * 说明：通过 ref 暴露 clear()/isEmpty()/getDataURL()/loadImage(dataUrl)；画布按容器宽度自适应。
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

const SignaturePad = forwardRef(function SignaturePad({ height = 150, invert = false }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const dirty = useRef(false);

  // 初始化画笔；按设备像素比设置画布分辨率，避免模糊
  useEffect(() => {
    const c = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(height * ratio);
    const ctx = c.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1f2937';
  }, [height]);

  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const start = (e) => { e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    dirty.current = true;
  };
  const end = () => { drawing.current = false; };

  useImperativeHandle(ref, () => ({
    clear: () => {
      const c = canvasRef.current;
      c.getContext('2d').clearRect(0, 0, c.width, c.height);
      dirty.current = false;
    },
    isEmpty: () => !dirty.current,
    getDataURL: () => (dirty.current ? canvasRef.current.toDataURL('image/png') : null),
    // 载入图片（上传场景）：等比缩放居中绘制到画布
    loadImage: (dataUrl) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = canvasRef.current;
        const ctx = c.getContext('2d');
        const ratio = window.devicePixelRatio || 1;
        const cw = c.width / ratio;
        const ch = c.height / ratio;
        ctx.clearRect(0, 0, c.width, c.height);
        const scale = Math.min(cw / img.width, ch / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
        dirty.current = true;
        resolve();
      };
      img.src = dataUrl;
    }),
  }));

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%', height, display: 'block',
        border: '1px dashed var(--radar-border)', borderRadius: 4,
        // 夜间模式：仅以 CSS 反色显示（笔触显浅色），canvas 像素与 toDataURL 仍为黑色笔迹
        background: invert ? '#e8e8e8' : 'var(--radar-surface)',
        filter: invert ? 'invert(1)' : 'none',
        touchAction: 'none', cursor: 'crosshair',
      }}
      onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
      onTouchStart={start} onTouchMove={move} onTouchEnd={end}
    />
  );
});

export default SignaturePad;

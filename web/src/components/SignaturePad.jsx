/**
 * 文件：components/SignaturePad.jsx
 * 用途：网页端手写签名板。基于原生 canvas + Pointer Events（统一鼠标/触摸/手写笔）实现，无第三方依赖
 *       （等价于业界 signature_pad 的核心做法）。支持清除、判空、导出 PNG DataURL、载入图片。
 * 作者：hengguan
 * 说明：坐标按「画布像素/显示尺寸」实时换算，修复移动端落笔与显示错位；监听 resize 重建画布并保留笔迹。
 *       笔触随书写速度变粗细（慢粗快细）并以二次贝塞尔平滑，形成笔锋与韵脚。
 *       通过 ref 暴露 clear()/isEmpty()/getDataURL()/loadImage(dataUrl)。
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// 笔触宽度区间（CSS 像素，绘制时再乘以设备像素比）
const BASE_W = 2.2;
const MIN_W = 1.0;
const MAX_W = 3.8;
const INK = '#1f2937';

const SignaturePad = forwardRef(function SignaturePad({ height = 150, invert = false }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const ratio = useRef(1);
  const lastPt = useRef(null);   // 上一个采样点 {x,y,t}（画布像素）
  const lastMid = useRef(null);  // 上一段中点
  const lastW = useRef(BASE_W);  // 上一段宽度（画布像素）

  // 依据「实际显示尺寸 × dpr」重建画布分辨率，保证内部分辨率与显示比例一致，并保留已有笔迹
  const setupCanvas = () => {
    const c = canvasRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (c.width === w && c.height === h) return; // 尺寸未变，避免重复重建
    ratio.current = dpr;
    const prev = dirty.current ? c.toDataURL() : null;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    if (prev) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height);
      img.src = prev;
    }
  };

  useEffect(() => {
    setupCanvas();
    // ResizeObserver：弹窗动画/布局稳定、容器宽度变化时重新同步分辨率（修复比例不一致）
    let ro;
    if (typeof ResizeObserver !== 'undefined' && canvasRef.current) {
      ro = new ResizeObserver(() => setupCanvas());
      ro.observe(canvasRef.current);
    }
    window.addEventListener('resize', setupCanvas);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', setupCanvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // 将指针位置实时换算为画布像素坐标（用实时 width 比例，避免容器尺寸变化导致错位）
  const pos = (e) => {
    const c = canvasRef.current;
    const r = c.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (c.width / r.width),
      y: (e.clientY - r.top) * (c.height / r.height),
      t: e.timeStamp || Date.now(),
    };
  };

  const down = (e) => {
    e.preventDefault();
    try { canvasRef.current.setPointerCapture?.(e.pointerId); } catch { /* 忽略 */ }
    drawing.current = true;
    const p = pos(e);
    lastPt.current = p;
    lastMid.current = { x: p.x, y: p.y };
    lastW.current = BASE_W * ratio.current;
    // 起笔圆点，形成圆润起锋
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(p.x, p.y, lastW.current / 2, 0, Math.PI * 2);
    ctx.fill();
    dirty.current = true;
  };

  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const c = canvasRef.current;
    const ctx = c.getContext('2d');
    const dpr = ratio.current;
    const p = pos(e);
    const prev = lastPt.current;
    const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
    const dt = Math.max(1, p.t - prev.t);
    const speed = (dist / dpr) / dt; // CSS 像素/毫秒
    // 速度越快越细：形成笔锋；再向上一段宽度平滑过渡，避免突变
    let target = MAX_W - speed * 2.4;
    target = Math.max(MIN_W, Math.min(MAX_W, target)) * dpr;
    const w = lastW.current * 0.5 + target * 0.5;
    const mid = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 };
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(lastMid.current.x, lastMid.current.y);
    ctx.quadraticCurveTo(prev.x, prev.y, mid.x, mid.y);
    ctx.stroke();
    lastMid.current = mid;
    lastPt.current = p;
    lastW.current = w;
    dirty.current = true;
  };

  const up = (e) => {
    if (!drawing.current) return;
    drawing.current = false;
    try { canvasRef.current.releasePointerCapture?.(e.pointerId); } catch { /* 忽略 */ }
  };

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
        ctx.clearRect(0, 0, c.width, c.height);
        const scale = Math.min(c.width / img.width, c.height / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
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
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={up}
      onPointerCancel={up}
    />
  );
});

export default SignaturePad;

/**
 * 文件：hooks/useResponsive.js
 * 用途：响应式断点 Hook。返回当前是否为移动端/平板，供列表"表格转卡片"等场景使用。
 * 作者：hengguan
 * 说明：断点 mobile < 768px ≤ pad < 1024px ≤ pc。
 */

import { useEffect, useState } from 'react';

export function useResponsive() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return {
    width,
    isMobile: width < 768,
    isPad: width >= 768 && width < 1024,
    isPC: width >= 1024,
  };
}

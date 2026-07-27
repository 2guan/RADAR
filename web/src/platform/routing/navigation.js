/**
 * 文件：web/src/platform/routing/navigation.js
 * 说明：详情页关闭时优先回到浏览器历史记录；直接访问详情链接时回退到指定安全首页。
 * 用途：提供跨业务模块复用的返回导航 Hook。
 * 作者：hengguan
 */

import { useNavigate } from 'react-router-dom';

/** 返回上一步；缺少历史记录时回到调用方指定的稳定路径。 */
export function useBackNavigation(fallbackPath = '/') {
  const navigate = useNavigate();

  return () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(fallbackPath);
  };
}

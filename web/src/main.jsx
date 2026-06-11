/**
 * 文件：main.jsx
 * 用途：前端应用渲染入口。挂载 React 根、注入 AntD 中文 ConfigProvider，
 *       根据 配色预设 + 明暗模式 同步 AntD token 与 CSS 变量。
 * 作者：hengguan
 */

import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme as antdTheme, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useAppStore } from './stores/app.js';
import { getPreset } from './theme/presets.js';
import AppRouter from './app.jsx';
import './styles.css';

dayjs.locale('zh-cn');

const FONT = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";

/**
 * 根组件：清爽明快多预设配色 + 明暗模式。
 */
function Root() {
  const themeMode = useAppStore((s) => s.theme);
  const presetKey = useAppStore((s) => s.preset);
  const preset = getPreset(presetKey);
  const primary = preset.primary;
  const isDark = themeMode === 'dark';

  // 同步 CSS 变量（供 styles.css 使用）
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--radar-primary', primary);
    root.style.setProperty('--radar-primary-deep', preset.primaryDeep);
    root.style.setProperty('--radar-primary-fade', primary + (isDark ? '2e' : '1f'));
    root.style.setProperty('--radar-primary-soft', primary + (isDark ? '22' : '14'));
    root.style.setProperty('--radar-text-secondary', isDark ? '#9aa3b2' : '#64748b');
    root.style.setProperty('--radar-surface', isDark ? '#1a2030' : '#ffffff');
    root.style.setProperty('--radar-ink', isDark ? '#e6e8ef' : '#1e2330');
    root.style.setProperty('--radar-border', isDark ? '#2a3346' : '#e8ebf2');
    root.style.setProperty('--radar-blob1', preset.blob1);
    root.style.setProperty('--radar-blob2', preset.blob2);
    // 页面底色与侧栏一致（白/深），不带主题色
    root.style.setProperty('--radar-bg', isDark ? '#1a2030' : '#ffffff');
    // 卡片/侧栏/顶栏 实色表面（无磨玻璃）
    root.style.setProperty('--radar-card-shadow', isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 12px rgba(31,45,80,0.06)');
    root.style.colorScheme = themeMode;
  }, [primary, preset, isDark, themeMode]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: primary,
          colorInfo: primary,
          colorSuccess: '#16A34A',
          colorWarning: '#F59E0B',
          colorError: '#DC2626',
          colorLink: primary,
          // 直角风格：卡片/弹窗等大容器 0 圆角，小控件保留极小圆角更显专业
          borderRadius: 2,
          borderRadiusLG: 0,
          borderRadiusSM: 2,
          borderRadiusXS: 0,
          fontSize: 14,
          fontFamily: FONT,
          wireframe: false,
        },
        components: {
          // 实色表面：背景由内容区渐变 + 实色卡片承载
          Card: { borderRadiusLG: 0, colorBgContainer: 'var(--radar-surface)' },
          Layout: { headerHeight: 60, headerBg: 'var(--radar-surface)', bodyBg: 'transparent', siderBg: 'var(--radar-surface)' },
          Menu: {
            itemBg: 'transparent', subMenuItemBg: 'transparent',
            itemSelectedBg: 'var(--radar-primary-soft)', itemSelectedColor: primary,
            itemBorderRadius: 0, itemHeight: 44, itemMarginInline: 8,
            darkItemBg: 'transparent', darkSubMenuItemBg: 'transparent',
            darkItemSelectedBg: 'var(--radar-primary-soft)', darkItemSelectedColor: '#fff',
          },
          Table: {
            headerBg: isDark ? 'rgba(255,255,255,0.03)' : '#f7f9fc',
            headerColor: isDark ? '#9aa3b2' : '#64748b',
            cellPaddingBlock: 12,
            rowHoverBg: 'var(--radar-primary-soft)',
          },
          Modal: { titleFontSize: 17 },
          Button: { fontWeight: 500, primaryShadow: 'none' },
          Tabs: { inkBarColor: primary, itemSelectedColor: primary },
          Statistic: { contentFontSize: 30 },
        },
      }}
    >
      <AntdApp>
        <AppRouter />
      </AntdApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);

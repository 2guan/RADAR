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
  const isDark = themeMode === 'dark';

  const colors = isDark ? preset.dark : preset.light;
  const primary = colors.primary;

  // 同步 CSS 变量（供 styles.css 使用）
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--radar-primary', primary);
    root.style.setProperty('--radar-primary-deep', colors.primaryDeep);
    root.style.setProperty('--radar-primary-fade', primary + (isDark ? '4d' : '3d'));
    root.style.setProperty('--radar-primary-soft', primary + (isDark ? '2e' : '22'));

    // 注入高亮色与强调色及变体
    const highlight = colors.highlight;
    const accent = colors.accent;
    root.style.setProperty('--radar-highlight', highlight);
    root.style.setProperty('--radar-highlight-fade', highlight + (isDark ? '4d' : '3d'));
    root.style.setProperty('--radar-highlight-soft', highlight + (isDark ? '2e' : '22'));
    root.style.setProperty('--radar-accent', accent);
    root.style.setProperty('--radar-accent-fade', accent + (isDark ? '4d' : '3d'));
    root.style.setProperty('--radar-accent-soft', accent + (isDark ? '2e' : '22'));

    // 注入状态色及变体
    const statusInitial = colors.statusInitial;
    const statusInProgress = colors.statusInProgress;
    const statusFinal = colors.statusFinal;

    root.style.setProperty('--radar-status-initial', statusInitial);
    root.style.setProperty('--radar-status-initial-fade', statusInitial + (isDark ? '4d' : '3d'));
    root.style.setProperty('--radar-status-initial-soft', statusInitial + (isDark ? '2e' : '22'));

    root.style.setProperty('--radar-status-in-progress', statusInProgress);
    root.style.setProperty('--radar-status-in-progress-fade', statusInProgress + (isDark ? '4d' : '3d'));
    root.style.setProperty('--radar-status-in-progress-soft', statusInProgress + (isDark ? '2e' : '22'));

    root.style.setProperty('--radar-status-final', statusFinal);
    root.style.setProperty('--radar-status-final-fade', statusFinal + (isDark ? '4d' : '3d'));
    root.style.setProperty('--radar-status-final-soft', statusFinal + (isDark ? '2e' : '22'));

    root.style.setProperty('--radar-text-secondary', isDark ? '#9aa3b2' : '#64748b');
    root.style.setProperty('--radar-surface', colors.surface);
    root.style.setProperty('--radar-ink', isDark ? '#e6e8ef' : '#1e2330');
    root.style.setProperty('--radar-border', colors.border);
    root.style.setProperty('--radar-blob1', colors.blob1);
    root.style.setProperty('--radar-blob2', colors.blob2);
    // 页面底色与侧栏一致，跟随主题变化
    root.style.setProperty('--radar-bg', colors.bgSolid);
    root.style.setProperty('--radar-bg-gradient', isDark ? preset.bgDark : preset.bgLight);
    // 登录背景基础底色渐变，在暗黑模式下使用深色渐变
    root.style.setProperty('--radar-login-bg-base', isDark ? 'linear-gradient(135deg, #0b0f19, #080c14, #05070a)' : 'linear-gradient(135deg, #eef3fb, #e7eefb, #eaf2ff)');
    // 卡片/侧栏/顶栏 实色表面（无磨玻璃）
    root.style.setProperty('--radar-card-shadow', isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 12px rgba(31,45,80,0.06)');
    root.style.colorScheme = themeMode;
  }, [primary, colors, isDark, themeMode]);

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
            // 表格底色与背景色一致，避免纯黑色
            colorBgContainer: 'var(--radar-bg)',
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

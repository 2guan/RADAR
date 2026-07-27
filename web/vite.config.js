/**
 * 文件：web/vite.config.js
 * 说明：遵循项目研发规约；跨模块能力仅可经公开契约访问。
 * 用途：Vite 构建配置。配置 React 插件、开发服务器代理（/api 转后端）、构建产物目录。
 * 作者：hengguan
 */

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function intEnv(value, fallback) {
  const parsed = parseInt(value || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: intEnv(env.VITE_DEV_PORT, 5173),
      proxy: {
        '/api': { target: env.VITE_API_PROXY_TARGET || 'http://localhost:3000', changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: intEnv(env.VITE_CHUNK_SIZE_WARNING_LIMIT, 1500),
      rollupOptions: {
        output: {
          // 将稳定的大型依赖拆分为可长期缓存的供应商块，业务页面升级不会重复下载它们。
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-antd': ['antd', '@ant-design/icons'],
            'vendor-echarts': ['echarts', 'echarts-for-react'],
          },
        },
      },
    },
  };
});

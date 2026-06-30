/**
 * 文件：vite.config.js
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
    },
  };
});

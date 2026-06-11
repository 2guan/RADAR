/**
 * 文件：vite.config.js
 * 用途：Vite 构建配置。配置 React 插件、开发服务器代理（/api 转后端）、构建产物目录。
 * 作者：hengguan
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 开发模式下将 /api 代理到后端，避免跨域
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// dev: vite 5173，/api 代理到后端 3000；build: 产物入 dist/，由 Hono serveStatic 托管。
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:3000' } },
});

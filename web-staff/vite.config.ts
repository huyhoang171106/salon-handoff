import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// /api được chuyển tiếp sang backend NestJS khi chạy dev
export default defineConfig({
  plugins: [react()],
  server: { port: 5174, proxy: { '/api': 'http://localhost:3000' } },
});

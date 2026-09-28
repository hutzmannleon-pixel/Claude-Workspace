import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = { target: 'http://localhost:3000', changeOrigin: false };
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': api, '/aktivieren': api } },
  build: { outDir: 'dist', emptyOutDir: true }
});

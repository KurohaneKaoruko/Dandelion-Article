import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/client',
  plugins: [react()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // 前端开发服务器把 API 请求转发到 wrangler dev
      '/api': 'http://127.0.0.1:8787',
    },
  },
})

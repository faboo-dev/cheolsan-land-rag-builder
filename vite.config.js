import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 프론트엔드 소스만 포함
  root: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      // 백엔드 파일 제외
      external: [
        'express',
        'cors',
        '@supabase/supabase-js',
        '@google/generative-ai',
        'fs',
        'path',
        /^node:.*/
      ],
      // entry point 명시 (server.js 제외)
      input: {
        main: './index.html'
      }
    }
  },
  // server.js를 모듈로 인식하지 않도록
  optimizeDeps: {
    exclude: ['server.js']
  }
})

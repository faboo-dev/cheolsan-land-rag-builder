import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      // server.js와 백엔드 패키지를 빌드에서 제외
      external: [
        'express',
        'cors',
        '@supabase/supabase-js',
        '@google/generative-ai',
        'fs',
        'path'
      ]
    }
  }
})

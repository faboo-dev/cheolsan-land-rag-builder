import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // This ensures process.env.API_KEY is available in the browser code
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      // Admin Password Configuration
      'process.env.ADMIN_PASSWORD': JSON.stringify(env.ADMIN_PASSWORD || '2126asqw!@')
    }
  };
});

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    publicDir: 'static',
    // Expose only the public API URL; cloud credentials remain server-side.
    define: { 'process.env.REACT_APP_API_URL': JSON.stringify(env.REACT_APP_API_URL || '/api') },
    server: {
      host: 'localhost', port: Number(env.PORT || 3000), strictPort: true,
      watch: { ignored: ['**/build/**', '**/test-results/**'] },
      proxy: { '/api': { target: `http://127.0.0.1:${env.API_PORT || 5000}`, changeOrigin: true } },
    },
    preview: {
      host: 'localhost', port: Number(env.PORT || 3000), strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${env.API_PORT || 5000}`, changeOrigin: true } },
    },
    build: { outDir: 'build', sourcemap: false },
  };
});
